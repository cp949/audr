# 01. SoundEditor 편집 흐름과 소리 전환

`packages/audr/src/lib/editSession.ts`의 `EditSession`과 `packages/audr/src/lib/editQueue.ts`의 `EditQueue`가 다루는 편집 직렬화, 소리 전환, 이력 상한의 구조적 결정을 적는다. `EditSession`과 `useSoundEditor`의 경계는 "EditSession과 훅의 경계"를 따른다.

- 순수 계산(삭제, 붙이기, 효과 계획, `History`)은 `@cp949/audr-core`에 있다. 이 문서는 `EditSession`이 그것을 어떤 순서로 부르는지와 이유를 다룬다.
- 사용자에게 보이는 동작은 `packages/audr/README.md`의 "SoundEditor"와 "알려진 제약"이 소유한다. 여기서는 반복하지 않는다.
- 키 입력 처리는 [02-shortcut-scope.md](./02-shortcut-scope.md)가 다룬다.

## 편집 큐

모든 소리 편집은 `EditQueue.enqueue`로 한 줄에 세운다. `EditQueue`는 큐, 세대 번호, 붙임 여부, busy 지연을 가진 module이고 소리 데이터를 모른다. 대상은 삭제, 선택만 남기기, undo, redo, 붙이기, 효과, Copy, Copy to New다.

이유:

- 효과 렌더링과 리샘플은 비동기다.
- 앞 편집이 끝나기 전에 다음 편집이 같은 원본에서 시작하면, 먼저 끝난 결과를 나중 결과가 덮어쓴다.
- 직렬화하면 연속으로 누른 효과가 앞 결과 위에 쌓이고, undo 한 번이 한 단계만 되돌린다.

규칙:

- task는 큐 차례가 된 뒤에 실행된다. 버퍼(`currentBuffer`)와 선택(스냅샷의 `trim`)은 task 안에서 읽는다. 큐에 넣는 순간에 읽으면 앞 편집이 끝나기 전 값을 쓴다.
- 선택은 task가 시작할 때 한 번 잡아 끝까지 쓴다. `submitNewSamples`의 `undoTrim`이 그 값이다. 처리 중에 사용자가 선택을 바꿔도 undo가 편집에 쓰인 선택을 복원하게 하려는 것이다. 끝난 시점의 선택은 읽지 않는다.
- 붙이기는 리샘플을 기다리는 동안 선택이 바뀌어도 시작 시점의 선택 자리에 붙인다.
- 효과는 선택이 있을 때만(`trim.start !== null`) 결과 선택을 적용한다. 선택 없이 시작한 효과가 그사이 사용자가 만든 선택을 지우지 않는다.
- task가 예외를 놓쳐도 큐는 끊기지 않는다. 뒤따르는 `.then`의 거부 처리기가 예외를 받아 기록한다.
- 호스트 `onChange`가 던져도 편집은 성공으로 본다. `submitNewSamples`가 `onChange`를 부를 때는 소리가 이미 바뀐 뒤여서, 예외를 반영 실패(`onError`의 `apply`)로 알리면 소리는 바뀌었는데 "그대로"라고 알리게 된다. 예외는 `console.error`로만 남기고, 선택 해제·복원과 재생 같은 호출자의 후속 처리도 이어 간다. `onCopyToNew`의 예외는 위 거부 처리기가 받는다.
- 건너뛴 task(`detach`, 소리 전환)도 대기 수 감소와 busy 해제는 거친다.

### Copy와 Copy to New도 큐에 넣는다

- 큐에 넣지 않으면 효과 직후 `Ctrl+C`, `Ctrl+V`가 효과 전 내용을 복사한다.
- 큐에 넣으면 복사는 앞 편집이 끝난 버퍼를 읽는다.
- 복사만 대기하는 경우 큐가 마이크로태스크 안에 비어서 busy 타이머가 울리기 전에 정리된다. busy 표시는 깜빡이지 않는다.
- Copy to New는 복사한 구간을 칠해 보인 뒤 `COPY_TO_NEW_DELAY_MS`(600ms) 뒤에 `onCopyToNew`를 부른다.
  - 이유: 호스트가 `onCopyToNew`에서 새 소리로 바로 전환하면 소리 전환이 알림(`flash`)을 지워 복사한 구간이 보이지 않는다.
  - 넘기는 내용은 누른 순간의 구간이다. 기다리는 동안 소리가 바뀌어도 그대로 넘긴다.
  - `detach`(화면 제거)는 기다리지 않고 바로 넘긴다. 이미 누른 동작을 버리지 않으려는 것이다.

