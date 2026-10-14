import "@fontsource-variable/inter";
import "./styles/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";

function windowKind(): "main" | "widget" {
  // Tauri injects the window label; outside Tauri we fall back to "main".
  const label = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } })
    .__TAURI_INTERNALS__?.metadata?.currentWindow?.label;
  return label === "widget" ? "widget" : "main";
}

const kind = windowKind();
document.body.dataset.window = kind;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root kind={kind} />
  </StrictMode>,
);
