// 녹음 경과 시간 표시용 m:ss 형식.

/** 초를 소수점 아래를 버린 "m:ss"로 바꾼다. 예: 12.9 → "0:12", 226.77 → "3:46". 분은 자릿수를 늘려 그대로 쓴다. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? "0" : ""}${rest}`;
}