## busy 표시

`busy`는 대기 중이거나 실행 중인 편집이 `BUSY_DELAY_MS`(200ms)를 넘게 이어질 때만 true다.

- 짧은 편집에서 버튼이 바로 비활성되면 깜빡이므로 지연을 둔다.
- 타이머는 대기 수가 0이고 타이머가 없을 때 `EditQueue.enqueue`가 시작한다.
- `EditQueue`는 busy 값이 바뀔 때만 `onBusyChange`를 부른다. 켜지 않은 busy는 끄는 알림도 없다.
- 대기 수가 0이 되면 아직 울리지 않은 타이머를 취소하고 `busy`를 바로 내린다.
- `detach` 뒤에는 타이머를 만들지 않고, `detach`가 남은 타이머를 취소한다.

비활성 대상은 Undo, Redo, Paste, 선택 작업 막대의 Delete·Keep only selection, 효과 버튼(Faster, Slower, Louder, Softer, Fade in, Fade out, Mute, Cyborg, Robot, Alien, Echo, Broadcast, Walkie-talkie, Reverse reverb, Scratch, Roller coaster, Stutter, Vibrato, Reverse)이다. Copy, Copy to New, 재생·정지는 활성으로 둔다.

- 해석: 비활성은 대기 중임을 보이는 표시다. 순서를 지키는 것은 큐다.
- 근거: 키보드 단축키는 busy 중에도 막지 않고 큐에 쌓는다. 비활성이 정확성을 지키는 장치라면 단축키도 막아야 한다.
- Copy 계열은 큐에 들어가 순서가 지켜지므로 비활성하지 않는다.

### 비활성으로 잃은 포커스 복원

- Chromium은 포커스된 버튼이 disabled되면 포커스를 `body`로 옮긴다. 키보드로 효과를 누른 사용자가 위치를 잃는다.
- `EditQueue`가 busy를 켜기 직전에, `EditSession.attach`가 넘긴 `onBusyStart`를 부른다. 훅이 그 안에서 에디터 안의 `activeElement`를 기억한다(`focusBeforeBusyRef`).
  - 스냅샷이 바뀌어 커밋된 뒤에는 포커스가 이미 `body`로 옮겨져 있어 늦다.
  - `EditSession`은 DOM을 모른다. 그래서 포커스를 읽는 일은 훅이 맡는다.
- busy가 끝나면 다음 조건을 모두 만족할 때만 `focus({ preventScroll: true })`를 부른다.
  - 기억한 요소가 문서에 연결되어 있다.
  - 현재 포커스가 `body`이거나 없다. 사용자가 busy 중에 다른 곳으로 옮겼으면 그대로 둔다.
- 한계: 끝난 뒤에도 비활성이거나 사라진 버튼은 `focus()`가 무시된다. 선택 작업 막대의 Delete·Keep only selection은 실행 뒤 선택이 지워져 막대째 사라지므로 포커스가 `body`로 간다. 대체 대상을 찾지 않는다.
- 포커스가 `body`로 빠져도 단축키 활성 상태는 유지된다. [02-shortcut-scope.md](./02-shortcut-scope.md)의 "활성 에디터" 참고.

## 현재 samples의 기준은 재생기 AudioBuffer다

편집은 `props.samples`를 읽지 않는다. `currentBuffer()`가 재생기의 `AudioBuffer`(`getChannelData(0)`)에서 읽는다.

