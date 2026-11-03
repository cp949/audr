// 찌그러짐 도구. 큰 소리를 부드럽게 눌러 소리가 거칠어지게 한다.

/**
 * 입력을 [-1, 1]로 막은 뒤 `tanh(k × v) / tanh(k)`를 적용한 새 배열을 돌려준다.
 * 나누는 값 덕분에 ±1은 ±1로 남고, `k`가 클수록 작은 소리도 많이 눌린다.
 * `k`는 0보다 커야 한다. 입력 배열은 바꾸지 않는다.
 */
export function softClip(x: Float32Array, k: number): Float32Array {
  const norm = Math.tanh(k);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = Math.max(-1, Math.min(1, x[i]));
    out[i] = Math.tanh(k * v) / norm;
  }
  return out;
}
