// SoundEditor가 화면에 있는 동안 이어지는 편집 상태와 규약(오류 보고, 입력 반영 판단,
// 이력, 복사본, 재생기)을 React와 DOM 없이 가진다.
// 편집 큐, 세대 번호, busy 지연은 editQueue.ts의 EditQueue가 가진다.
// 규칙과 이유는 docs/design/01-sound-editor-edit-flow.md가 소유한다.
//
// audr-core 기호는 모두 "@cp949/audr-core" 지정자로 import한다. 훅·컴포넌트 테스트가
// vi.mock("@cp949/audr-core")으로 재생기와 효과를 바꾸는데, 이 mock이 module 그래프 전체에 적용되기 때문이다.
import {
  applyEffect,
  AudioBufferPlayer,
  computeChunkedRMS,
  deleteRange,
  downsampleIfNeeded,
  History,
  keepRange,
  pasteClip,
  resample,
  sliceRange,
  UNDO_STACK_SIZE,
  type EffectName,
  type SoundBuffer,
} from "@cp949/audr-core";
import { EditQueue } from "./editQueue";

// 훅과 테스트가 이 파일에서 import하던 상수다. 정의는 editQueue.ts가 가진다
export { BUSY_DELAY_MS } from "./editQueue";

/**
 * undo 이력(undo + redo) samples 크기 합계 상한.
 * 이력 항목은 그 시점 재생기 버퍼를 참조하고 편집마다 재생기 버퍼가 새로 생기므로, 단계마다 소리 전체만큼 메모리를 쓴다.
 * 편집 결과는 downsampleIfNeeded를 거쳐 4,999,999샘플(약 20MB) 이하라서 긴 소리는 약 10단계가 남는다.
 * 짧은 소리는 단계 수 상한(UNDO_STACK_SIZE)이 먼저 걸린다.
 */
const UNDO_BYTE_LIMIT = 200 * 1000 * 1000;

/**
 * 편집을 반영하지 못했을 때 호스트에 알리는 정보.
 * - apply: 편집 결과를 반영하지 못했다(용량이 너무 크거나 리샘플 실패). 소리는 편집 전 그대로다.
 * - paste: 복사한 소리를 붙이지 못했다.
 * - effect: 효과를 적용하지 못했다.
 */
export type SoundEditorError = {
  kind: "apply" | "paste" | "effect";
  cause: unknown;
};

/** 세션이 호스트에서 읽는 입력. 커밋마다 `syncProps`로 밀어 넣는다. */
export type EditSessionProps = {
  samples: Float32Array;
  sampleRate: number;
  /** 값이 바뀌면 내용이 같아도 다른 소리로 본다. 생략하면 samples 내용으로 판단한다 */
  soundId?: string | number;
  /** 편집이 끝났을 때 새 samples를 돌려준다. undo와 redo도 이 콜백으로 알린다 */
  onChange: (buffer: SoundBuffer) => void;
  /** 선택 구간(없으면 전체)을 새 소리로 복사한다 */
  onCopyToNew: (buffer: SoundBuffer) => void;
  /** 편집을 반영하지 못했을 때 호출한다. 콘솔 기록은 이 콜백과 별개로 남는다 */
  onError?: (error: SoundEditorError) => void;
};

/** 선택 구간. 0~1 비율이고, 선택이 없으면 둘 다 null이다. */
export type EditTrim = { start: number | null; end: number | null };

/**
 * 복사하거나 붙여 넣은 구간. 화면이 잠깐 칠해 보이는 데 쓴다. 0~1 비율이다.
 * id는 동작마다 늘려, 같은 구간을 다시 복사해도 화면이 효과를 처음부터 다시 그리게 한다.
 */
export type EditFlash = { id: number; start: number; end: number };

/** 세션이 쓰는 재생기가 갖춰야 하는 최소 interface. */
export type EditPlayer = Pick<AudioBufferPlayer, "buffer" | "play" | "stop">;

/**
 * 재생기와 효과·리샘플 구현. 기본값은 `@cp949/audr-core`의 실제 구현이다.
 * 테스트는 가짜 재생기와 지연을 조절할 수 있는 효과를 주입한다.
 */