- 이유: Firefox가 `props.samples`를 detach해 길이가 0이 될 수 있어 피한다. Firefox에서 재현하지는 않았다. 저장소 e2e는 Chromium만 쓴다.
- 같은 이유로 `durationSeconds`를 스냅샷 필드로 따로 둔다. 생성자가 초기 samples로 잡고, 이후 재생기를 다시 만들 때(`resetState`) 함께 갱신한다.
- `AudioBufferPlayer` 생성자는 samples를 `AudioBuffer`로 복사한다. 재생기 버퍼는 호스트가 가진 배열과 메모리를 공유하지 않는다.
- 불변식: 재생기 `AudioBuffer`는 만든 뒤 제자리에서 고치지 않는다. undo 이력이 그 배열을 그대로 참조하기 때문이다. `applyEffect`의 reverse가 새 버퍼를 만드는 것도 같은 이유다.

### 빈 samples

- `AudioBuffer`는 길이 0을 만들 수 없다(`createBuffer`가 `NotSupportedError`를 던진다).
- `playableSamples`가 빈 samples를 무음 1샘플로 바꿔 재생기를 만든다.
- 화면(파형, 길이)은 원래 samples로 계산한다. 빈 소리는 길이 0초로 보이고 재생기 버퍼만 1샘플이다.
- 입력 반영의 `sameContent`는 재생기 버퍼와 `playableSamples(samples)`를 비교한다. 빈 samples가 다시 내려와도 새 소리로 취급하지 않는다.
- 편집은 재생기 버퍼의 무음 1샘플을 읽지 않는다. `createPlayer`가 재생기를 만들 때 입력이 길이 0이었는지 `emptySound`에 기록한다. `currentBuffer()`는 이 값이 true면 길이 0 배열을 돌려준다.
  - 붙이기는 복사본만 결과가 된다. 무음 1샘플이 앞에 남지 않는다.
  - undo 이력에도 길이 0 배열이 쌓여, 붙인 뒤 undo하면 길이 0 소리로 돌아간다.
  - 효과는 재생기 버퍼를 직접 쓴다. `applyEffect`가 2샘플 미만의 입력을 그대로 돌려주므로 아무것도 하지 않는다.
  - Copy, Copy to New는 복사할 내용이 없어 아무것도 하지 않는다. 아래 "샘플 0개 복사"를 따른다.
- 구분 기준은 입력 samples의 길이다. 전체 삭제 결과로 만든 무음 1샘플(`@cp949/audr-core` `editOps`)은 빈 소리가 아니라 길이 1인 소리이고, 그대로 편집·복사된다.
- 입력 반영은 `emptySound`와 새 samples의 빈 소리 여부가 다르면 `sameContent`가 true여도 다른 소리로 본다. `soundId` 없이 빈 소리와 무음 1샘플 소리를 바꿔도 길이를 잘못 읽지 않는다.

샘플 0개 복사:

- 잘라 낸 샘플이 0개면 Copy, Copy to New는 아무것도 하지 않는다. 빈 소리와, 선택이 좁아 `sliceRange` 결과가 0개인 경우가 해당한다.
- 복사본을 지우지 않고 `onCopyToNew`도 부르지 않는다.
- 이유: 빈 복사본이 앞서 복사한 내용을 덮어쓰거나, 내용 없는 새 소리를 만들지 않으려는 것이다.

한계:

- 빈 소리에서 전체 선택 후 Delete를 누르면 `deleteRange`가 무음 1샘플을 돌려주어 길이 1인 소리가 된다.

## 입력 반영 판단 순서

`applyInput`이 아래 순서로 판단한다. 훅은 props의 `samples`, `sampleRate`, `soundId`가 바뀔 때만 부른다. 앞 단계에서 같은 소리로 판정되면 이력과 선택을 지우지 않는다.

1. 재생기가 없으면(첫 마운트) 재생기만 만들고 끝낸다.
2. `soundId`가 바뀌었으면 내용 비교 없이 다른 소리다. 같은 내용을 가진 다른 항목(복제본)도 이력을 이어받지 않는다.
3. `emitted`(마지막으로 `onChange`로 내보낸 buffer)와 `samples` 참조, `sampleRate`가 모두 같으면 같은 소리다. 내용을 비교하지 않는다.
4. 빈 소리 여부가 같고 `sameContent`가 true면 같은 소리다. 호스트가 배열을 복사해서 내려 준 경우를 잡는다.
5. 위에 걸리지 않으면 다른 소리다.

