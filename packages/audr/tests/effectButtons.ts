import type { EffectName } from "@cp949/audr-core";
import type { Messages } from "../src/i18n";

/** 값이 문자열인 Messages 키. 버튼 이름으로 쓸 수 있는 키만 남긴다 */
type TextMessageKey = {
  [K in keyof Messages]: Messages[K] extends string ? K : never;
}[keyof Messages];

/** 화면에 보이는 효과 버튼 19개. 배열 순서가 묶음 순서(소리 크기, 속도·방향, 목소리, 공간, 흔들기)이자 DOM 순서다. */
export const EFFECTS: ReadonlyArray<{ label: TextMessageKey; effect: EffectName }> = [
  { label: "louder", effect: "higher" },
  { label: "softer", effect: "lower" },
  { label: "fadeIn", effect: "fade in" },
  { label: "fadeOut", effect: "fade out" },
  { label: "mute", effect: "mute" },
  { label: "faster", effect: "faster" },
  { label: "slower", effect: "slower" },
  { label: "reverse", effect: "reverse" },
  { label: "scratch", effect: "scratch" },
  { label: "robot", effect: "robot" },
  { label: "cyborg", effect: "cyborg" },
  { label: "alien", effect: "alien" },
  { label: "walkie", effect: "walkie" },
  { label: "echo", effect: "echo" },
  { label: "reverseReverb", effect: "reverse reverb" },
  { label: "broadcast", effect: "broadcast" },
  { label: "vibrato", effect: "vibrato" },
  { label: "stutter", effect: "stutter" },
  { label: "coaster", effect: "coaster" },
];

/** 효과 묶음. 이름 키와 소속 효과 이름(화면 순서) */
export const EFFECT_GROUPS: ReadonlyArray<{
  name: TextMessageKey;
  labels: ReadonlyArray<TextMessageKey>;
}> = [
  { name: "effectGroupVolume", labels: ["louder", "softer", "fadeIn", "fadeOut", "mute"] },
  { name: "effectGroupSpeed", labels: ["faster", "slower", "reverse", "scratch"] },
  { name: "effectGroupVoice", labels: ["robot", "cyborg", "alien", "walkie"] },
  { name: "effectGroupSpace", labels: ["echo", "reverseReverb", "broadcast"] },
  { name: "effectGroupWobble", labels: ["vibrato", "stutter", "coaster"] },
];
