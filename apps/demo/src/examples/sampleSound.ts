import type { SoundBuffer } from "@cp949/audr";

/** 예제가 처음 보여 줄 440Hz 사인파 1초(44100Hz). 파일이나 녹음 없이 에디터를 바로 시험한다. */
export function createSine(): SoundBuffer {
  const sampleRate = 44100;
  const samples = Float32Array.from(
    { length: sampleRate },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
  );
  return { samples, sampleRate };
}
