import { describe, expect, it } from "vitest";
import { humanError, nextPath } from "./messages.ts";

describe("страница входа: куда вернуться", () => {
  it("свой путь — возвращаемся туда", () => {
    expect(nextPath("?next=%2Fwords")).toBe("/words");
    expect(nextPath("?next=/stats?x=1")).toBe("/stats?x=1");
  });
  it("нет next, чужой сайт или снова вход — на главную", () => {
    for (const s of ["", "?next=", "?next=https://evil.example", "?next=//evil.example", "?next=/\\evil.example", "?next=evil", "?next=/login", "?next=/login?next=/x", "?next=javascript:alert(1)"])
      expect(nextPath(s), s).toBe("/");
  });
});

describe("страница входа: ошибки по-человечески", () => {
  const named = (name: string) => Object.assign(new Error("raw"), { name });
  it("отмена, повторная привязка, запрет браузера", () => {
    expect(humanError(named("NotAllowedError"))).toContain("Отменено");
    expect(humanError(named("InvalidStateError"))).toBe("Этот passkey уже привязан.");
    expect(humanError(named("SecurityError"))).toContain("не разрешил");
  });
  it("ошибка сервера — его текст; непонятное — общая фраза", () => {
    expect(humanError(new Error("Ссылка недействительна или устарела"))).toBe("Ссылка недействительна или устарела");
    for (const e of [undefined, null, {}, new Error("")]) expect(humanError(e)).toBe("Что-то пошло не так.");
  });
});
