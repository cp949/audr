// 편집 작업을 한 줄로 세우고, 소리가 바뀐 뒤 늦게 끝난 결과를 걸러내고, busy 표시를 지연한다.
// 소리 데이터와 React·DOM을 모른다. EditSession이 편집 연산마다 이 큐에 task를 넣는다.
// 규칙과 이유는 docs/design/01-sound-editor-edit-flow.md의 "편집 큐", "busy 표시", "세대 번호"가 소유한다.

/**
 * 대기 중이거나 실행 중인 편집이 이 시간(ms)을 넘게 이어질 때만 busy로 표시한다.
 * 짧은 소리의 편집은 금방 끝나므로, 바로 표시하면 버튼이 깜빡인다.
 */
export const BUSY_DELAY_MS = 200;

/**
 * 큐가 실행하는 작업. 큐에 넣은 시점의 세대를 받는다.
 * 비동기 구간이 끝난 뒤 결과를 반영하기 전에 `isLive(generation)`로 확인해야 한다.
 */
export type EditTask = (generation: number) => Promise<unknown> | void;

/**
 * 편집 큐. 작업을 차례로 실행하고, 세대 번호와 붙임 여부로 낡은 작업을 걸러내고, busy를 지연해 알린다.
 *
 * 생애:
 * - 생성자는 부작용이 없다. 타이머를 걸지 않는다.
 * - `attach`와 `detach`는 짝이다. 반복해도 큐에 남은 작업은 유지된다.
 */
export class EditQueue {
  // 비동기 편집(효과 렌더링, 리샘플)이 끝나기 전에 다음 편집이 원본에서 시작하면 앞 결과를 덮어쓴다.
  // 그래서 편집을 차례로 실행한다
  private tail: Promise<void> = Promise.resolve();
  // 큐에 들어왔지만 아직 끝나지 않은 편집 수. 0이 아니면 busy 후보이고, BUSY_DELAY_MS가 지나야 busy가 된다
  private pending = 0;
  private busyTimer: ReturnType<typeof setTimeout> | null = null;
  // 소리가 바뀔 때마다 늘린다. 편집은 시작할 때 세대를 잡아 두고, 결과를 반영하기 직전에 같은지 확인해
  // 이전 소리에서 시작한 편집이 새 소리에 쓰이는 것을 막는다
  private generation = 0;
  private isAttached = false;
  private onBusyStart: (() => void) | undefined;
  // 마지막으로 알린 busy 값. 바뀔 때만 onBusyChange를 부르려고 둔다
  private busy = false;

  /** onBusyChange는 busy 값이 바뀔 때만 부른다. 꺼짐은 붙어 있는 동안에만 알린다. */
  constructor(private readonly onBusyChange: (busy: boolean) => void) {}

  /** 화면에 붙어 있는지. 떼면 새 작업을 실행하지 않고 오류도 알리지 않는다. */
  get attached(): boolean {
    return this.isAttached;
  }

  /**
   * 붙인다. 이 뒤로 작업을 실행하고 busy 타이머를 건다.
   * onBusyStart는 busy가 켜지기 직전, `onBusyChange(true)`보다 먼저 한 번 불린다.
   * 포커스된 버튼이 비활성되면 브라우저가 포커스를 옮기므로, 호출자가 그 전에 포커스를 기억하게 하려는 것이다.
   */
  attach(onBusyStart?: () => void): void {
    this.isAttached = true;
    this.onBusyStart = onBusyStart;
  }

  /** 뗀다. 아직 울리지 않은 busy 타이머를 취소한다. 큐에 남은 작업은 실행하지 않고 건너뛴다. */
  detach(): void {
    this.isAttached = false;
    this.onBusyStart = undefined;
    if (this.busyTimer !== null) {
      clearTimeout(this.busyTimer);
      this.busyTimer = null;
    }
  }

  /** 세대를 올린다. 이미 큐에 들어간 작업과 실행 중인 작업의 결과는 `isLive`가 false가 된다. */
  invalidate(): void {
    this.generation += 1;
  }

  /** 작업을 시작한 뒤 소리가 바뀌거나 detach되지 않았는지 본다. */
  isLive(generation: number): boolean {
    return this.isAttached && generation === this.generation;
  }

  /**
   * 작업을 큐 끝에 붙인다. 작업은 앞 작업이 끝난 뒤 그 시점의 값을 읽어야 하므로
   * 값 읽기까지 task 안에서 한다. detach 뒤나, 큐에 넣은 뒤 `invalidate`된 경우에는 실행하지 않는다.
   * 건너뛴 작업도 아래의 대기 수 감소와 busy 해제는 그대로 거친다.
   */
  enqueue(task: EditTask): void {
    const generation = this.generation;
    // detach 뒤에는 작업이 실행되지 않으므로 타이머도 만들지 않는다
    if (this.isAttached && this.pending === 0 && this.busyTimer === null) {
      this.busyTimer = setTimeout(() => {
        this.busyTimer = null;
        // 상태가 바뀌기 전에 알린다. 호출자가 비활성되기 전의 포커스를 기억해야 한다
        this.onBusyStart?.();
        this.busy = true;
        this.onBusyChange(true);
      }, BUSY_DELAY_MS);
    }
    this.pending += 1;
    this.tail = this.tail
      .then(() => (this.isLive(generation) ? task(generation) : undefined))
      .then(
        () => undefined,
        // 작업마다 자체 실패 처리를 하지만, 놓친 예외가 큐를 끊지 않게 여기서 한 번 더 받는다
        (e: unknown) => console.error("편집 작업이 예외를 던졌다", e),
      )
      .then(() => {
        this.pending -= 1;
        if (this.pending > 0) return;
        // 큐가 비면 표시를 바로 거둔다. 아직 울리지 않은 타이머도 함께 취소한다
        if (this.busyTimer !== null) {
          clearTimeout(this.busyTimer);
          this.busyTimer = null;
        }
        if (this.isAttached && this.busy) {
          this.busy = false;
          this.onBusyChange(false);
        }
      });
  }
}
