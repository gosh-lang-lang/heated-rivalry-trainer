import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { ensureSession } from "./lib/auth";
import { lastUser, rememberUser } from "./lib/storage";
import "./styles.css";

registerSW({ immediate: true });

// прогресс привязан к пользователю: сначала узнаём, кто вошёл (без сети — последний вошедший)
void ensureSession().then((me) => {
  if (me) rememberUser(me.user.name);
  createRoot(document.getElementById("root")!).render(<App user={me?.user.name ?? lastUser()} />);
});