export type EditSessionDeps = {
  AudioBufferPlayer: new (samples: Float32Array, sampleRate: number) => EditPlayer;
  applyEffect: typeof applyEffect;
  resample: typeof resample;
  downsampleIfNeeded: typeof downsampleIfNeeded;
};

/**
 * 화면이 읽는 세션 상태. 불변 객체이고, 값이 바뀐 필드만 새 참조를 갖는다.
 * 재생 위치만 바뀌어도 `chunkLevels` 같은 나머지 필드는 같은 참조다. Waveform이 memo라서
 * `chunkLevels` 참조가 바뀌면 재생 중 프레임마다 파형을 다시 그리기 때문이다.
 */
export type EditSnapshot = {
  /** 파형을 그리는 청크별 RMS */
  chunkLevels: number[];

  /** 소리 길이(초). 빈 소리는 0이다 */
  durationSeconds: number;

  /** null이면 재생 중이 아니고, 0~1이면 재생 위치다 */
  playhead: number | null;

  trim: EditTrim;

  /** 마지막으로 복사하거나 붙여 넣은 구간. 소리가 바뀌면 null이다 */
  flash: EditFlash | null;

  canUndo: boolean;

  canRedo: boolean;

  /** 복사본이 있는지 */
  canPaste: boolean;

  /** 편집이 BUSY_DELAY_MS를 넘게 대기하거나 실행 중이면 true다 */
  busy: boolean;

  /**
   * 마지막 편집 실패의 종류. 다음 편집·undo·redo가 성공하거나 다른 소리로 바뀌면 null이다.
   * id는 실패마다 늘려, 같은 종류로 다시 실패해도 알림을 새로 낭독하게 한다.
   */
  editError: { kind: SoundEditorError["kind"]; id: number } | null;

  /**
   * 소리 전환 횟수. 이력과 선택을 지우고 재생기를 새로 만든 입력 반영마다 1씩 는다.
   * `soundId`가 바뀐 경우와, `soundId`가 그대로이거나 없는 채 내용만 바뀐 경우를 모두 센다.
   * 편집 결과 반영, 방금 내보낸 배열이 돌아온 경우, 첫 입력 반영은 세지 않는다.
   * 화면은 이 값이 바뀌면 끌던 선택 같은 임시 상태를 버린다.
   */
  switchCount: number;
};

type UndoItem = SoundBuffer & { trimStart: number | null; trimEnd: number | null };

/**
 * AudioBuffer는 길이 0을 만들 수 없다(createBuffer가 NotSupportedError를 던진다).
 * 빈 samples는 무음 1샘플로 바꿔 재생기를 만든다. 화면 파형은 원래 samples(빈 배열)로 그린다.
 */
function playableSamples(samples: Float32Array) {
  return samples.length === 0 ? new Float32Array(1) : samples;
}

/** 재생기 버퍼가 새로 들어온 samples와 같은 내용인지 본다. 길이가 같을 때만 전체를 비교한다. */
function sameContent(buffer: AudioBuffer, samples: Float32Array, sampleRate: number) {
  if (buffer.sampleRate !== sampleRate || buffer.length !== samples.length) return false;
  const current = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    if (current[i] !== samples[i]) return false;
  }
  return true;
}

/**
 * 편집 세션. 재생기, 선택, 복사본, 이력, 오류 보고, 입력 반영 판단을 가진다.
 * 편집 직렬화, 세대 번호, busy 지연은 `EditQueue`에 맡긴다.
 *
 * 생애:
 * - 생성자는 부작용이 없다. 재생기를 만들지 않고 타이머를 걸지 않는다. StrictMode가 생성을 두 번 부를 수 있다.
 * - `attach`와 `detach`는 짝이다. 반복해도 이력과 복사본은 유지된다.
 * - 입력 반영은 두 단계다. 둘을 합치면 동작이 바뀐다.
 *   1. `syncProps`: 커밋마다 부른다. props를 반영하고 소리 전환이면 세대를 올린다.
 *   2. `applyInput`: `samples`, `sampleRate`, `soundId`가 바뀔 때만 부른다. 내용을 비교한다.
 *
 * 상태는 `getSnapshot`과 `subscribe`로 읽는다.
 */
