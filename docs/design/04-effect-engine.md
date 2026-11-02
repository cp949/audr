# 04. 효과 엔진

`@cp949/audr-core`가 효과를 어떻게 정의하고 적용하는지, 선택 구간과 길이 변화를 어떻게 다루는지 적는다.

- 공개 함수는 `applyEffect`, `planEffect`, `reverseRange`, `EffectName`, `EffectPlan`이다. 이름과 시그니처는 `packages/audr-core/src/index.ts`의 안정 API다.
- `EditSession`이 효과를 부르는 순서와 결과 반영은 [01-sound-editor-edit-flow.md](./01-sound-editor-edit-flow.md)가 다룬다.
- 브라우저 하한은 [ADR-0001](../adr/0001-chrome-75-browser-floor.md)이 정한다.

## 효과는 샘플 배열 함수다

효과 하나는 `EffectDef`다(`effects/segment.ts`). `run(samples, sampleRate, start, end)`가 새 샘플 배열을 돌려주고, `plan(length, sampleRate, start, end)`가 렌더링 없이 결과 길이와 구간을 계산한다. `start`와 `end`는 샘플 인덱스다.

배열 함수로 둔 이유:

- `AudioWorklet`은 별도 모듈 파일 로딩이 필요해 사용처 번들러 설정 부담이 생긴다. 쓰지 않는다.
- 배열 함수는 vitest(node)에서 샘플 단위로 검증한다. `OfflineAudioContext`는 node에 없다.
- 노드 그래프가 필요한 효과는 `effects/graph.ts`의 `renderGraph`로 구간만 렌더링한다. 그 효과는 e2e에서만 검증한다.

`applyEffect`는 이름으로 `EffectDef`를 찾아 `runEffect`를 부르고 결과를 `AudioBuffer`로 감싼다. 배열을 다루는 `runEffect`를 따로 두는 이유는 node에서 `AudioBuffer` 없이 시험하기 위해서다.

## 구간 규칙

구간 효과(`segmentEffect`)는 구간 `[start, end)`만 변환하고 앞뒤 소리를 그대로 이어 붙인다.

- 변환 결과 길이가 달라지면 구간 뒤의 소리가 그만큼 밀리거나 당겨진다. 빠르게·느리게가 그렇다.
- 구간이 2샘플 미만(`MIN_SEGMENT`)이면 효과를 걸지 않고 입력 복사본을 돌려준다. 양 끝 ramp와 `n - 1` 나눗셈이 성립하는 최소 길이다.
- 결과 구간은 변환 뒤의 `[start, start + 변환 길이)`다. `adjustedTrimStart`와 `adjustedTrimEnd`는 이 구간을 결과 전체 길이로 나눈 값이다.
- 구간 밖 샘플은 비트 단위로 같다.
- 음량 효과(크게, 작게, 음소거)는 앞뒤에 소리가 있는 경계에서 구간 안쪽 8ms 동안 배율을 서서히 바꿔 딸깍 소리를 막는다. 소리의 맨 앞이나 맨 끝에 닿은 쪽에는 ramp를 두지 않는다. 두면 소리 전체를 음소거해도 양 끝이 새어 나오고, 작게는 양 끝이 원래 음량으로 남는다.

메아리는 구간 효과가 아니다. 구간의 소리를 원음 위에 겹쳐 더하므로 앞뒤를 밀지 않는다. 결과 길이는 `max(전체 길이, 구간 끝 + 되풀이 횟수 × 간격)`이고, 결과 구간은 입력 구간과 같다.

## 길이를 두 곳에서 계산한다

`plan`과 `run`이 같은 길이를 돌려줘야 한다. trim은 렌더링 전에 알아야 하는 값이어서 `plan`을 따로 둔다. 효과마다 길이 식을 한 함수로 만들어 둘이 같이 쓴다(`speed.ts`의 `speedLength`).

`tests/audioEffects.test.ts`가 그래프를 쓰지 않는 모든 효과에서 `planEffect`와 `runEffect`의 길이·trim이 같은지 8000·44100·48000Hz로 확인한다.

## 청각 보호

소리가 커질 수 있는 효과(크게, 메아리)는 결과에 부드러운 상한을 건다(`softLimit`). 0.9 이하는 그대로 두고 넘는 부분만 눌러 절댓값이 1을 넘지 않게 한다.

- 상한은 효과가 값을 바꾼 샘플에만 건다. 크게는 구간 안, 메아리는 되풀이를 더한 영역이다. 그 밖의 원래 소리는 0.9를 넘어도 바뀌지 않는다.
- 뒤집기·페이드·속도처럼 값을 키우지 않는 효과는 상한을 걸지 않는다. 원래 소리를 건드리면 안 되기 때문이다.
- 상한은 효과 정의 안에서 건다. 같은 샘플에 두 번 걸면 값이 다시 눌리므로 한 곳에서만 건다.
