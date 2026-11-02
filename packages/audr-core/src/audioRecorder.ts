// 마이크는 navigator.mediaDevices.getUserMedia로 연다.
import { computeAutoTrim, computeChunkedRMS, computeRMS, maxEditableSamples } from "./audioUtil";
import { assertMicrophoneAvailable, MicrophoneError, toMicrophoneError } from "./microphoneError";
import { getSharedAudioContext } from "./sharedAudioContext";

export type RecordingResult = {
  levels: number[];
  samples: Float32Array;
  sampleRate: number;
  trimStart: number;
  trimEnd: number;
};

export class AudioRecorder {
  private readonly audioContext: AudioContext;
  private readonly bufferLength = 8192;

  private userMediaStream: MediaStream | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private sourceNode: GainNode | null = null;
  private scriptProcessorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  private recording = false;
  private started = false;
  private buffers: Float32Array[] = [];
  private recordedLength = 0;
  private disposed = false;
  /** 이보다 길면 에디터가 편집을 거부하므로 여기서 녹음을 멈춘다 */
  private readonly maxSamples: number;
  private onLimitReached: (() => void) | null = null;
  /** 마이크 트랙에 건 ended 리스너. dispose에서 같은 함수로 제거한다 */
  private trackListeners: Array<{ track: MediaStreamTrack; listener: () => void }> = [];

  constructor(ctx?: AudioContext) {
    this.audioContext = ctx ?? getSharedAudioContext();
    this.maxSamples = maxEditableSamples(this.audioContext.sampleRate);
  }

  /**
   * 지금까지 모은 녹음 길이(초). 8192샘플 버퍼가 도착할 때마다 늘어난다.
   * 녹음기가 쓰는 AudioContext의 샘플레이트로 계산한다.
   */
  get recordedSeconds(): number {
    return this.recordedLength / this.audioContext.sampleRate;
  }

  /** 편집 한도(maxEditableSamples)에 해당하는 녹음 길이 상한(초). 이 길이에 닿으면 자동으로 멈춘다. */
  get maxRecordingSeconds(): number {
    return this.maxSamples / this.audioContext.sampleRate;
  }

  /**
   * 마이크를 열고 입력 레벨을 onUpdate로 알린다.
   * 실패하면 원인 code를 가진 MicrophoneError로 onError를 부른다. 열기 전 사전 검사 실패도 같다.
   * 마이크가 열린 뒤 입력이 끊기면(분리, 권한 회수) code `track-ended`로 부른다.
   * 어느 경우든 onError는 많아야 한 번 불리고, dispose 뒤에는 불리지 않는다.
   */
  startListening(
    onStarted: () => void,
    onUpdate: (level: number) => void,
    onError: (error: MicrophoneError) => void,
  ): void {
    const fail = (e: unknown) => {
      if (!this.disposed) onError(toMicrophoneError(e));
    };
    try {
      assertMicrophoneAvailable();
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((userMediaStream) => {
          if (this.disposed) {
            // dispose 뒤에 도착한 스트림은 쓰지 않고 바로 해제한다
            userMediaStream.getTracks().forEach((track) => track.stop());
            return;
          }
          this.started = true;
          onStarted();
          this.attachUserMediaStream(userMediaStream, onUpdate, onError);
        })
        .catch(fail);
    } catch (e) {
      fail(e);
    }
  }

  /**
   * 녹음을 시작한다. 녹음 길이가 편집 한도(maxEditableSamples)에 닿으면
   * 저장을 멈추고 onLimitReached를 한 번 부른다. 호출하는 쪽은 여기서 stop()을 부르면 된다.
   */
  startRecording(onLimitReached?: () => void): void {
    this.recording = true;
    this.onLimitReached = onLimitReached ?? null;
  }

  /** 한도까지만 복사해 쌓는다. 한도에 닿으면 녹음을 끄고 알린다. */
  private collect(input: Float32Array) {
    const take = Math.min(this.maxSamples - this.recordedLength, input.length);
    this.buffers.push(new Float32Array(input.subarray(0, take)));
    this.recordedLength += take;
    if (this.recordedLength < this.maxSamples) return;
    this.recording = false;
    const notify = this.onLimitReached;
    this.onLimitReached = null;
    notify?.();
  }

