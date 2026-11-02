// 번들 진입점. 토큰 CSS(--audr-* 변수)는 컴포넌트가 쓰므로 함께 번들한다.
// 선언 파일(.d.ts)에 CSS import가 남지 않도록 공개 진입(index.ts)과 분리했다.
// 이 파일은 tsconfig.build.json에서 제외한다.
import "./styles/tokens.css";

export * from "./index";
