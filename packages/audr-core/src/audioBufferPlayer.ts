import { getSharedAudioContext } from "./sharedAudioContext";

export class AudioBufferPlayer {
  readonly buffer: AudioBuffer;
  private readonly audioContext: AudioContext;
  private source: AudioBufferSourceNode | null = null;
  // 재생을 시작한 AudioContext 시각(초). 벽시계(Date.now)는 컨텍스트가 suspended여도 흘러서 쓰지 않는다.
  private startTime = 0;
  private trimStart = 0;
  private trimEnd = 1;
  private updateCallback: ((playhead: number) => void) | null = null;
  // stop()이나 새 play()가 이전 재생의 프레임 루프를 끊는 데 쓴다
  private playId = 0;

  constructor(samples: Float32Array, sampleRate: number, ctx?: AudioContext) {
    this.audioContext = ctx ?? getSharedAudioContext();
    this.buffer = this.audioContext.createBuffer(1, samples.length, sampleRate);
    this.buffer.getChannelData(0).set(samples);
  }

  /** trim 구간(0~1 비율)을 재생한다. onUpdate는 프레임마다 재생 위치(0~1)를, onEnded는 끝까지 재생됐을 때만 호출된다. */
  play(
    trimStart: number,
    trimEnd: number,
    onUpdate: (playhead: number) => void,
    onEnded: () => void,
  ): void {
    this.updateCallback = onUpdate;
    this.trimStart = trimStart;
    this.trimEnd = trimEnd;
    this.startTime = this.audioContext.currentTime;
    const id = ++this.playId;

    const trimStartTime = this.buffer.duration * trimStart;
    const trimmedDuration = this.buffer.duration * trimEnd - trimStartTime;

    const source = this.audioContext.createBufferSource();
    source.onended = onEnded;
    source.buffer = this.buffer;
    source.connect(this.audioContext.destination);
    source.start(0, trimStartTime, trimmedDuration);
    this.source = source;

    this.update(id);
  }

  private update(id: number): void {
    if (id !== this.playId || !this.updateCallback) return;
    const timeSinceStart = this.audioContext.currentTime - this.startTime;
    const percentage = timeSinceStart / this.buffer.duration;
    if (percentage + this.trimStart < this.trimEnd && this.source?.onended) {
      requestAnimationFrame(() => this.update(id));
      this.updateCallback(percentage + this.trimStart);
    } else {
      this.updateCallback = null;
    }
  }

  /** 재생을 멈춘다. onEnded는 호출되지 않는다. 여러 번 호출해도 안전하다. */
  stop(): void {
    this.playId++;
    if (this.source) {
      this.source.onended = null; // 직접 멈출 때는 onEnded를 부르지 않는다
      try {
        this.source.stop();
      } catch {
        // Safari는 stop을 두 번 부르면 던진다. 명세는 허용하는 동작이다:
        // https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode
      }
    }
  }
}
