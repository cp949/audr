/**
 * Float32Array PCM 샘플을 WAV 16-bit PCM little-endian으로 인코딩한다.
 * NaN/Infinity 처리, clamp, 헤더 작성을 이 모듈이 담당한다.
 */

/** WAV RIFF 청크 헤더 크기 (44바이트 고정) */
const WAV_HEADER_SIZE = 44;

/**
 * 비정상 부동소수점 값을 정규화한다.
 * NaN은 0, Infinity는 1, -Infinity는 -1로 처리한다.
 */
function normalizeSample(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (!Number.isFinite(value)) return value > 0 ? 1 : -1;
  return value;
}

/**
 * Float32 샘플 하나를 [-1, 1] clamp 후 16-bit PCM 정수로 변환한다.
 * clamp 범위는 -32768 ~ 32767이다.
 */
function floatToInt16(value: number): number {
  const clamped = Math.max(-1, Math.min(1, normalizeSample(value)));
  return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
}

/**
 * WAV 44바이트 RIFF 헤더를 DataView에 기록한다.
 * 단일 채널, 16-bit PCM, little-endian 고정이다.
 */
function writeWavHeader(view: DataView, sampleRate: number, numSamples: number): void {
  const byteRate = sampleRate * 2; // 1채널 × 16-bit = 2바이트
  const dataSize = numSamples * 2;
  const fileSize = WAV_HEADER_SIZE + dataSize - 8; // RIFF chunk size

  let offset = 0;

  // RIFF 식별자
  view.setUint8(offset++, 0x52); // R
  view.setUint8(offset++, 0x49); // I
  view.setUint8(offset++, 0x46); // F
  view.setUint8(offset++, 0x46); // F

  view.setUint32(offset, fileSize, true);
  offset += 4;

  // WAVE 식별자
  view.setUint8(offset++, 0x57); // W
  view.setUint8(offset++, 0x41); // A
  view.setUint8(offset++, 0x56); // V
  view.setUint8(offset++, 0x45); // E

  // fmt  청크
  view.setUint8(offset++, 0x66); // f
  view.setUint8(offset++, 0x6d); // m
  view.setUint8(offset++, 0x74); // t
  view.setUint8(offset++, 0x20); // (space)

  view.setUint32(offset, 16, true);
  offset += 4; // fmt 청크 크기
  view.setUint16(offset, 1, true);
  offset += 2; // PCM = 1
  view.setUint16(offset, 1, true);
  offset += 2; // 채널 수 = 1
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, 2, true);
  offset += 2; // block align (1채널 × 2바이트)
  view.setUint16(offset, 16, true);
  offset += 2; // 비트 깊이

  // data 청크
  view.setUint8(offset++, 0x64); // d
  view.setUint8(offset++, 0x61); // a
  view.setUint8(offset++, 0x74); // t
  view.setUint8(offset++, 0x61); // a

  view.setUint32(offset, dataSize, true);
}

/**
 * Float32Array 샘플을 WAV 16-bit PCM ArrayBuffer로 인코딩한다.
 * 반환된 ArrayBuffer는 44바이트 헤더 + (numSamples × 2)바이트 PCM 데이터로 구성된다.
 */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + numSamples * 2);
  const view = new DataView(buffer);

  writeWavHeader(view, sampleRate, numSamples);

  let offset = WAV_HEADER_SIZE;
  for (let i = 0; i < numSamples; i++) {
    // 루프 범위 안이므로 인덱스 접근이 안전하다
    view.setInt16(offset, floatToInt16(samples[i] as number), true);
    offset += 2;
  }

  return buffer;
}

/** 샘플을 WAV로 인코딩해 audio/wav Blob으로 돌려준다. */
export function createWavBlob(samples: Float32Array, sampleRate: number): Blob {
  return new Blob([encodeWavPcm16(samples, sampleRate)], { type: "audio/wav" });
}

export { WAV_HEADER_SIZE };