참조 비교(3)가 내용 비교(4)보다 앞에 있는 이유:

- 호스트가 `onChange`로 받은 배열을 그대로 내려 주는 경우가 일반적이다.
- `sameContent`는 길이에 비례하는 전체 비교다. 편집마다 이 비용을 내지 않으려는 것이다.
- 실측: 같은 비교 루프로 9,999,999샘플 `Float32Array` 두 개를 비교하면 Node v24.20.0, Intel i9-14900KF(WSL2)에서 중앙값 약 7ms다. 브라우저에서는 측정하지 않았다.
- 참조가 같으면 내용이 같다는 전제는 `emitted`가 재생기를 만든 값 그대로이기 때문에 성립한다.

다른 소리로 판정했을 때:

- `emitted`를 비운다. 재생기가 바뀌었으므로 이전에 내보낸 배열과의 참조 일치는 더 쓸 수 없다. 이전 배열이 다시 들어오면 참조로 건너뛰지 않고 `sameContent`로 판단한다.
- 이력, 선택, 편집 실패 알림을 지우고 재생기를 새로 만든다.
- 복사본은 지우지 않는다.

한계:

- 호스트가 배열을 제자리에서 고쳐 같은 참조로 내려 주면 변경을 반영하지 않는다. 훅이 `applyInput`을 부르는 조건(`samples`, `sampleRate`, `soundId`)이 그대로라 판단이 돌지 않는다. README "알려진 제약"에 사용자용 문구가 있다.

## 세대 번호(generation)

비동기 편집이 끝났을 때 소리가 이미 바뀌어 있으면, 그 결과가 새 소리의 `onChange`, 이력, 선택에 쓰이면 안 된다. 세대 번호가 이를 막는다.

- `EditQueue.enqueue`가 큐에 넣는 시점의 세대를 잡아 task에 넘긴다.
- `EditQueue.isLive(generation)`는 붙어 있고(`attach`) 세대가 같은지 본다.
- 세대는 `EditQueue.invalidate`로 올린다. 올리는 시점(`syncProps`, `applyInput`)은 `EditSession`이 정한다.

`isLive`를 확인하는 지점:

- 큐에서 task를 꺼내기 직전. 전환 전에 큐에 들어간 편집은 시작하지 않는다.
- `submitNewSamples`가 리샘플을 기다린 뒤, 이력과 `onChange`에 반영하기 직전.
- 붙이기가 리샘플을 기다린 뒤, 효과가 렌더링을 기다린 뒤.
- 비동기 대기 뒤의 `catch`(`submitNewSamples`, 붙이기 리샘플, 효과)에서 `reportError`를 부르기 전. 이전 소리의 실패가 새 소리의 알림이 되지 않는다.
  - `pasteClip`의 동기 예외는 확인 없이 알린다. 직전에 확인한 세대 그대로이기 때문이다.

세대를 올리는 곳은 두 곳이다.

- `soundId`가 바뀔 때: `syncProps` 안에서 올린다. 훅이 커밋마다 `useLayoutEffect`에서 부른다.
- `soundId` 없이 내용이 바뀔 때: `applyInput` 안에서 올린다.

`soundId` 전환을 `syncProps`(layout effect)에서 올리는 이유:

- `applyInput`은 passive effect에서 불리므로 커밋 뒤에 돈다.
- 그 사이 이전 소리의 편집이 끝나면, 이미 새 props로 바뀐 `onChange`를 부른다. 이전 소리의 결과가 새 소리의 콜백으로 나간다.
- `syncProps`는 props 갱신과 같은 시점에 세대를 올려 이 틈을 없앤다.
- 전환 여부는 `soundSwitched`로 `applyInput`에 넘긴다. 같은 전환에서 세대를 두 번 올리지 않는다.

### 남은 틈

`soundId`가 없는 경로는 틈이 남는다.