export class EditSession {
  private readonly deps: EditSessionDeps;
  private readonly history = new History<UndoItem>(UNDO_STACK_SIZE, {
    maxBytes: UNDO_BYTE_LIMIT,
    sizeOf: (item) => item.samples.byteLength,
  });
  private readonly listeners = new Set<() => void>();

  private snapshot: EditSnapshot;
  private props: EditSessionProps;
  private player: EditPlayer | null = null;
  /** 재생기를 만든 samples가 길이 0이었는지. 재생기 버퍼는 이때 무음 1샘플이라 편집에서 가린다 */
  private emptySound = false;
  private copyBuffer: SoundBuffer | null = null;
  private flashSeq = 0;
  // 편집 직렬화, 세대 번호, 붙임 여부, busy 지연을 가진다
  private readonly queue = new EditQueue((busy) => this.update({ busy }));
  // 마지막으로 onChange로 내보낸 buffer. 호스트가 그 배열을 그대로 내려 주면 내용 비교를 건너뛴다
  private emitted: SoundBuffer | null = null;
  // 마지막으로 반영한 soundId와, 소리 전환을 아직 applyInput이 처리하지 않았는지 여부
  private soundId: string | number | undefined;
  private soundSwitched = false;

  constructor(props: EditSessionProps, deps?: EditSessionDeps) {
    this.props = props;
    this.soundId = props.soundId;
    this.deps = deps ?? { AudioBufferPlayer, applyEffect, resample, downsampleIfNeeded };
    this.snapshot = {
      chunkLevels: computeChunkedRMS(props.samples),
      durationSeconds: props.samples.length / props.sampleRate,
      playhead: null,
      trim: { start: null, end: null },
      flash: null,
      canUndo: false,
      canRedo: false,
      canPaste: false,
      busy: false,
      editError: null,
      switchCount: 0,
    };
  }

  // ---- 상태 읽기 ----

  /** 현재 상태. 값이 바뀌지 않았으면 이전과 같은 참조를 돌려준다. */
  getSnapshot = (): EditSnapshot => this.snapshot;

  /** 상태가 바뀔 때마다 listener를 부른다. 돌려주는 함수로 구독을 푼다. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 지금 undo할 이력이 있는지. 스냅샷과 달리 렌더링을 기다리지 않고 이력을 직접 본다. */
  get canUndo(): boolean {
    return this.history.canUndo;
  }

  /** 지금 redo할 이력이 있는지. 스냅샷과 달리 렌더링을 기다리지 않고 이력을 직접 본다. */
  get canRedo(): boolean {
    return this.history.canRedo;
  }

  // ---- 붙임과 뗌 ----

  /**
   * 화면에 붙인다. 이 뒤로 편집 결과와 오류를 반영하고 busy 타이머를 건다.
   * onBusyStart는 busy가 켜지기 직전, 스냅샷이 바뀌기 전에 한 번 불린다.
   * 포커스된 버튼이 비활성되면 브라우저가 포커스를 옮기므로, 호출자가 그 전에 포커스를 기억하게 하려는 것이다.
   */
  attach(onBusyStart?: () => void): void {
    this.queue.attach(onBusyStart);
  }

  /**
   * 화면에서 뗀다. busy 타이머를 취소하고 재생을 멈춘다. 이력과 복사본은 지우지 않는다.
   * 뗀 동안 끝난 편집 결과와 오류는 버린다.
   */
  detach(): void {
    this.queue.detach();
    this.player?.stop();
  }

  // ---- 입력 반영 ----

