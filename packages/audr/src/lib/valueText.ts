// 핸들 위치(0~1)를 스크린 리더가 읽을 시간 문구로 바꾼다. 에디터와 녹음창이 함께 쓴다.
import type { Messages } from "../i18n";
import type { SecondsFormat } from "./secondsFormat";

/**
 * 소리 길이(초)를 기준으로 위치(0~1)를 "1.25 seconds" 같은 문구로 바꾸는 함수를 만든다.
 * 초의 소수 자릿수는 소리 길이에 따라 다르다.
 * - 1초 이상이면 둘째 자리까지 쓴다.
 * - 1초 미만이면 셋째 자리까지 쓴다.
 *
 * 방향키 한 번은 위치를 1% 옮긴다. 1초 미만에서는 1%가 0.01초보다 작아서
 * 둘째 자리로는 문구가 바뀌지 않을 수 있다. 그래서 자릿수를 하나 늘린다.
 */
export function secondsValueText(
  messages: Messages,
  format: SecondsFormat,
  durationSeconds: number,
) {
  const digits = durationSeconds < 1 ? 3 : 2;
  return (position: number) =>
    messages.seconds.replace("{seconds}", format(durationSeconds * position, digits));
}
