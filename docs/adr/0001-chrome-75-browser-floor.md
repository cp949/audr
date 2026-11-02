---
status: accepted
date: 2026-11-02
---

# 0001. Chrome 75를 공식 browser floor로 둔다

## 결정

- `@cp949/audr`, `@cp949/audr-core`의 공식 하한은 Chrome 75다.
- 실제 브라우저 자동 검증은 Chrome 83(Chromium 83.0.4103.116)으로 대신한다. 결과는 "Chrome 83 자동 검증 통과"로만 적고 "Chrome 75 실행"으로 적지 않는다.
- Safari, Firefox의 하한은 정하지 않는다.

구성은 cp949/geul(ADR 0008, 0009)과 cp949/web-image-util(ADR-0001)을 따른다.

## 책임 배분

| 격차 | 책임 | 수단 |
| --- | --- | --- |
| audr 소스 문법 | audr | audr: vite `build.target: "chrome75"`, audr-core: `tsconfig.build.json` `target: "ES2019"` |
| audr 소스 런타임 API | audr | 내부 ponyfill 또는 가드. 전역 polyfill(`core-js` 등)은 넣지 않는다 |
| 앱 번들의 문법(React 등 의존성) | 사용처 | 번들러 `build.target: "chrome75"` |
| 앱의 다른 의존성 런타임 API | 사용처 | 필요하면 진입점 첫 줄 `import "core-js/stable"` |

라이브러리가 전역 polyfill을 넣으면 사용처의 전역 상태를 바꾸고, 사용처의 core-js와 두 벌이 로드될 수 있다. 그래서 polyfill 여부는 사용처가 정한다.

## 근거 (2026-11-02 측정)

결정 전 산출물에서 Chrome 75를 막은 항목과 처리:

| 항목 | 필요 Chrome | 처리 |
| --- | --- | --- |
| dist의 `?.`, `??` | 80 | build target을 낮춰 0건 |
| CSS 압축기가 만든 `inset` 축약형 | 87 | 위 target 변경으로 top/right/bottom/left로 출력 |
| `Blob.prototype.arrayBuffer()` (`decodeAudioFile`) | 76 | 없으면 `new Response(blob).arrayBuffer()`(42)로 읽는다 |
| 선택자 목록 안의 `:focus-visible` | 86 | 목록 분리. 모르는 선택자가 섞이면 Chrome 85 이하가 규칙 전체를 버린다 |
| `outline: none` + `:focus-visible`에만 있는 포커스 링 | 86 | 링을 `:focus`에 두고 `:focus:not(:focus-visible)`에서 지운다. 75~85는 마우스 포커스에도 링이 보인다 |
| 데모의 flex `gap` | 84 | 형제 margin |

문제없음으로 확인한 것:

- React 19.3.1 production 빌드(react, react-dom, scheduler): eslint-plugin-es-x `restrict-to-es2019` 기준 위반은 `Promise.allSettled`(76) 1건이다. View Transition과 Navigation API(102+)가 있을 때만 타는 경로라 Chrome 75에서는 실행되지 않는다(코드 해석, 75 실행으로 확인하지 않음).
- audr가 쓰는 API: `globalThis`(71), `queueMicrotask`(71), `KeyboardEvent.code`(48), `isComposing`(56), passive listener 옵션(51), `getUserMedia`(53), `ScriptProcessorNode`, `OfflineAudioContext`(webkit 접두사 폴백 있음), `navigator.userAgentData`(옵셔널 접근 뒤 `navigator.platform`).

## 검증

| 단계 | 명령 | 언제 | 대상 |
| --- | --- | --- | --- |
| 정적 | `pnpm check:browser-floor` | `pnpm verify`(pre-commit) 마다 | dist JS의 ES 문법·API, src의 Web API 이름, src·dist CSS |
| 실행 | `pnpm --filter demo test:e2e:chrome83` | 릴리스 전, 빌드 설정·CSS·브라우저 API를 바꾼 뒤 | 데모 build + preview를 Chrome 83 컨테이너에서 실행 |

정적 검사(`scripts/check-browser-floor.mjs`):

- ES: eslint-plugin-es-x `restrict-to-es2019`에 aggressive 모드. Chrome 75 이하가 지원하는 ES2020+ 규칙만 끈다. dist JS가 0건이면 실패한다.
- Web API: es-x가 보지 않는 Web API를 이름으로 찾는다. 가드한 사용은 `webApiAllowlist`에 이유와 함께 올린다.
- CSS: stylelint-no-unsupported-browser-features(`Chrome >= 75`, 부분 지원 무시). 부분 지원으로 분류돼 빠지는 `inset`, 논리 속성 축약형, `overflow: clip`은 따로 막는다. `:focus-visible`은 단독 규칙만 허용하고, 다른 선택자와 섞으면 실패한다.

Chrome 83 실행(`docker/chrome83`, `apps/demo/playwright.config.ts`의 `AUDR_CHROME83=1`):

- Debian snapshot `20200712T145349Z`의 `chromium=83.0.4103.116-3`를 컨테이너 안에서만 실행한다. 미패치 CVE가 있는 브라우저를 호스트에 깔지 않기 위해서다.
- vite dev 서버는 `build.target`을 적용하지 않는다. 그래서 build 산출물을 `vite preview`로 서빙한다.
- 대상: `effects.spec.ts`의 UI 경유 테스트, `import.spec.ts`. 코어 직접 호출 테스트는 dev 서버 `/@fs`에 기대므로 뺀다.
- `import.spec.ts`는 `Blob.prototype.arrayBuffer`를 지운 상태로도 가져온다. Chrome 83에는 이 API가 있어 ponyfill 경로를 일부러 태운다.
- 2026-11-02 결과: 18건 통과, 실패 0건.

## Chrome 75~82를 직접 실행하지 않는 이유

- Playwright는 연결할 때 CDP `Browser.setDownloadBehavior`(Chrome 82+)를 무조건 호출한다. 75~81은 붙지 못한다.
- Debian snapshot에 82.x가 없다. 83.x가 자동 검증 가능한 최소 버전이다.
- Playwright 1.64는 83에서도 두 곳이 깨진다. `Element.checkVisibility`(105+) 호출과 CDP `Input.setInterceptDrags` 호출이다. `patches/playwright-core@1.64.1.patch`가 없을 때만 대신 판정하거나 메서드 부재 오류를 무시한다. 최신 Chromium에서는 동작이 같다. Playwright를 올리면 패치를 다시 만든다.
- 패치의 `checkVisibility` 대체는 Playwright 내부 스크립트에만 적용된다. 앱의 전역은 바꾸지 않는다.

## 한계

- 75~82 구간은 정적 검사만 덮는다. `?.`(80)처럼 83이 이미 지원하는 문법·API는 83 실행으로 잡히지 않는다.
- 정적 검사는 동적 접근(`obj[name]()`)과 이름 목록에 없는 API를 놓친다. 새 Web API를 쓸 때 MDN BCD로 최소 버전을 확인하고 목록에 추가한다.
- Linux 컨테이너 한 곳에서만 실행한다. OS별 렌더링, IME, 스크롤바 차이는 보장하지 않는다.
- 실행 검증은 상시 게이트가 아니다. 마지막 실행 뒤 들어온 회귀는 다음 실행 전까지 모른다.
- 터치 입력과 실제 마이크 녹음은 확인하지 않았다(fake 장치만 사용).