  /**
   * 입력 반영 1단계. 커밋마다 부른다.
   * props를 담고, soundId가 바뀌었으면 세대를 바로 올린다.
   * 2단계(`applyInput`)는 커밋 뒤에 돈다. 그 사이에 이전 소리의 편집이 끝나면
   * 새 props의 onChange로 이전 소리의 결과가 나가므로, 세대를 이 시점에 올려 막는다.
   */
  syncProps(props: EditSessionProps): void {
    this.props = props;
    if (props.soundId !== this.soundId) {
      this.soundId = props.soundId;
      this.queue.invalidate();
      this.soundSwitched = true;
    }
  }

  /**
   * 입력 반영 2단계. samples, sampleRate, soundId가 바뀔 때만 부른다.
   * 방금 편집해서 올려 보낸 값이 돌아온 것이면 그대로 두고, 다른 소리면 이력과 선택을 지우고 재생기를 새로 만든다.
   * 복사본은 소리를 바꿔도 유지한다.
   */
  applyInput(samples: Float32Array, sampleRate: number): void {
    const player = this.player;
    if (!player) {
      this.createPlayer(samples, sampleRate);
      return;
    }
    const soundSwitched = this.soundSwitched;
    this.soundSwitched = false;
    if (!soundSwitched) {
      // 방금 내보낸 배열이 그대로 돌아왔으면 재생기 버퍼와 내용이 같다.
      // 전체 비교는 길이에 비례하는 비용을 편집마다 치르므로 참조부터 확인한다
      const emitted = this.emitted;
      if (emitted && emitted.samples === samples && emitted.sampleRate === sampleRate) return;
      // 빈 samples는 무음 1샘플 재생기와 같은 내용이므로 빈 소리 여부도 함께 맞아야 같은 소리다.
      // 무음 1샘플 소리와 빈 소리를 같다고 보면 emptySound가 남아 편집이 길이를 잘못 읽는다
      if (
        this.emptySound === (samples.length === 0) &&
        sameContent(player.buffer, playableSamples(samples), sampleRate)
      ) {
        return;
      }
    }
    // 다른 소리가 선택됐다. 재생기가 바뀌므로 이전에 내보낸 배열과의 참조 일치는 더 쓸 수 없다
    this.emitted = null;
    // soundId 없이 내용만 바뀐 경우에도 이전 내용에서 시작한 편집 결과를 버린다.
    // syncProps보다 늦은 시점이라, 이 단계 전에 끝난 편집은 막지 못한다
    if (!soundSwitched) this.queue.invalidate();
    this.history.clear();
    this.syncHistory();
    this.setTrim(null, null);
    this.update({ editError: null });
    this.resetState(samples, sampleRate);
    // resetState는 편집 결과 반영도 쓰므로 소리 전환 경로인 여기서 올린다
    this.update({ switchCount: this.snapshot.switchCount + 1, flash: null });
  }

  // ---- 재생과 선택 ----

  stop = (): void => {
    this.player?.stop();
    this.update({ playhead: null });
  };

  play = (): void => {
    const player = this.player;
    if (!player) return;
    player.stop();
    const { trim } = this.snapshot;
    player.play(
      trim.start || 0,
      trim.end || 1,
      (p) => this.update({ playhead: p }),
      () => this.update({ playhead: null }),
    );
  };

  /** 선택을 바꾸고 재생을 멈춘다. */
  updateTrim = (start: number | null, end: number | null): void => {
    this.setTrim(start, end);
    this.stop();
  };

  // ---- 편집 ----

  /** 선택이 있을 때만 지운다. 선택이 없으면 아무 일도 하지 않는다. */
  deleteSelection = (): void => this.editSelection(deleteRange);

  /** 선택 구간만 남긴다. 선택이 없으면 아무 일도 하지 않는다. */
  keepSelection = (): void => this.editSelection(keepRange);

  undo = (): void =>
    this.queue.enqueue((generation) =>
      this.applyUndoItem(this.history.undo(this.undoItem(this.snapshot.trim)), generation),
    );

  redo = (): void =>
    this.queue.enqueue((generation) =>
      this.applyUndoItem(this.history.redo(this.undoItem(this.snapshot.trim)), generation),
    );

