/** undo 스택 기본 최대 단계 */
export const UNDO_STACK_SIZE = 99;

/** 이력 전체(undo + redo)가 차지할 수 있는 크기 상한. 단위는 sizeOf가 정한다. */
export type HistoryBudget<T> = {
  maxBytes: number;
  sizeOf: (item: T) => number;
};

/**
 * undo/redo 이력. 현재 상태를 인자로 받아 반대편 스택에 넣는다.
 * 호출자가 상태 스냅샷(샘플, trim 등)을 T로 정한다.
 * budget을 주면 단계 수와 별개로 크기 합계도 제한한다.
 */
export class History<T> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(
    private readonly max: number = UNDO_STACK_SIZE,
    private readonly budget?: HistoryBudget<T>,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 편집 직전 상태를 기록한다. redo 스택을 비우고, max를 넘으면 가장 오래된 것을 버린다. */
  push(item: T): void {
    this.redoStack = [];
    if (this.undoStack.length >= this.max) {
      this.undoStack.shift();
    }
    this.undoStack.push(item);
    this.enforceBudget();
  }

  /**
   * 가장 최근 undo 항목을 `item`으로 바꾼다. 단계가 늘지 않는다. redo 스택은 비운다.
   * undo 항목이 없으면 `push`와 같다.
   */
  replaceLast(item: T): void {
    this.redoStack = [];
    this.undoStack.pop();
    this.push(item);
  }

  /** 이전 상태를 돌려주고 current를 redo 스택에 넣는다. 이력이 없으면 undefined이며 아무것도 바꾸지 않는다. */
  undo(current: T): T | undefined {
    if (this.undoStack.length === 0) return undefined;
    this.redoStack.push(current);
    const item = this.undoStack.pop();
    this.enforceBudget();
    return item;
  }

  /** 되돌린 상태를 다시 적용하고 current를 undo 스택에 넣는다. 이력이 없으면 undefined다. */
  redo(current: T): T | undefined {
    if (this.redoStack.length === 0) return undefined;
    this.undoStack.push(current);
    const item = this.redoStack.pop();
    this.enforceBudget();
    return item;
  }

  /** 다른 소리로 바뀔 때 이력을 모두 비운다. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * 크기 합계가 예산을 넘으면 현재 상태에서 가장 먼 항목부터 버린다.
   * 가장 오래된 undo를 먼저, undo가 없으면 가장 먼 redo를 버린다.
   * 항목 하나가 예산보다 커도 마지막 하나는 남겨 직전 편집은 되돌릴 수 있게 한다.
   */
  private enforceBudget() {
    if (!this.budget) return;
    const { maxBytes, sizeOf } = this.budget;
    let total = 0;
    for (const item of this.undoStack) total += sizeOf(item);
    for (const item of this.redoStack) total += sizeOf(item);
    while (total > maxBytes && this.undoStack.length + this.redoStack.length > 1) {
      const dropped = this.undoStack.length > 0 ? this.undoStack.shift() : this.redoStack.shift();
      total -= sizeOf(dropped as T);
    }
  }
}