- 내용이 바뀌었는지는 `applyInput`의 비교(참조, `sameContent`)로만 안다. 그 호출 전에 끝난 이전 편집은 이전 세대로 통과해, 바뀐 뒤의 `onChange`로 결과가 나갈 수 있다.
- 내용 비교를 layout effect로 옮기지 않은 이유는 기록이 없다. 옮기면 `sameContent` 전체 비교가 화면을 그리기 전에 돈다.
- 해법은 호스트가 `soundId`를 넘기는 것이다. README가 `soundId`를 소리 전환의 기본 방법으로 안내한다.

전환 뒤에도 큐는 이어진다.

- 이전 소리의 비동기 작업은 끝날 때까지 큐를 차지한다. 새 소리의 편집은 그 뒤에서 기다리고 busy도 남는다. 결과는 버린다.
- 진행 중인 렌더링과 리샘플을 중간에 취소하지는 않는다. 끝난 뒤 결과만 버린다.

## 소리 전환 신호(switchCount)

선택 상태(`AudioSelector`, 임시 선택)는 `props.soundId`를 직접 비교하지 않는다. 소리 전환 여부는 세션이 `EditSnapshot.switchCount`로 알린다.

- 소유: `EditSession`이다. 이력과 선택을 지우는 판단을 세션이 하므로, "지웠다"는 사실도 세션이 내보낸다.
- 올리는 시점: `applyInput`이 다른 소리로 판정해 이력과 선택을 지우고 재생기를 새로 만든 뒤, 호출 1회당 1을 올린다. `soundId` 변경과, `soundId`가 그대로이거나 없는 채 바뀐 내용이 모두 거치는 한 지점이다.
- 두 가지가 함께 바뀌어도(`soundId`와 내용) `applyInput`이 한 번이므로 1만 는다.
- 올리지 않는 경우:
  - 첫 `applyInput`(재생기 생성).
  - 같은 소리로 판정되어 일찍 끝난 `applyInput`. 방금 내보낸 배열이 돌아온 경우, 내용이 같은 새 참조, 같은 입력의 effect 재실행이 여기에 든다.
  - 편집, undo, redo의 결과 반영. 같은 `resetState`를 쓰지만 소리가 바뀐 것이 아니므로 `resetState` 안에서 올리지 않는다.
- 스냅샷: 전환 경로는 `update`를 여러 번 부른다. 중간 스냅샷은 렌더되지 않는다. 스토어 갱신은 SyncLane으로 예약되어 passive effect 처리가 끝날 때 한꺼번에 렌더되므로, 화면은 `applyInput`이 끝난 스냅샷을 본다.

화면의 사용처(`SoundEditor`):

- `AudioSelector`의 `key`가 `switchCount`다. 전환되면 끌던 드래그를 버리고, mouseup 때 이전 소리에서 잡은 구간이 새 소리의 선택이 되지 않는다.
- 임시 선택(`preview`)은 렌더 중에 이전 `switchCount`와 비교해 지운다. `AudioSelector`가 다시 만들어질 때 `null`을 알리지 않기 때문이다.
- `NameInput`의 `key`는 `props.soundId`로 둔다. 이름은 호스트가 가진 소리의 속성이다. 내용만 바뀐 경우에는 입력 중인 이름을 지우지 않는다.

대가:

- `soundId`가 바뀐 커밋부터 `applyInput`까지는 기존 `AudioSelector`가 남는다. 호스트의 전환 갱신이 이산 이벤트가 아닐 때(타이머, Promise 안의 `setState`)만 생기는 틈이다.
- 그 사이 mouseup이 오면 이전 소리에서 끌던 선택이 세션의 `trim`에 쓰이지만, 곧이어 `applyInput`이 `trim`을 비운다.
- `applyInput` 뒤에는 틈이 없다. 스냅샷 갱신의 렌더가 같은 작업 안에서 커밋되고 이전 `AudioSelector`의 effect 정리(window 리스너 제거)가 바로 돈다.
- 이 틈은 jsdom 테스트로 드러나지 않는다. `act`가 passive effect를 모두 비우기 때문이다.

## 복사본은 소리 사이에 남는다