  /**
   * 선택 구간(없으면 전체)을 복사한다. 편집 큐 순서로 처리하므로 앞 편집이 끝난 버퍼를 복사한다.
   * 효과 직후 Ctrl+C, Ctrl+V를 눌러도 효과 전 내용이 붙지 않게 하려는 것이다.
   * 복사만 대기하면 큐가 마이크로태스크 안에 비어 busy 타이머가 울리기 전에 정리된다.
   */
  copy = (): void => this.queue.enqueue(() => void this.copyNow());

  /** 선택 구간(없으면 전체)을 복사본으로 저장하고 `onCopyToNew`로 알린다. */
  copyToNew = (): void =>
    this.queue.enqueue(() => {
      const clip = this.copyNow();
      if (clip) this.props.onCopyToNew(clip);
    });

  /** 복사본을 선택 자리에 붙인다. 복사본이 없으면 아무 일도 하지 않는다. */
  paste = (): void =>
    this.queue.enqueue((generation) => {
      const clip = this.copyBuffer;
      if (!clip) return;
      // 리샘플을 기다리는 동안 선택이 바뀌어도 붙일 자리는 시작할 때의 선택이다
      const trim = this.snapshot.trim;
      const { sampleRate } = this.currentBuffer();
      if (clip.sampleRate === sampleRate) return this.pasteInto(clip, trim, generation);
      // 샘플레이트가 다르면 먼저 현재 소리의 샘플레이트로 맞춘다.
      // 복사본은 소리를 바꿔도 남으므로 맞춘 사본으로 덮어쓰지 않고 그대로 둔다.
      // 바꾸면 22050Hz 소리에 붙인 뒤 44100Hz 소리에 붙일 때 줄였다 늘린 샘플이 붙는다
      return this.deps
        .resample(clip, sampleRate)
        .then((resampled) => {
          if (!this.queue.isLive(generation)) return;
          return this.pasteInto(resampled, trim, generation);
        })
        .catch((e: unknown) =>
          this.failEdit("paste", generation, "Could not resample the copied sound", e),
        );
    });

  effect = (name: EffectName): void =>
    this.queue.enqueue((generation) => {
      const player = this.player;
      if (!player) return;
      const buffer = player.buffer;
      // 렌더링 중에 선택이 바뀌어도 효과가 쓴 선택을 기준으로 이력과 결과 선택을 정한다
      const trim = this.snapshot.trim;
      const start = trim.start ?? 0;
      const end = trim.end ?? 1;
      return this.deps
        .applyEffect(buffer, name, start, end)
        .then((result) => {
          if (!this.queue.isLive(generation)) return undefined;
          // `applyEffect`는 소리가 2샘플 미만(`buffer.length < 2`)이면 원본 버퍼를 그대로 돌려준다
          if (result.buffer === buffer) return undefined;
          return this.submitNewSamples(
            result.buffer.getChannelData(0),
            result.buffer.sampleRate,
            trim,
            generation,
          ).then((ok) => {
            if (!ok) return;
            if (trim.start !== null) this.setTrim(result.trimStart, result.trimEnd);
            this.play();
          });
        })
        .catch((e: unknown) =>
          this.failEdit("effect", generation, `Could not apply the ${name} effect`, e),
        );
    });

  // ---- 내부 ----

  /**
   * 변경된 필드만 새 스냅샷에 반영하고 listener를 부른다.
   * 값이 모두 같으면 스냅샷을 바꾸지 않고 알리지도 않는다.
   */
  private update(patch: Partial<EditSnapshot>): void {
    const prev = this.snapshot;
    const keys = Object.keys(patch) as Array<keyof EditSnapshot>;
    if (keys.every((key) => Object.is(prev[key], patch[key]))) return;
    this.snapshot = { ...prev, ...patch };
    for (const listener of Array.from(this.listeners)) listener();
  }

