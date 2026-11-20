import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ensureSession } from "./lib/auth";
import { lastUser, rememberUser } from "./lib/storage";
import "./styles.css";
import "./glass.css";
import { initGlass } from "./lib/glass";
import { initTheme } from "./lib/theme";

registerSW({ immediate: true });
initTheme();
initGlass();

// прогресс привязан к пользователю: сначала узнаём, кто вошёл (без сети — последний вошедший)
void ensureSession().then((me) => {
  if (me) rememberUser(me.user.name);
  createRoot(document.getElementById("root")!).render(<App user={me?.user.name ?? lastUser()} />);
});
