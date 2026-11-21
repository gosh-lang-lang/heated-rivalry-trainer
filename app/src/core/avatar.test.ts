import { describe, expect, it } from "vitest";
import { avatarId, CARD_AVATARS, cleanNumber, isAvatar, parseAvatar, unlockedArts } from "./avatar";
import { SEASON1, type LessonCard } from "./cards";
import { changeSetting, emptyState, mergeStates, parseState } from "./state";

describe("аватарка", () => {
  it("строка ↔ аватарка: буква, игрок, свитер, карточка", () => {
    for (const id of ["", "player:red", "player:black", "jersey:red:17", "jersey:white:", "jersey:blue:0", "card:cottage", "card:cup"])
      expect(avatarId(parseAvatar(id))).toBe(id);
    expect(parseAvatar("jersey:black:07")).toEqual({ kind: "jersey", kit: "black", num: "7" });
  });

  it("непонятное — буква; игроки-герои не берутся как карточка", () => {
    for (const bad of [null, 5, "player:green", "jersey:red:100", "jersey:red:x", "jersey:pink:1", "card:shane", "card:nope", "emoji:🏒"]) {
      expect(parseAvatar(bad)).toEqual({ kind: "letter" });
      expect(isAvatar(bad)).toBe(false);
    }
    expect(isAvatar("jersey:black:07")).toBe(false); // хранится без ведущего нуля
  });

  it("номер на свитере — две цифры, без ведущих нулей", () => {
    expect(cleanNumber("07")).toBe("7");
    expect(cleanNumber("123")).toBe("12");
    expect(cleanNumber("a9b")).toBe("9");
    expect(cleanNumber("")).toBe("");
    expect(cleanNumber("00")).toBe("0");
  });

  it("сюжеты для аватарки совпадают с карточками сезона 1 (кроме героев)", () => {
    expect(CARD_AVATARS.map((c) => [c.art, c.name, c.pos])).toEqual(
      SEASON1.map((s, i) => [s.art, s.name, i + 1]).filter(([art]) => art !== "shane" && art !== "ilya"),
    );
  });

  it("открыты сюжеты полученных карточек (любого сезона), герои не считаются", () => {
    const card = (art: string) => ({ art }) as LessonCard;
    expect([...unlockedArts([card("shane"), card("ilya"), card("room"), card("room"), card("cup")])].sort()).toEqual(["cup", "room"]);
    expect(unlockedArts([]).size).toBe(0);
  });

  it("настройка: по умолчанию буква, неверное значение отбрасывается, сливается между устройствами", () => {
    expect(emptyState().settings.avatar).toBe("");
    expect(parseState({ srs: {}, settings: { avatar: "card:nope" } }).settings.avatar).toBe("");
    expect(parseState({ srs: {}, settings: { avatar: "jersey:red:24" } }).settings.avatar).toBe("jersey:red:24");
    const phone = changeSetting(emptyState(), "avatar", "player:black", 2000);
    const laptop = changeSetting(emptyState(), "avatar", "jersey:blue:9", 1000);
    expect(mergeStates(laptop, phone).settings.avatar).toBe("player:black");
    expect(mergeStates(phone, laptop).settings.avatar).toBe("player:black");
  });
});
