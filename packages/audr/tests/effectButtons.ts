import type { EffectName } from "@cp949/audr-core";
import type { Messages } from "../src/i18n";

/** 값이 문자열인 Messages 키. 버튼 이름으로 쓸 수 있는 키만 남긴다 */
type TextMessageKey = {
  [K in keyof Messages]: Messages[K] extends string ? K : never;
}[keyof Messages];

/** 화면에 보이는 효과 버튼 18개. 배열 순서가 화면 순서(위→아래, 왼쪽→오른쪽)이자 DOM 순서다. */
export const VISIBLE_EFFECTS: ReadonlyArray<{ label: TextMessageKey; effect: EffectName }> = [
  { label: "faster", effect: "faster" },
  { label: "slower", effect: "slower" },
  { label: "louder", effect: "higher" },
  { label: "softer", effect: "lower" },
  { label: "fadeIn", effect: "fade in" },
  { label: "fadeOut", effect: "fade out" },
  { label: "cyborg", effect: "cyborg" },
  { label: "robot", effect: "robot" },
  { label: "alien", effect: "alien" },
  { label: "echo", effect: "echo" },
  { label: "broadcast", effect: "broadcast" },
  { label: "walkie", effect: "walkie" },
  { label: "reverseReverb", effect: "reverse reverb" },
  { label: "scratch", effect: "scratch" },
  { label: "coaster", effect: "coaster" },
  { label: "stutter", effect: "stutter" },
  { label: "vibrato", effect: "vibrato" },
  { label: "reverse", effect: "reverse" },
];
