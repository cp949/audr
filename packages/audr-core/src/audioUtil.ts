/** 모노 샘플과 샘플레이트 */
export type SoundBuffer = {
  samples: Float32Array;
  sampleRate: number;
};

/** 인코딩 결과 바이트 상한 (10MB) */
const SOUND_BYTE_LIMIT = 10 * 1000 * 1000;

/**
 * 샘플의 RMS를 구한다. scaling으로 나눈 뒤 제곱근을 한 번 더 취해 작은 소리도 보이게 한다.
 * 출처: https://github.com/Tonejs/Tone.js/blob/master/Tone/component/Meter.js#L88
 */
export function computeRMS(samples: Float32Array, scaling = 0.55): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] as number;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / samples.length);
  const val = rms / scaling;
  return Math.sqrt(val);
}

/** 샘플을 chunkSize 단위로 나눠 청크별 RMS 배열을 돌려준다. */
export function computeChunkedRMS(samples: Float32Array, chunkSize = 1024): number[] {
  const sampleCount = samples.length;
  const chunkLevels: number[] = [];
  for (let i = 0; i < sampleCount; i += chunkSize) {
    const maxIndex = Math.min(sampleCount, i + chunkSize);
    // computeRMS는 읽기만 하므로 사본을 만들지 않고 같은 버퍼의 뷰를 넘긴다
    chunkLevels.push(computeRMS(samples.subarray(i, maxIndex)));
  }
  return chunkLevels;
}

/**
 * 청크별 RMS로 소리가 있는 구간을 찾아 자동 trim(0~1)을 계산한다.
 * 최댓값의 1/8을 넘는 첫·마지막 청크의 번호(1부터)를 청크 개수로 나눠 비율로 바꾸고, 앞뒤로 2청크 여유를 둔다.
 *
 * - 넘는 청크가 없으면(무음, 빈 입력) 전체(0, 1)를 돌려준다.
 * - 청크가 아주 적어 시작이 끝보다 크거나 같아지면 전체(0, 1)를 돌려준다.
 */
export function computeAutoTrim(chunkLevels: number[]): { trimStart: number; trimEnd: number } {
  const threshold = Math.max(...chunkLevels) / 8;

  let firstChunkAboveThreshold: number | null = null;
  let lastChunkAboveThreshold: number | null = null;
  for (let i = 0; i < chunkLevels.length; i++) {
    if ((chunkLevels[i] as number) > threshold) {
      if (firstChunkAboveThreshold === null) firstChunkAboveThreshold = i + 1;
      lastChunkAboveThreshold = i + 1;
    }
  }

  const chunkCount = chunkLevels.length;
  let trimStart = 0;
  let trimEnd = 1;
  if (firstChunkAboveThreshold !== null && lastChunkAboveThreshold !== null) {
    trimStart = Math.max(2, firstChunkAboveThreshold - 2) / chunkCount;
    trimEnd = Math.min(chunkCount - 2, lastChunkAboveThreshold + 2) / chunkCount;
  }

  // With very few samples, the automatic trimming can produce invalid values
  if (trimStart >= trimEnd) return { trimStart: 0, trimEnd: 1 };
  return { trimStart, trimEnd };
}

/** 원래 샘플레이트 그대로 16비트로 인코딩해도 한도 안에 드는지 본다. */
function fitsAsIs(sampleCount: number) {
  return sampleCount * 2 < SOUND_BYTE_LIMIT;
}

/** 22050Hz로 줄여 16비트로 인코딩하면 한도 안에 드는지 본다. */
function fitsAt22050(sampleCount: number, sampleRate: number) {
  return (sampleCount / sampleRate) * 22050 * 2 < SOUND_BYTE_LIMIT;
}

/**
 * downsampleIfNeeded가 편집을 받아들이는 최대 샘플 수. 녹음 길이 한도로 쓴다.
 * 44100Hz 기준 9,999,999샘플(약 226.8초)이다.
 */
export function maxEditableSamples(sampleRate: number): number {
  const asIs = Math.ceil(SOUND_BYTE_LIMIT / 2) - 1;
  let downsampled = Math.ceil((SOUND_BYTE_LIMIT * sampleRate) / (22050 * 2)) - 1;
  // 부동소수 오차로 경계가 1샘플 어긋날 수 있어 downsampleIfNeeded와 같은 식으로 맞춘다
  while (downsampled > 0 && !fitsAt22050(downsampled, sampleRate)) downsampled--;
  while (fitsAt22050(downsampled + 1, sampleRate)) downsampled++;
  return Math.max(asIs, downsampled);
}

/**
 * 인코딩 크기가 SOUND_BYTE_LIMIT을 넘으면 22050Hz로 다운샘플해 줄인다.
 * 22050Hz로도 넘으면 편집을 거부(reject)한다.
 */
export function downsampleIfNeeded(
  buffer: SoundBuffer,
  resampler: (b: SoundBuffer, rate: number) => Promise<SoundBuffer>,
): Promise<SoundBuffer> {
  const { samples, sampleRate } = buffer;
  if (fitsAsIs(samples.length)) {
    return Promise.resolve({ samples, sampleRate });
  }
  if (fitsAt22050(samples.length, sampleRate)) {
    return resampler({ samples, sampleRate }, 22050);
  }
  // 22kHz로도 저장할 수 없다. 추가 압축은 지원하지 않는다.
  return Promise.reject(new Error("Sound too large to save, refusing to edit"));
}

/** 샘플을 하나씩 건너뛰어 절반 샘플레이트로 만든다. 리샘플이 불가능할 때의 최후 수단이다. */
export function dropEveryOtherSample(buffer: SoundBuffer): SoundBuffer {
  const newLength = Math.floor(buffer.samples.length / 2);
  const newSamples = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    newSamples[i] = buffer.samples[i * 2] as number;
  }
  return { samples: newSamples, sampleRate: buffer.sampleRate / 2 };
}