복사본(`canPaste`의 근거)은 소리 전환과 입력 변경에서 지우지 않는다.

- 한 소리에서 복사해 다른 소리에 붙이는 것이 복사의 쓰임이다.
- 같은 이유로 전환에 `key` 리마운트를 쓰지 않는다. 리마운트하면 복사본이 사라진다. 그래서 `soundId`가 있다.
- 복사본은 `sliceRange`가 만든 별도 배열이다. 원본 소리를 편집해도 바뀌지 않는다.

붙이기 규칙:

- 복사본의 샘플레이트가 대상과 다르면 붙이기 직전에 대상 샘플레이트로 `resample`한 사본을 붙인다.
- 그 사본으로 복사본을 덮어쓰지 않는다.
- 덮어쓰면 22050Hz 소리에 붙인 뒤 44100Hz 소리에 붙일 때 줄였다 늘린 샘플이 붙는다. 샘플레이트가 다른 소리를 오갈 때마다 품질이 떨어진다.
- 비용: 샘플레이트가 다른 소리에 붙일 때마다 리샘플한다.

## undo 이력 상한

`History<UndoItem>`에 두 가지 상한을 건다.

- 단계 수: `UNDO_STACK_SIZE`(99). undo 스택에만 건다.
- 크기 합계: `UNDO_BYTE_LIMIT`(200 × 1000 × 1000바이트). undo와 redo의 `samples.byteLength` 합계다.

크기 상한을 따로 두는 이유:

- 단계마다 편집 전 소리 전체를 들고 있다. 이력 항목은 그 시점 재생기 `AudioBuffer`의 `getChannelData(0)`를 참조한다. 편집마다 새 `AudioBuffer`가 생기므로 단계마다 별도 메모리를 쓴다.
- 편집 결과는 `downsampleIfNeeded`를 거쳐 4,999,999샘플 이하다. `Float32Array`로 약 20MB다. 단계 수 상한만으로는 이력이 약 2GB(99 × 20MB)까지 늘 수 있다.
- 편집을 거치지 않은 입력은 더 길 수 있다. 편집 한도(`maxEditableSamples`, 44100Hz에서 9,999,999샘플)의 입력은 약 40MB이고, 첫 편집의 이력 항목이 된다.
- 긴 소리는 약 10단계가 남는다(200MB ÷ 20MB). 첫 항목이 40MB인 입력이면 9단계다. 짧은 소리는 단계 수 상한이 먼저 걸린다.

초과했을 때(`History.enforceBudget`):

- 현재 상태에서 먼 항목부터 버린다. 가장 오래된 undo를 먼저, undo가 없으면 가장 먼 redo를 버린다.
- 항목 하나가 예산보다 커도 마지막 하나는 남긴다. 직전 편집은 항상 되돌릴 수 있다.

이력 항목에는 `trimStart`, `trimEnd`가 함께 들어 있다. undo와 redo는 이 선택을 복원한다. 크기 계산에는 `samples`만 센다.

이력은 소리 전환과 입력 변경(위 판단 5)에서 비운다.

## EditSession과 훅의 경계

`EditSession`(`packages/audr/src/lib/editSession.ts`)은 React와 DOM을 모른다.
`useSoundEditor`(`packages/audr/src/hooks/useSoundEditor.ts`)는 `EditSession`의 스냅샷을 구독하고 입력을 밀어 넣는다.

소유 범위:

- `EditSession`: 재생기, 선택, 복사본, undo 이력, 오류 보고, 입력 반영 판단, 편집 연산.
- `EditQueue`(`EditSession`이 소유): 편집 큐, 세대 번호, 붙임 여부, busy 지연.
- 훅: 키 처리와 활성 에디터 추적([02-shortcut-scope.md](./02-shortcut-scope.md)), 컨테이너 ref, busy 뒤 포커스 복원, 스냅샷 구독.
- 이유: 큐와 세대 번호는 task 안에서 버퍼와 선택을 읽는 규칙에 의존한다. 상태가 훅에 남으면 규칙을 module이 지킬 수 없다.

의존 주입:

