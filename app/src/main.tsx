import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ensureSession } from "./lib/auth";
import "./styles.css";

void ensureSession();
registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
