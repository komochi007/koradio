import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.js";
import { registerAppShellServiceWorker } from "./app/service-worker.js";
import "./app/app.css";

const root = document.querySelector<HTMLElement>("#root");
if (root === null) {
  throw new Error("Koradio app root is missing");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void registerAppShellServiceWorker();
