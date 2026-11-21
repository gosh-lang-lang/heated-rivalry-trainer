import { describe, expect, it } from "vitest";
import { KB_MIN, SHORT_MAX, viewportInfo } from "./viewport";

describe("viewportInfo — видимая область на занятии", () => {
  it("без visualViewport — целый экран, клавиатуры нет", () => {
    expect(viewportInfo(800, null)).toEqual({ h: 800, top: 0, kb: false, short: false });
    expect(viewportInfo(480, null).short).toBe(true);
  });

  it("iPhone: открылась клавиатура — видимая область ниже страницы, задание сжимается", () => {
    const v = viewportInfo(798, { height: 421.4, offsetTop: 0, scale: 1 });
    expect(v).toEqual({ h: 421, top: 0, kb: true, short: true });
  });

  it("Safari сдвинул видимую область — запоминаем сдвиг, клавиатура всё равно открыта", () => {
    const v = viewportInfo(798, { height: 421, offsetTop: 77.6, scale: 1 });
    expect(v.top).toBe(78);
    expect(v.kb).toBe(true);
  });

  it("небольшая разница (панель браузера) — не клавиатура", () => {
    expect(viewportInfo(800, { height: 800 - KB_MIN, offsetTop: 0, scale: 1 }).kb).toBe(false);
    expect(viewportInfo(800, { height: 800 - KB_MIN - 1, offsetTop: 0, scale: 1 }).kb).toBe(true);
  });

  it("увеличение щипком — не клавиатура: экран целый", () => {
    expect(viewportInfo(800, { height: 300, offsetTop: 200, scale: 2.5 })).toEqual({ h: 800, top: 0, kb: false, short: false });
  });

  it("порог «низкого» экрана", () => {
    expect(viewportInfo(900, { height: SHORT_MAX, offsetTop: 0, scale: 1 }).short).toBe(false);
    expect(viewportInfo(900, { height: SHORT_MAX - 1, offsetTop: 0, scale: 1 }).short).toBe(true);
  });
});
