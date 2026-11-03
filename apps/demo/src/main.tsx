import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@cp949/audr/style.css";
import { Shell } from "./Shell";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