  /**
   * 선택 구간에 `range`를 적용해 새 samples로 반영한다. 선택이 없으면 아무 일도 하지 않는다.
   * 반영에 성공하면 선택을 지운다.
   */
  private editSelection(range: typeof deleteRange): void {
    this.queue.enqueue((generation) => {
      const trim = this.snapshot.trim;
      const { start, end } = trim;
      if (start === null || end === null) return;
      const { samples, sampleRate } = this.currentBuffer();
      return this.submitNewSamples(range(samples, start, end), sampleRate, trim, generation).then(
        (ok) => {
          if (ok) this.setTrim(null, null);
        },
      );
    });
  }

  /**
   * 비동기 편집의 실패를 콘솔에 남기고, 소리가 바뀌지 않았으면 알린다.
   * 콘솔 기록은 소리 전환 여부와 관계없이 남긴다.
   */
  private failEdit(
    kind: SoundEditorError["kind"],
    generation: number,
    message: string,
    cause: unknown,
  ): void {
    console.error(`${message}: ${(cause as Error).message}`);
    if (this.queue.isLive(generation)) this.reportError(kind, cause);
  }

  private setTrim(start: number | null, end: number | null): void {
    const prev = this.snapshot.trim;
    if (prev.start === start && prev.end === end) return;
    this.update({ trim: { start, end } });
  }

  /** 복사하거나 붙여 넣은 구간을 화면에 알린다. 비율은 0~1로 자른다 */
  private flashRange(start: number, end: number): void {
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    this.update({ flash: { id: ++this.flashSeq, start: clamp(start), end: clamp(end) } });
  }

  private setCopyBuffer(buffer: SoundBuffer | null): void {
    this.copyBuffer = buffer;
    this.update({ canPaste: buffer !== null });
  }

  /**
   * 실패를 에디터 안 알림 상태에 남기고 호스트에 알린다.
   * 이미 detach된 뒤의 실패는 알리지 않고, 콜백이 던져도 편집 흐름을 깨지 않는다.
   */
  private reportError(kind: SoundEditorError["kind"], cause: unknown): void {
    if (!this.queue.attached) return;
    this.update({ editError: { kind, id: (this.snapshot.editError?.id ?? 0) + 1 } });
    try {
      this.props.onError?.({ kind, cause });
    } catch (callbackError) {
      console.error("onError 콜백이 예외를 던졌다", callbackError);
    }
  }

  private syncHistory(): void {
    this.update({ canUndo: this.history.canUndo, canRedo: this.history.canRedo });
  }

  /** 재생기를 만들고 빈 소리 여부를 함께 기록한다. 둘이 어긋나면 편집이 무음 1샘플을 읽는다. */
  private createPlayer(samples: Float32Array, sampleRate: number): void {
    this.player = new this.deps.AudioBufferPlayer(playableSamples(samples), sampleRate);
    this.emptySound = samples.length === 0;
  }

  private resetState(samples: Float32Array, sampleRate: number): void {
    this.player?.stop();
    this.createPlayer(samples, sampleRate);
    this.update({
      chunkLevels: computeChunkedRMS(samples),
      durationSeconds: samples.length / sampleRate,
      playhead: null,
    });
  }

  /**
   * Firefox는 props.samples를 detach하므로 재생기 버퍼에서 현재 samples를 읽는다.
   * 빈 소리는 재생기 버퍼가 무음 1샘플이므로 길이 0 배열을 돌려준다. 그렇지 않으면
   * 붙이기 결과 앞에 무음이 남고, 이력에 쌓인 빈 소리가 undo에서 1샘플이 된다.
   */
  private currentBuffer(): SoundBuffer {
    const buffer = (this.player as EditPlayer).buffer;
    const samples = this.emptySound ? new Float32Array(0) : buffer.getChannelData(0);
    return { samples, sampleRate: buffer.sampleRate };
  }

  /** 현재 버퍼와 주어진 선택으로 이력 항목을 만든다. */
  private undoItem(trim: EditTrim): UndoItem {
    return { ...this.currentBuffer(), trimStart: trim.start, trimEnd: trim.end };
  }