- 재생기(`AudioBufferPlayer`), `applyEffect`, `resample`, `downsampleIfNeeded`를 `EditSessionDeps`로 생성자에 받는다. 기본값은 `@cp949/audr-core`의 실제 구현이다.
- 주입하는 이유: 가짜 재생기와, 끝나는 시점을 조절할 수 있는 효과로 module을 단독으로 시험한다.
- `History`는 주입하지 않는다.
- 기본값과 `History`는 모두 `@cp949/audr-core` 지정자로 import한다. 훅·컴포넌트 테스트의 `vi.mock("@cp949/audr-core")`가 module 그래프 전체에 적용되기 때문이다. 다른 경로로 import하면 mock이 적용되지 않는다.

상태 읽기:

- `getSnapshot`과 `subscribe`를 제공하고, 훅은 `useSyncExternalStore`로 읽는다. 서버 렌더링을 위해 `getServerSnapshot`에도 `getSnapshot`을 넘긴다.
- 스냅샷은 불변 객체다. 필드별로 값이 바뀔 때만 그 필드가 새 참조를 갖는다.
- 선택은 스냅샷의 `trim` 하나로 둔다. 선택용 ref와 state를 따로 갱신하지 않는다.
- 단축키 처리는 렌더링을 기다리지 않는 값이 필요해서 `canUndo`, `canRedo`를 이력에서 직접 읽는 getter로도 제공한다.

수명:

- 훅은 첫 렌더에서 `EditSession`을 한 번 만든다. effect에서 `attach`하고 정리 함수에서 `detach`한다.
- 생성자는 부작용이 없다. 재생기를 만들지 않고 타이머를 걸지 않는다. StrictMode가 state 초기화 함수를 두 번 부르기 때문이다.
- effect 안에서 만들지 않는 이유: StrictMode가 effect를 정리한 뒤 다시 실행하므로, 거기서 만들면 이력과 복사본이 초기화된다.
- 재생기는 첫 `applyInput`에서 만든다.

입력 반영은 두 단계이고 합치지 않는다.

1. `syncProps`: 커밋마다 부른다(layout effect, 의존성 없음). props를 담고 `soundId`가 바뀌었으면 세대를 올린다.
2. `applyInput`: `samples`, `sampleRate`, `soundId`가 바뀔 때만 부른다(passive effect). 내용을 비교한다.

- 합치면 소리 전환의 세대 증가가 커밋 뒤로 밀려 "세대 번호(generation)"의 틈이 생긴다.
- 의존성을 늘리면 README "알려진 제약"(제자리 수정 미반영)이 바뀐다.

interface 제약. `packages/audr/tests/editSession.test.ts`가 각각 검증한다.

1. 스냅샷은 값이 바뀌지 않으면 같은 참조다. 재생 위치만 바뀌어도 `chunkLevels` 같은 나머지 필드는 같은 참조다. `Waveform`이 `memo`라서 `chunkLevels` 참조가 바뀌면 재생 중 프레임마다 파형을 다시 그린다.
2. `attach`와 `detach`를 반복해도 이력과 복사본이 유지된다.
3. 떼어진 동안 도착한 편집 결과와 오류는 버린다. 다시 붙은 뒤 도착한 결과는 세대가 같으면 반영한다. `isLive`의 의미다.
4. busy 시작 알림(`onBusyStart`)이 스냅샷 변경보다 먼저 온다. 훅이 포커스를 기억하는 시점이다.
5. `syncProps`만 호출된 상태에서도 `soundId` 전환 전에 시작한 편집 결과는 버린다. 훅 테스트의 `act`는 layout effect와 passive effect를 함께 실행하므로 이 시점 차이를 검증하지 못한다.
6. 생성만으로는 재생기를 만들지 않는다.

뗀 동안의 동작:

- `detach` 뒤에는 편집 결과, 오류 보고, busy 해제를 반영하지 않는다.
- 편집 큐가 비었을 때 `attach` 상태가 아니면 busy를 내리지 않는다. 다시 붙으면 busy가 다음 편집이 끝날 때까지 true로 남을 수 있다. 알려진 한계다.
