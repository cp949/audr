// 편집 계산을 순수 함수로 모은 모듈.
// 구간(start, end)은 모두 0~1 비율이다.
import { dropEveryOtherSample, type SoundBuffer } from "./audioUtil";

/** 비율을 샘플 인덱스로 바꾼다 (내림). */
function toIndex(ratio: number, length: number): number {
  return Math.floor(ratio * length);
}

/** 빈 결과는 OfflineAudioContext가 길이 0을 허용하지 않아 길이 1의 무음으로 대신한다. */
function nonEmpty(samples: Float32Array): Float32Array {
  return samples.length === 0 ? new Float32Array(1) : samples;
}

/** 선택 구간을 지운다. 결과가 비면 `new Float32Array(1)`이다. */
export function deleteRange(samples: Float32Array, start: number, end: number): Float32Array {
  const firstPart = samples.slice(0, toIndex(start, samples.length));
  const secondPart = samples.slice(toIndex(end, samples.length), samples.length);
  const result = new Float32Array(firstPart.length + secondPart.length);
  result.set(firstPart, 0);
  result.set(secondPart, firstPart.length);
  return nonEmpty(result);
}

/** 선택 구간만 남기고 나머지를 지운다 (Shift+Delete). 결과가 비면 `new Float32Array(1)`이다. */
export function keepRange(samples: Float32Array, start: number, end: number): Float32Array {
  return nonEmpty(samples.slice(toIndex(start, samples.length), toIndex(end, samples.length)));
}

/** 선택 구간을 복사한다 (copy). */
export function sliceRange(samples: Float32Array, start: number, end: number): Float32Array {
  return samples.slice(start * samples.length, end * samples.length);
}

/**
 * 클립을 붙여 넣는다.
 * - 선택이 없으면(null) 끝에 붙이고 trim은 null이다.
 * - 선택이 있으면 그 구간을 클립으로 교체하고, 붙여 넣은 구간의 비율을 trim으로 돌려준다.
 * 샘플레이트가 다른 클립은 거부한다. 호출자가 먼저 `resample`해야 한다.
 */
export function pasteClip(
  target: SoundBuffer,
  clip: SoundBuffer,
  start: number | null,
  end: number | null,
): { samples: Float32Array; trimStart: number | null; trimEnd: number | null } {
  if (clip.sampleRate !== target.sampleRate) {
    throw new Error(
      `sampleRate가 다른 클립은 붙일 수 없다: ${clip.sampleRate} !== ${target.sampleRate}`,
    );
  }
  const { samples } = target;
  if (start === null || end === null) {
    const result = new Float32Array(samples.length + clip.samples.length);
    result.set(samples, 0);
    result.set(clip.samples, samples.length);
    return { samples: result, trimStart: null, trimEnd: null };
  }
  const startSamples = start * samples.length;
  const endSamples = end * samples.length;
  const firstPart = samples.slice(0, startSamples);
  const lastPart = samples.slice(endSamples);
  const result = new Float32Array(firstPart.length + clip.samples.length + lastPart.length);
  result.set(firstPart, 0);
  result.set(clip.samples, firstPart.length);
  result.set(lastPart, firstPart.length + clip.samples.length);

  const startSeconds = startSamples / target.sampleRate;
  const endSeconds = startSeconds + clip.samples.length / clip.sampleRate;
  const newDurationSeconds = result.length / clip.sampleRate;
  return {
    samples: result,
    trimStart: startSeconds / newDurationSeconds,
    trimEnd: endSeconds / newDurationSeconds,
  };
}

type OfflineContextConstructor = new (
  channels: number,
  length: number,
  sampleRate: number,
) => OfflineAudioContext;

/**
 * 버퍼를 새 샘플레이트로 리샘플한다. OfflineAudioContext로 렌더링한다.
 * 생성자가 없거나 지원하지 않는 rate로 던지면, rate가 절반일 때만 dropEveryOtherSample로 대신하고
 * 그 외에는 reject한다 (예: Safari의 webkitOfflineAudioContext는 44kHz 미만을 지원하지 않는다).
 */
export function resample(buffer: SoundBuffer, rate: number): Promise<SoundBuffer> {
  return new Promise((resolve, reject) => {
    const sampleRateRatio = rate / buffer.sampleRate;
    const newLength = Math.floor(sampleRateRatio * buffer.samples.length);
    let offlineContext: OfflineAudioContext;
    try {
      const g = globalThis as unknown as {
        OfflineAudioContext?: OfflineContextConstructor;
        webkitOfflineAudioContext?: OfflineContextConstructor;
      };
      const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
      if (!Ctor) throw new Error("OfflineAudioContext를 쓸 수 없다");
      offlineContext = new Ctor(1, newLength, rate);
    } catch {
      if (rate === buffer.sampleRate / 2) {
        return resolve(dropEveryOtherSample(buffer));
      }
      return reject(new Error("Could not resample"));
    }
    const source = offlineContext.createBufferSource();
    const audioBuffer = offlineContext.createBuffer(1, buffer.samples.length, buffer.sampleRate);
    audioBuffer.getChannelData(0).set(buffer.samples);
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    // webkit 접두사 구현은 Promise를 돌려주지 않으므로 oncomplete를 먼저 건다
    offlineContext.oncomplete = ({ renderedBuffer }) => {
      resolve({ samples: renderedBuffer.getChannelData(0), sampleRate: rate });
    };
    const rendering = offlineContext.startRendering() as Promise<AudioBuffer> | undefined;
    rendering?.catch(reject);
  });
}
