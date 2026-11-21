import { afterEach, describe, expect, it } from "vitest";
import { addDays, clockNow, clockTz, dayIn, daysBetween, deviceTz, greeting, hourIn, isTimeZone, nowDate, setClock, todayKey } from "./dates";

const at = (h: number, m = 0) => new Date(2026, 10, 21, h, m);

describe("greeting — по часам устройства", () => {
  it("утро, день, вечер, ночь", () => {
    expect(greeting(at(5))).toBe("Доброе утро");
    expect(greeting(at(11, 59))).toBe("Доброе утро");
    expect(greeting(at(12))).toBe("Добрый день");
    expect(greeting(at(16, 59))).toBe("Добрый день");
    expect(greeting(at(17))).toBe("Добрый вечер");
    expect(greeting(at(22, 59))).toBe("Добрый вечер");
    expect(greeting(at(23))).toBe("Доброй ночи");
    expect(greeting(at(0, 30))).toBe("Доброй ночи");
    expect(greeting(at(4, 59))).toBe("Доброй ночи");
  });
});

describe("дни в поясе пользователя и часы сервера", () => {
  afterEach(() => setClock({ offset: 0, tz: "" }));

  it("dayIn и hourIn — по поясу, а не по устройству", () => {
    const t = Date.parse("2026-11-20T22:30:00Z");
    expect(dayIn(t, "Europe/Moscow")).toBe("2026-11-21");
    expect(dayIn(t, "America/New_York")).toBe("2026-11-20");
    expect(hourIn(t, "Europe/Moscow")).toBe(1);
    expect(hourIn(Date.parse("2026-11-20T21:00:00Z"), "Europe/Moscow")).toBe(0);
  });

  it("addDays и daysBetween — календарь без поясов: через летнее время, месяц и год", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-11-18", "2026-11-21")).toBe(3);
    expect(daysBetween("2026-03-01", "2026-03-31")).toBe(30);
  });

  it("isTimeZone: только пояса IANA", () => {
    expect(isTimeZone("Europe/Moscow")).toBe(true);
    expect(isTimeZone("UTC")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(3)).toBe(false);
  });

  it("«сегодня» — часы устройства с поправкой на сервер, в поясе пользователя", () => {
    const real = Date.now();
    setClock({ offset: -3 * 864e5, tz: "Asia/Tokyo" }); // часы устройства на 3 дня впереди сервера
    expect(Math.abs(clockNow() - (real - 3 * 864e5))).toBeLessThan(5_000);
    expect(nowDate().getTime()).toBeLessThanOrEqual(clockNow());
    expect(todayKey()).toBe(dayIn(clockNow(), "Asia/Tokyo"));
    expect(clockTz()).toBe("Asia/Tokyo");
    setClock({ tz: "" }); // пояса с сервера нет — пояс устройства
    expect(clockTz()).toBe(deviceTz());
  });
});
