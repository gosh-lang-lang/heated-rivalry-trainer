import { describe, expect, it } from "vitest";
import { describeDevice, seenAgo } from "./device";

/** Настоящие строки User-Agent. */
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  /** веб-приложение с экрана «Домой»: без Version/… Safari/… */
  iphonePwa: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  /** iPadOS Safari: UA как у Mac */
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.51",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  linuxFirefox: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
};

describe("имя устройства", () => {
  it("iPhone: Safari, Chrome, приложение с экрана «Домой»", () => {
    expect(describeDevice(UA.iphoneSafari)).toEqual({ kind: "phone", name: "iPhone · Safari" });
    expect(describeDevice(UA.iphoneChrome)).toEqual({ kind: "phone", name: "iPhone · Chrome" });
    expect(describeDevice(UA.iphonePwa)).toEqual({ kind: "phone", name: "iPhone · приложение" });
    expect(describeDevice(UA.iphoneSafari, { touch: true, standalone: true })).toEqual({ kind: "phone", name: "iPhone · приложение" });
  });

  it("iPad: Safari выдаёт себя за Mac — узнаём по сенсорному экрану", () => {
    expect(describeDevice(UA.ipadSafari, { touch: true, standalone: false })).toEqual({ kind: "tablet", name: "iPad · Safari" });
    expect(describeDevice(UA.ipadSafari, { touch: true, standalone: true })).toEqual({ kind: "tablet", name: "iPad · приложение" });
    expect(describeDevice(UA.ipadOld)).toEqual({ kind: "tablet", name: "iPad · Safari" });
  });

  it("Mac: без подсказки и без сенсорного экрана — компьютер", () => {
    expect(describeDevice(UA.macSafari)).toEqual({ kind: "computer", name: "Mac · Safari" });
    expect(describeDevice(UA.macSafari, { touch: false, standalone: false })).toEqual({ kind: "computer", name: "Mac · Safari" });
    expect(describeDevice(UA.macChrome, { touch: false, standalone: false })).toEqual({ kind: "computer", name: "Mac · Chrome" });
    expect(describeDevice(UA.macFirefox)).toEqual({ kind: "computer", name: "Mac · Firefox" });
    expect(describeDevice(UA.macChrome, { touch: false, standalone: true })).toEqual({ kind: "computer", name: "Mac · приложение" });
  });

  it("Windows, Android, Linux", () => {
    expect(describeDevice(UA.winChrome)).toEqual({ kind: "computer", name: "Windows · Chrome" });
    expect(describeDevice(UA.winChrome, { touch: true, standalone: false })).toEqual({ kind: "computer", name: "Windows · Chrome" }); // сенсорный ноутбук — не iPad
    expect(describeDevice(UA.winEdge)).toEqual({ kind: "computer", name: "Windows · Edge" });
    expect(describeDevice(UA.androidChrome)).toEqual({ kind: "phone", name: "Android · Chrome" });
    expect(describeDevice(UA.androidSamsung)).toEqual({ kind: "phone", name: "Android · Samsung Internet" });
    expect(describeDevice(UA.androidTablet)).toEqual({ kind: "tablet", name: "Android-планшет · Chrome" });
    expect(describeDevice(UA.linuxFirefox)).toEqual({ kind: "computer", name: "Linux · Firefox" });
  });

  it("пустой или странный UA не ломает список", () => {
    expect(describeDevice("")).toEqual({ kind: "computer", name: "Устройство · браузер" });
    expect(describeDevice(null)).toEqual({ kind: "computer", name: "Устройство · браузер" });
    expect(describeDevice("curl/8.7.1")).toEqual({ kind: "computer", name: "Устройство · браузер" });
  });
});

describe("когда был", () => {
  const now = new Date(2026, 10, 20, 9, 0).getTime();
  const at = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

  it("недавно — «сейчас», затем минуты", () => {
    expect(seenAgo(now, now)).toBe("сейчас");
    expect(seenAgo(now + 60_000, now)).toBe("сейчас"); // часы устройства спешат
    expect(seenAgo(now - 4 * 60_000, now)).toBe("сейчас");
    expect(seenAgo(now - 5 * 60_000, now)).toBe("5 мин назад");
    expect(seenAgo(now - 59 * 60_000, now)).toBe("59 мин назад");
  });

  it("сегодня и вчера — со временем", () => {
    expect(seenAgo(at(20, 7, 5), now)).toBe("сегодня в 07:05");
    expect(seenAgo(at(19, 21, 40), now)).toBe("вчера в 21:40");
    expect(seenAgo(at(19, 0, 1), now)).toBe("вчера в 00:01");
  });

  it("на этой неделе — дни, раньше — дата", () => {
    expect(seenAgo(at(18, 12, 0), now)).toBe("2 дня назад");
    expect(seenAgo(at(17, 23, 0), now)).toBe("3 дня назад");
    expect(seenAgo(at(15, 8, 0), now)).toBe("5 дней назад");
    expect(seenAgo(at(2, 8, 0), now)).toBe("2 ноября");
    expect(seenAgo(new Date(2025, 11, 31, 8, 0).getTime(), now)).toBe("31 декабря 2025");
  });
});
