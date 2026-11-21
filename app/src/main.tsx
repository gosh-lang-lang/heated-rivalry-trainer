import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ensureSession } from "./lib/auth";
import { lastUser, lastUserName, peekSettings, rememberUser } from "./lib/storage";
import "./styles.css";
import "./glass.css";
import "./scenes.css";
import "./pull.css";
import "./rewards.css";
import "./words.css";
import "./sheet.css";
import { initGlass, legacyLook } from "./lib/glass";
import { applyTheme, legacyTheme } from "./lib/theme";

registerSW({ immediate: true });
// оформление и день/ночь — до первой отрисовки, из кэша настроек (дальше их ведёт App)
const cached = peekSettings(lastUser());
applyTheme(legacyTheme() ?? cached.theme);
initGlass(legacyLook() ?? cached.look);

// прогресс привязан к пользователю: сначала узнаём, кто вошёл (без сети или долго нет ответа — последний вошедший)
const STARTUP_WAIT_MS = 4000;
void ensureSession(lastUser() ? STARTUP_WAIT_MS : undefined).then((me) => {
  if (me) rememberUser(me.user.name, me.user.displayName);
  createRoot(document.getElementById("root")!).render(<App user={me?.user.name ?? lastUser()} name={me?.user.displayName ?? lastUserName()} />);
});
