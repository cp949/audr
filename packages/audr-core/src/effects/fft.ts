// 복소 FFT. 로봇화처럼 짧은 창의 스펙트럼을 직접 다루는 효과가 쓴다.

/**
 * 복소 FFT(radix-2, 제자리)를 `re`·`im`에 적용한다.
 * 길이는 2의 거듭제곱이어야 하고 `re`와 `im`의 길이가 같아야 한다.
 * `inverse`이면 역변환하고 결과를 N으로 나눈다.
 */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;

  // 비트 반전 순서로 재배열한다.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (inverse ? 1 : -1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}
