import type { SoundBuffer } from "@cp949/audr";
import { useRef, useState } from "react";

export type Sound = SoundBuffer & { id: number; name: string };

/** 440Hz 사인파 1초 (44100Hz). 사운드 에디터를 바로 시험하려고 시작 소리로 둔다. */
function createSineSound(): Sound {
  const sampleRate = 44100;
  const samples = Float32Array.from(
    { length: sampleRate },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
  );
  return { id: 1, name: "Sine 440Hz", samples, sampleRate };
}

/** 이미 있는 이름이면 뒤에 숫자를 붙여 새 이름을 만든다. */
function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  for (let n = 2; ; n++) {
    if (!existing.includes(`${base}${n}`)) return `${base}${n}`;
  }
}

/**
 * 데모의 소리 목록과 선택. 소리는 항상 1개 이상이다.
 *
 * - id는 렌더와 무관한 카운터로 매긴다. 파일 여러 개를 연달아 추가해도 id가 겹치지 않는다.
 * - 목록 변경은 이전 상태 기준으로 한다. 디코드가 끝나 아직 렌더되지 않은 추가분을 덮어쓰지 않는다.
 */
export function useSoundLibrary() {
  const [sounds, setSounds] = useState<Sound[]>(() => [createSineSound()]);
  const [selectedId, setSelectedId] = useState(1);
  const nextIdRef = useRef(2);

  const selected = sounds.find((s) => s.id === selectedId) ?? (sounds[0] as Sound);

  /** 새 소리를 목록 끝에 추가하고 선택한다. 이미 있는 이름이면 뒤에 숫자를 붙인다. */
  const addSound = (buffer: SoundBuffer, baseName: string) => {
    const id = nextIdRef.current++;
    setSounds((prev) => [
      ...prev,
      {
        ...buffer,
        id,
        name: uniqueName(
          prev.map((s) => s.name),
          baseName,
        ),
      },
    ]);
    setSelectedId(id);
  };

  /** 선택한 소리의 이름이나 samples를 바꾼다. */
  const updateSelected = (patch: Partial<Sound>) => {
    setSounds((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)));
  };

  /** 마지막 1개가 아닐 때만 지울 수 있다. */
  const canRemove = sounds.length > 1;

  /**
   * 선택한 소리를 지운다. 마지막 1개는 지우지 않는다.
   * 지운 자리에 오던 다음 소리를 고르고, 마지막 소리였다면 바로 앞 소리를 고른다.
   */
  const removeSelected = () => {
    if (!canRemove) return;
    const index = sounds.findIndex((s) => s.id === selected.id);
    const removedId = selected.id;
    const remaining = sounds.filter((s) => s.id !== removedId);
    setSounds((prev) => prev.filter((s) => s.id !== removedId));
    setSelectedId((remaining[Math.min(index, remaining.length - 1)] as Sound).id);
  };

  return {
    sounds,
    selected,
    canRemove,
    select: setSelectedId,
    addSound,
    updateSelected,
    removeSelected,
  };
}
