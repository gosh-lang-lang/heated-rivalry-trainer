/*
 * Короткий тон после ответа: «верно» — две восходящие ноты, «неверно» — одна низкая, с лёгким спадом.
 * Генерируется Web Audio (осциллятор, без файлов) — не зависит от сервера озвучки и не ждёт сети.
 * Тихо (громкость ~0,1) и коротко (≤ 0,25 с), чтобы не мешать озвучке, которая идёт следом.
 *
 * iOS даёт звучать AudioContext только после того, как его создали или «разбудили» в касании. Тон играет прямо
 * в обработчике «Проверить» (это касание), а на экране урока контекст ещё и будится на каждом касании (armTone) —
 * тем же касанием, что будит озвучку в lib/speech.ts.
 */

type Ctx = AudioContext;
let ctx: Ctx | null = null;

const create = (): Ctx | null => {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    // iOS 17+: звук страницы — «воспроизведение», как у озвучки через <audio>, а не «фон», который глушит переключатель «Без звука»
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type === "auto") session.type = "playback";
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
};

const wake = () => {
  const c = create();
  if (c && c.state !== "running") c.resume().catch(() => {});
};

/** Будить звук тона на каждом касании, пока открыт экран урока. Возвращает функцию отключения. */
export const armTone = (): (() => void) => {
  const h = () => wake();
  document.addEventListener("pointerdown", h, true);
  return () => document.removeEventListener("pointerdown", h, true);
};

/** Длительность тона, с. */
export const TONE_SEC = 0.24;

/** Сыграть тон ответа. Молча ничего не делает, если Web Audio нет. */
export const tone = (ok: boolean) => {
  const c = create();
  if (!c) return;
  try {
    if (c.state !== "running") void c.resume().catch(() => {});
    const t = c.currentTime + 0.01;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = ok ? "sine" : "triangle";
    if (ok) {
      osc.frequency.setValueAtTime(784, t); // соль
      osc.frequency.setValueAtTime(1047, t + 0.09); // до октавой выше
    } else {
      osc.frequency.setValueAtTime(233, t); // си-бемоль малой
      osc.frequency.linearRampToValueAtTime(175, t + TONE_SEC);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(ok ? 0.1 : 0.12, t + 0.015);
    gain.gain.setValueAtTime(ok ? 0.1 : 0.12, t + TONE_SEC - 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + TONE_SEC);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + TONE_SEC + 0.02);
  } catch {
    /* звук — не обязательная часть */
  }
};
