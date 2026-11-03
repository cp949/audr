import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@cp949/audr/style.css";
// 순서가 계약이다. demo.css는 Shell → registry → App을 거쳐 이 뒤에 로드되어 공용 규칙을 덮을 수 있다
import "./shell.css";
import "./ui.css";
import { Shell } from "./Shell";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
