// 시드 고정 난수. 같은 시드는 같은 열을 내므로 잡음을 쓰는 효과도 같은 입력에 같은 결과를 낸다.

/** 0 이상 1 미만의 값을 차례로 돌려주는 함수를 만든다. 같은 `seed`는 같은 열을 낸다. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
