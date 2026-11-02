# DESIGN

`docs/design/`의 설계 문서 색인이다. 작성 기준은 `AGENTS.md`의 "장기 설계"를 따른다.

| 문서                                                                     | 주제                                                                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| [01-sound-editor-edit-flow.md](docs/design/01-sound-editor-edit-flow.md) | EditSession·EditQueue와 훅의 경계, 편집 큐, busy, 재생기 버퍼 기준, 입력 반영 판단, 세대 번호, 복사본, undo 상한 |
| [02-shortcut-scope.md](docs/design/02-shortcut-scope.md)                 | 단축키 활성 에디터, 모달·입력 제외, 글자 판정, 도움말 일치                                                       |
| [03-microphone-errors.md](docs/design/03-microphone-errors.md)           | 마이크 오류 코드 분류를 core에 둔 이유, 사전 검사, 녹음 중 끊김 처리 흐름                                        |
