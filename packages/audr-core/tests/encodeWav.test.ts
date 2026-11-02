/**
 * WAV 인코더 단위 테스트.
 * 헤더 구조, PCM 변환, 비정상 입력 처리, Blob 생성을 검증한다.
 */

import { describe, expect, it } from "vitest";

import { createWavBlob, encodeWavPcm16, WAV_HEADER_SIZE } from "../src/encodeWav";

describe("encodeWavPcm16", () => {
  describe("WAV 헤더 구조", () => {
    it("반환된 ArrayBuffer 크기는 헤더(44) + PCM 데이터(샘플 수 × 2)다", () => {
      const samples = new Float32Array(100);
      const result = encodeWavPcm16(samples, 44100);
      expect(result.byteLength).toBe(WAV_HEADER_SIZE + 100 * 2);
    });

    it("샘플이 없어도 44바이트 헤더만 있는 유효한 WAV를 반환한다", () => {
      const samples = new Float32Array(0);
      const result = encodeWavPcm16(samples, 44100);
      expect(result.byteLength).toBe(WAV_HEADER_SIZE);
    });

    it("RIFF 헤더 시작은 'RIFF' 문자열이다", () => {
      const result = encodeWavPcm16(new Float32Array(10), 44100);
      const view = new DataView(result);
      expect(
        String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)),
      ).toBe("RIFF");
    });

    it("오프셋 8에 'WAVE' 식별자가 있다", () => {
      const result = encodeWavPcm16(new Float32Array(10), 44100);
      const view = new DataView(result);
      expect(
        String.fromCharCode(
          view.getUint8(8),
          view.getUint8(9),
          view.getUint8(10),
          view.getUint8(11),
        ),
      ).toBe("WAVE");
    });

    it("fmt 청크는 PCM(1), 1채널, 지정한 sampleRate를 담는다", () => {
      const sampleRate = 48000;
      const result = encodeWavPcm16(new Float32Array(10), sampleRate);
      const view = new DataView(result);
      // audioFormat = 1 (PCM)
      expect(view.getUint16(20, true)).toBe(1);
      // numChannels = 1
      expect(view.getUint16(22, true)).toBe(1);
      // sampleRate
      expect(view.getUint32(24, true)).toBe(sampleRate);
      // bitsPerSample = 16
      expect(view.getUint16(34, true)).toBe(16);
    });

    it("data 청크 크기는 샘플 수 × 2바이트다", () => {
      const numSamples = 50;
      const result = encodeWavPcm16(new Float32Array(numSamples), 44100);
      const view = new DataView(result);
      expect(view.getUint32(40, true)).toBe(numSamples * 2);
    });
  });

  describe("16-bit PCM 변환", () => {
    it("0.0 샘플은 0으로 인코딩된다", () => {
      const samples = new Float32Array([0]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(0);
    });

    it("1.0 샘플은 32767로 인코딩된다", () => {
      const samples = new Float32Array([1.0]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(32767);
    });

    it("-1.0 샘플은 -32768로 인코딩된다", () => {
      const samples = new Float32Array([-1.0]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(-32768);
    });

    it("1.0 초과 값은 32767로 clamp된다", () => {
      const samples = new Float32Array([2.0]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(32767);
    });

    it("-1.0 미만 값은 -32768로 clamp된다", () => {
      const samples = new Float32Array([-5.0]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(-32768);
    });
  });

  describe("비정상 입력 처리", () => {
    it("NaN 샘플은 0으로 처리된다", () => {
      const samples = new Float32Array([NaN]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(0);
    });

    it("Infinity 샘플은 32767로 처리된다", () => {
      const samples = new Float32Array([Infinity]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(32767);
    });

    it("-Infinity 샘플은 -32768로 처리된다", () => {
      const samples = new Float32Array([-Infinity]);
      const result = encodeWavPcm16(samples, 44100);
      const view = new DataView(result);
      expect(view.getInt16(WAV_HEADER_SIZE, true)).toBe(-32768);
    });
  });
  describe("createWavBlob", () => {
    it("type이 audio/wav인 Blob을 만든다", () => {
      const blob = createWavBlob(new Float32Array(10), 44100);
      expect(blob.type).toBe("audio/wav");
    });

    it("Blob 크기는 44 + 2 * 샘플 수다", () => {
      const blob = createWavBlob(new Float32Array(123), 44100);
      expect(blob.size).toBe(44 + 2 * 123);
    });
  });
});
