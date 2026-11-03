# DESIGN

`docs/design/`의 설계 문서 색인이다. 작성 기준은 `AGENTS.md`의 "장기 설계"를 따른다.

| 문서                                                                     | 주제                                                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [01-sound-editor-edit-flow.md](docs/design/01-sound-editor-edit-flow.md) | EditSession·EditQueue와 훅의 경계, 편집 큐, busy, 재생기 버퍼 기준, 입력 반영 판단, 세대 번호, 복사본, undo 상한              |
| [02-shortcut-scope.md](docs/design/02-shortcut-scope.md)                 | 단축키 활성 에디터, 모달·입력 제외, 글자 판정, 도움말 일치                                                                    |
| [03-microphone-errors.md](docs/design/03-microphone-errors.md)           | 마이크 오류 코드 분류를 core에 둔 이유, 사전 검사, 녹음 중 끊김 처리 흐름                                                     |
| [04-effect-engine.md](docs/design/04-effect-engine.md)                   | 효과를 샘플 배열 함수로 둔 이유, 구간 규칙과 길이 계산, 청각 보호 상한, 음량 맞춤, 로봇 음성, biquad Q 단위, 무전기 기준 음량 |
| [05-effect-panel-layout.md](docs/design/05-effect-panel-layout.md)       | `effectsLayout` 세 값, `overflow`가 효과 버튼을 한 번만 그리고 자르는 이유, 첫 줄 밖 버튼 숨김, 팝오버 닫기와 포커스          |
