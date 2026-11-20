/** Чистая логика страницы входа (без DOM) — чтобы её можно было проверить тестами. */

/** Куда вернуться после входа: только свой путь (не чужой сайт и не снова /login). */
export const nextPath = (search: string) => {
  const n = new URLSearchParams(search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") && !n.startsWith("/login") ? n : "/";
};

/** Ошибка WebAuthn или сервера → понятная фраза. */
export const humanError = (e: unknown) => {
  const err = e as { name?: string; message?: string } | null | undefined;
  if (err?.name === "NotAllowedError") return "Отменено или время вышло — попробуй ещё раз.";
  if (err?.name === "InvalidStateError") return "Этот passkey уже привязан.";
  if (err?.name === "SecurityError") return "Браузер не разрешил passkey на этом адресе.";
  return err?.message || "Что-то пошло не так.";
};
