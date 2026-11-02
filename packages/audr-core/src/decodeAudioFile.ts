import type { SoundBuffer } from "./audioUtil";
import { getSharedAudioContext } from "./sharedAudioContext";

/**
 * Blob 바이트를 읽는다. `Blob.prototype.arrayBuffer`는 Chrome 76부터 있어서,
 * 없으면 `Response`(Chrome 42)로 대신 읽는다. 라이브러리라 전역 polyfill은 넣지 않는다.
 */
function readBlobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Response(blob).arrayBuffer();
}

/**
 * 오디오 파일(wav, mp3, ogg 등 브라우저가 디코드하는 형식)을 모노 `SoundBuffer`로 바꾼다.
 *
 * - 다채널은 채널 평균으로 모노로 합친다. 입력이 [-1, 1] 안이면 결과도 그 안에 있다.
 * - 반환 `sampleRate`는 파일의 원래 레이트가 아니라 공유 `AudioContext`의 레이트다.
 *   `decodeAudioData`가 컨텍스트 레이트로 리샘플한 결과를 주기 때문이다(장치에 따라 44100 또는 48000).
 * - 디코드 실패는 브라우저가 던지는 오류를 그대로 reject한다.
 */
export async function decodeAudioFile(file: Blob): Promise<SoundBuffer> {
  const ctx = getSharedAudioContext();
  const decoded = await ctx.decodeAudioData(await readBlobBytes(file));
  const { length, numberOfChannels } = decoded;
  const samples = new Float32Array(length);
  for (let c = 0; c < numberOfChannels; c++) {
    const channel = decoded.getChannelData(c);
    // 채널이 buffer.length보다 짧으면 모자란 샘플은 0으로 본다
    const count = Math.min(length, channel.length);
    for (let i = 0; i < count; i++) samples[i] += channel[i] as number;
  }
  if (numberOfChannels > 1) {
    for (let i = 0; i < length; i++) samples[i] = (samples[i] as number) / numberOfChannels;
  }
  return { samples, sampleRate: ctx.sampleRate };
}