  /**
   * 새 samples를 적용한다. 용량이 크면 22050Hz로 줄이고, 줄여도 크면 거부(false)한다.
   * 성공하면 이력에 직전 상태를 쌓고 onChange로 알린다. onChange가 던져도 성공으로 본다(예외는 console.error로만 남긴다).
   * 편집을 시작한 뒤 소리가 바뀌었으면(generation 불일치) 아무것도 반영하지 않고 false를 돌려준다.
   * undoTrim은 편집을 시작할 때 잡아 둔 선택이다. 처리 중에 사용자가 선택을 바꿔도
   * undo가 편집에 쓰인 선택을 복원하도록 끝난 시점의 선택을 읽지 않는다.
   * null이면 이력에 쌓지 않는다(undo/redo 적용).
   */
  private submitNewSamples(
    samples: Float32Array,
    sampleRate: number,
    undoTrim: EditTrim | null,
    generation: number,
  ): Promise<boolean> {
    return this.deps
      .downsampleIfNeeded({ samples, sampleRate }, this.deps.resample)
      .then(({ samples: newSamples, sampleRate: newSampleRate }) => {
        if (!this.queue.isLive(generation)) return false;
        if (undoTrim) this.history.push(this.undoItem(undoTrim));
        this.resetState(newSamples, newSampleRate);
        this.syncHistory();
        this.update({ editError: null });
        const emitted = { samples: newSamples, sampleRate: newSampleRate };
        this.emitted = emitted;
        // 소리는 이미 바뀌었다. 호스트 콜백의 예외가 아래 catch로 가면 반영 실패로 잘못 알리고,
        // 호출자의 선택 해제·복원과 재생도 건너뛴다
        try {
          this.props.onChange(emitted);
        } catch (callbackError) {
          console.error("onChange 콜백이 예외를 던졌다", callbackError);
        }
        return true;
      })
      .catch((e: unknown) => {
        // 인코딩에 실패했거나 소리가 너무 커서 편집을 거부한다
        this.failEdit(
          "apply",
          generation,
          "Encountered error while trying to encode sound update",
          e,
        );
        return false;
      });
  }

  private applyUndoItem(item: UndoItem | undefined, generation: number) {
    this.syncHistory();
    if (!item) return;
    return this.submitNewSamples(item.samples, item.sampleRate, null, generation).then((ok) => {
      if (!ok) return;
      this.setTrim(item.trimStart, item.trimEnd);
      this.play();
    });
  }

  /**
   * 지금 버퍼의 선택 구간(없으면 전체)을 복사본으로 저장하고 돌려준다. 큐 안에서만 부른다.
   * 잘라 낸 샘플이 0개면(빈 소리, 샘플보다 좁은 선택) null을 돌려주고 기존 복사본을 그대로 둔다.
   */
  private copyNow(): SoundBuffer | null {
    const { trim } = this.snapshot;
    const start = trim.start ?? 0;
    const end = trim.end ?? 1;
    const { samples, sampleRate } = this.currentBuffer();
    const clip = { samples: sliceRange(samples, start, end), sampleRate };
    if (clip.samples.length === 0) return null;
    this.setCopyBuffer(clip);
    this.flashRange(start, end);
    return clip;
  }

  private pasteInto(clip: SoundBuffer, trim: EditTrim, generation: number) {
    const target = this.currentBuffer();
    const { start, end } = trim;
    let pasted: ReturnType<typeof pasteClip>;
    try {
      pasted = pasteClip(target, clip, start, end);
    } catch (e) {
      console.error(`Could not paste: ${(e as Error).message}`);
      this.reportError("paste", e);
      return;
    }
    return this.submitNewSamples(pasted.samples, target.sampleRate, trim, generation).then((ok) => {
      if (!ok) return;
      // 선택이 있었다면 붙여 넣은 구간이 새 선택이 된다
      if (pasted.trimStart !== null) this.setTrim(pasted.trimStart, pasted.trimEnd);
      // 선택이 없으면 끝에 붙으므로 새로 늘어난 뒤쪽이 붙여 넣은 구간이다
      if (pasted.trimStart !== null) this.flashRange(pasted.trimStart, pasted.trimEnd ?? 1);
      else this.flashRange(target.samples.length / pasted.samples.length, 1);
      this.play();
    });
  }
}
