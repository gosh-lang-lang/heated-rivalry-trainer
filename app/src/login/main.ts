/**
 * Страница входа и привязки passkey (/login, /login#enroll=<токен>).
 * Отдельная лёгкая точка входа: доступна без сессии, не тянет код приложения.
 */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { humanError, nextPath as nextFrom } from "./messages.ts";

const nextPath = () => nextFrom(location.search);

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => ($(id).hidden = !on);
const say = (id: string, text: string, kind: "err" | "ok" = "err") => {
  const el = $(id);
  el.textContent = text;
  el.className = `msg ${kind}`;
};

const post = async <T>(path: string, body: unknown = {}): Promise<T> => {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new Error(j.error ?? `Ошибка ${r.status}`);
  return j as T;
};

const busy = (btn: HTMLButtonElement, on: boolean, label: string) => {
  btn.disabled = on;
  btn.querySelector("span")!.textContent = on ? "Подожди…" : label;
};

if (!browserSupportsWebAuthn()) {
  say("login-msg", "Этот браузер не поддерживает passkey. Открой сайт в Safari или Chrome.");
  ($("signin") as HTMLButtonElement).disabled = true;
}

/* ---------- привязка по одноразовой ссылке ---------- */

const enrollToken = new URLSearchParams(location.hash.slice(1)).get("enroll");
if (enrollToken) {
  // убираем токен из адресной строки и истории — он остаётся только в памяти страницы
  history.replaceState(null, "", location.pathname);
  show("login", false);
  show("enroll");
  void startEnroll(enrollToken);
}

async function startEnroll(token: string) {
  const btn = $<HTMLButtonElement>("create");
  let options: PublicKeyCredentialCreationOptionsJSON;
  try {
    const r = await post<{ options: PublicKeyCredentialCreationOptionsJSON; user: { displayName: string } }>("/api/auth/enroll/options", { token });
    options = r.options;
    $("enroll-name").textContent = r.user.displayName;
    show("enroll-for");
    btn.disabled = false;
  } catch (e) {
    say("enroll-msg", humanError(e));
    show("enroll-steps", false);
    show("create", false);
    show("login"); // можно хотя бы войти, если passkey уже есть
    return;
  }
  // WebAuthn вызываем сразу в обработчике нажатия (Safari требует жест пользователя без ожиданий)
  btn.addEventListener("click", async () => {
    busy(btn, true, "Создать passkey");
    say("enroll-msg", "");
    try {
      const response = await startRegistration({ optionsJSON: options });
      await post("/api/auth/enroll/verify", { token, response, label: navigator.userAgent });
      say("enroll-msg", "Готово! Passkey сохранён — на iPhone и iPad он появится сам.", "ok");
      show("create", false);
      show("enroll-steps", false);
      show("open");
    } catch (e) {
      say("enroll-msg", humanError(e));
      busy(btn, false, "Создать passkey"); // ссылка и вызов остаются в силе до успешной привязки
    }
  });
}

/* ---------- вход ---------- */

let loginOptions: PublicKeyCredentialRequestOptionsJSON | null = null;
let loadedAt = 0;
const refreshOptions = async () => {
  try {
    loginOptions = (await post<{ options: PublicKeyCredentialRequestOptionsJSON }>("/api/auth/login/options")).options;
    loadedAt = Date.now();
  } catch (e) {
    loginOptions = null;
    say("login-msg", humanError(e));
  }
};

if (!enrollToken) {
  // уже вошёл — сразу в приложение
  void fetch("/api/auth/me", { credentials: "same-origin" }).then((r) => {
    if (r.ok) location.replace(nextPath());
  });
}

// параметры входа готовим заранее и обновляем раньше, чем истечёт вызов (5 минут); вкладка в фоне таймеры
// почти не крутит (iOS), поэтому ещё и при возвращении на неё
const STALE_MS = 4.5 * 60 * 1000;
const stale = () => !loginOptions || Date.now() - loadedAt > STALE_MS;
void refreshOptions();
setInterval(() => void refreshOptions(), 4 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && stale()) void refreshOptions();
});

let signingIn = false;
$("signin").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("signin");
  if (signingIn) return; // двойное нажатие — второй вход не запускаем
  signingIn = true;
  say("login-msg", "");
  busy(btn, true, "Войти с passkey");
  const options = stale() ? null : loginOptions;
  if (!options) {
    // Safari пускает WebAuthn только сразу в обработчике нажатия: после ожидания сети откажет — просим нажать ещё раз
    await refreshOptions();
    busy(btn, false, "Войти с passkey");
    signingIn = false;
    if (loginOptions) say("login-msg", "Готово — нажми «Войти» ещё раз.", "ok");
    return;
  }
  try {
    const response = await startAuthentication({ optionsJSON: options });
    loginOptions = null;
    await post("/api/auth/login/verify", { response });
    location.replace(nextPath());
  } catch (e) {
    say("login-msg", humanError(e));
    busy(btn, false, "Войти с passkey");
    signingIn = false;
    void refreshOptions(); // прежний вызов уже использован или отменён
  }
});