  private attachUserMediaStream(
    userMediaStream: MediaStream,
    onUpdate: (level: number) => void,
    onError: (error: MicrophoneError) => void,
  ) {
    this.userMediaStream = userMediaStream;
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(userMediaStream);
    this.sourceNode = this.audioContext.createGain();
    this.scriptProcessorNode = this.audioContext.createScriptProcessor(this.bufferLength, 1, 1);

    this.scriptProcessorNode.onaudioprocess = (processEvent) => {
      if (this.recording && !this.disposed) {
        this.collect(processEvent.inputBuffer.getChannelData(0));
      }
    };

    const analyserNode = this.audioContext.createAnalyser();
    this.analyserNode = analyserNode;
    analyserNode.fftSize = 2048;

    const dataArray = new Float32Array(analyserNode.frequencyBinCount);

    const update = () => {
      if (this.disposed) return;
      analyserNode.getFloatTimeDomainData(dataArray);
      onUpdate(computeRMS(dataArray));
      requestAnimationFrame(update);
    };

    requestAnimationFrame(update);

    // Wire everything together, ending in the destination
    this.mediaStreamSource.connect(this.sourceNode);
    this.sourceNode.connect(analyserNode);
    analyserNode.connect(this.scriptProcessorNode);
    this.scriptProcessorNode.connect(this.audioContext.destination);

    // 연결이 끝난 뒤에 건다. 위에서 노드 생성이 던지면 그 실패가 이미 onError로 가므로,
    // 리스너가 먼저 걸려 있으면 나중의 ended가 onError를 한 번 더 부른다
    this.watchTrackEnded(userMediaStream, onError);
  }

  /**
   * 오디오 트랙이 끊기면 녹음 저장을 멈추고 track-ended로 한 번 알린다.
   * 끊긴 마이크의 ScriptProcessor는 무음 버퍼를 계속 보내므로 `recording`을 꺼서 쌓이지 않게 한다.
   * 그때까지 쌓은 버퍼는 `stop()`으로 꺼낼 수 있다.
   */
  private watchTrackEnded(stream: MediaStream, onError: (error: MicrophoneError) => void) {
    let reported = false;
    const listener = () => {
      if (this.disposed || reported) return;
      reported = true;
      this.recording = false;
      this.onLimitReached = null;
      onError(new MicrophoneError("track-ended", "마이크 입력이 끊겼다"));
    };
    for (const track of stream.getAudioTracks()) {
      track.addEventListener("ended", listener);
      this.trackListeners.push({ track, listener });
    }
  }

  /**
   * 녹음된 버퍼를 하나로 합치고 소리가 있는 구간으로 자동 trim(0~1)을 계산한다.
   * trim 계산 규칙은 `computeAutoTrim`을 따른다.
   */
  stop(): RecordingResult {
    // 한도에서 자른 마지막 버퍼는 bufferLength보다 짧다
    const buffer = new Float32Array(this.recordedLength);

    let offset = 0;
    for (const bufferChunk of this.buffers) {
      buffer.set(bufferChunk, offset);
      offset += bufferChunk.length;
    }

    const chunkLevels = computeChunkedRMS(buffer);
    const { trimStart, trimEnd } = computeAutoTrim(chunkLevels);

    return {
      levels: chunkLevels,
      samples: buffer,
      sampleRate: this.audioContext.sampleRate,
      trimStart,
      trimEnd,
    };
  }

  /** 노드를 끊고 마이크를 해제한다. 이후 콜백은 호출되지 않는다. 시작 전에 불러도 안전하다. */
  dispose(): void {
    if (this.started) {
      for (const { track, listener } of this.trackListeners) {
        track.removeEventListener("ended", listener);
      }
      this.trackListeners = [];
      if (this.scriptProcessorNode) {
        this.scriptProcessorNode.onaudioprocess = null;
        this.scriptProcessorNode.disconnect();
      }
      this.analyserNode?.disconnect();
      this.sourceNode?.disconnect();
      this.mediaStreamSource?.disconnect();
      this.userMediaStream?.getTracks().forEach((track) => track.stop());
    }
    this.disposed = true;
  }
}
