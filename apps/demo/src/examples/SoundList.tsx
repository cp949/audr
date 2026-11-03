import { SoundEditor, type SoundBuffer } from "@cp949/audr";
import { useRef, useState } from "react";
import { createSine } from "./sampleSound";

type Sound = SoundBuffer & { id: number; name: string };

/** 호스트가 가진 소리 목록과 선택. 선택이 없으면 `selectedId`는 null이다. */
type Library = { sounds: Sound[]; selectedId: number | null };

/**
 * 소리를 지우고 다음 선택을 정한다.
 *
 * - 선택하지 않은 소리를 지우면 선택은 그대로다.
 * - 선택한 소리를 지우면 그 자리에 오던 다음 소리를 고른다.
 * - 마지막 소리였다면 바로 앞 소리를 고른다.
 * - 남은 소리가 없으면 선택도 없다.
 */
function removeSound({ sounds, selectedId }: Library, id: number): Library {
  const index = sounds.findIndex((s) => s.id === id);
  if (index < 0) return { sounds, selectedId };
  const remaining = sounds.filter((s) => s.id !== id);
  if (id !== selectedId) return { sounds: remaining, selectedId };
  // 남은 소리가 없으면 index가 -1이 되어 undefined이므로 null이다
  const next = remaining[Math.min(index, remaining.length - 1)];
  return { sounds: remaining, selectedId: next?.id ?? null };
}

/**
 * 예제: 호스트가 소리 목록을 가지고, 소리를 추가하고 삭제한다.
 *
 * - 에디터는 소리 하나만 안다. 목록, 선택, 삭제는 모두 호스트의 일이다.
 * - 선택한 소리의 `soundId`를 에디터에 넘긴다. 선택이 바뀌면 undo 이력과 구간 선택이 새로 시작한다.
 * - `soundId`는 소리마다 유일해야 하고 다시 쓰면 안 된다. 지운 소리의 id를 새 소리가 물려받으면
 *   에디터가 같은 소리로 여겨 이전 이력을 이어 간다. 그래서 id는 카운터로만 매긴다.
 * - 삭제는 호스트가 정한다. 에디터에는 삭제 버튼이 없다. 지우면 그 소리의 undo 이력도 함께 사라진다.
 *   실제 앱에서는 지우기 전에 확인을 받는 편이 안전하다.
 * - 소리가 하나도 없으면 `SoundEditor`를 그리지 않고 안내를 보인다.
 * - `onCopyToNew`는 복사한 구간을 새 소리로 목록에 더한다.
 * - `demo-*` 클래스는 데모 자체 스타일이다. audr가 요구하지 않는다.
 */
export function SoundListExample() {
  const [library, setLibrary] = useState<Library>(() => ({
    sounds: [
      { id: 1, name: "Sine 440Hz", ...createSine(440) },
      { id: 2, name: "Sine 660Hz", ...createSine(660) },
      { id: 3, name: "Sine 880Hz", ...createSine(880) },
    ],
    selectedId: 1,
  }));
  // 렌더와 무관한 카운터. 소리를 연달아 더해도 id가 겹치지 않고, 지운 id를 다시 쓰지 않는다
  const nextId = useRef(4);

  const { sounds, selectedId } = library;
  const selected = sounds.find((s) => s.id === selectedId) ?? null;

  /** 소리를 목록 끝에 더하고 선택한다. */
  const addSound = (buffer: SoundBuffer, name: string) => {
    const id = nextId.current++;
    setLibrary((prev) => ({ sounds: [...prev.sounds, { ...buffer, id, name }], selectedId: id }));
  };

  /** 소리 하나의 이름이나 samples를 바꾼다. */
  const updateSound = (id: number, patch: Partial<Sound>) =>
    setLibrary((prev) => ({
      ...prev,
      sounds: prev.sounds.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  return (
    <div>
      <div className="demo-toolbar">
        <button
          type="button"
          onClick={() => addSound(createSine(440), `Sine 440Hz #${nextId.current}`)}
        >
          사인파 추가
        </button>
      </div>
      <ul className="demo-sounds" aria-label="소리 목록">
        {sounds.map((sound) => (
          <li key={sound.id}>
            <button
              type="button"
              className="demo-sounds-select"
              aria-current={sound.id === selectedId}
              onClick={() => setLibrary((prev) => ({ ...prev, selectedId: sound.id }))}
            >
              {sound.name}
            </button>
            <button
              type="button"
              className="demo-sounds-remove"
              aria-label={`${sound.name} 삭제`}
              onClick={() => setLibrary((prev) => removeSound(prev, sound.id))}
            >
              삭제
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div style={{ display: "flex", flexDirection: "column", height: 600, maxWidth: 800 }}>
          <SoundEditor
            soundId={selected.id}
            samples={selected.samples}
            sampleRate={selected.sampleRate}
            name={selected.name}
            onChange={({ samples, sampleRate }) =>
              updateSound(selected.id, { samples, sampleRate })
            }
            onCopyToNew={(buffer) => addSound(buffer, `${selected.name} copy`)}
            onRename={(name) => updateSound(selected.id, { name })}
          />
        </div>
      ) : (
        <p className="demo-note">소리가 없다. 위의 "사인파 추가"로 새 소리를 만든다.</p>
      )}
    </div>
  );
}
