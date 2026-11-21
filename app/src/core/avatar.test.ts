import { describe, expect, it } from "vitest";
import { avatarId, CARD_AVATARS, cleanNumber, isAvatar, isAvatarNum, parseAvatar, savedNumber, unlockedArts } from "./avatar";
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

  it("номер на свитере переживает переключение на игрока и обратно", () => {
    // набрали 43 на красном свитере — номер и в аватарке, и отдельно
    let s = changeSetting(emptyState(), "avatarNum", "43", 1000);
    s = changeSetting(s, "avatar", avatarId({ kind: "jersey", kit: "red", num: s.settings.avatarNum }), 1000);
    expect(s.settings.avatar).toBe("jersey:red:43");
    // выбрали Шейна — аватарка без номера, номер остался
    s = changeSetting(s, "avatar", avatarId({ kind: "player", kit: "red" }), 2000);
    expect(s.settings).toMatchObject({ avatar: "player:red", avatarNum: "43" });
    // после сохранения и загрузки (parseState) — тоже
    s = parseState(JSON.parse(JSON.stringify(s)));
    expect(s.settings.avatarNum).toBe("43");
    // обратно на свитер (белый) — с тем же номером
    s = changeSetting(s, "avatar", avatarId({ kind: "jersey", kit: "white", num: s.settings.avatarNum }), 3000);
    expect(s.settings.avatar).toBe("jersey:white:43");
  });

  it("номер отдельно: допустимые значения, старые копии, слияние по пунктам", () => {
    for (const ok of ["", "0", "7", "43", "99"]) expect(isAvatarNum(ok)).toBe(true);
    for (const bad of [null, 7, "07", "100", "x"]) expect(isAvatarNum(bad)).toBe(false);
    expect(emptyState().settings.avatarNum).toBe("");
    // копия до avatarNum: номер — из выбранного свитера, иначе пусто
    expect(parseState({ srs: {}, settings: { avatar: "jersey:red:43" } }).settings.avatarNum).toBe("43");
    expect(parseState({ srs: {}, settings: { avatar: "player:red" } }).settings.avatarNum).toBe("");
    expect(savedNumber(undefined, "jersey:blue:")).toBe("");
    // сохранённый номер важнее свитера; мусор — как будто номера нет
    expect(parseState({ srs: {}, settings: { avatar: "jersey:red:43", avatarNum: "" } }).settings.avatarNum).toBe("");
    expect(parseState({ srs: {}, settings: { avatar: "jersey:red:43", avatarNum: "007" } }).settings.avatarNum).toBe("43");
    // на телефоне выбрали Илью, на ноутбуке позже набрали 9 — остаются и Илья, и 9
    const phone = changeSetting(emptyState(), "avatar", "player:black", 2000);
    const laptop = changeSetting(emptyState(), "avatarNum", "9", 3000);
    for (const m of [mergeStates(phone, laptop), mergeStates(laptop, phone)]) expect(m.settings).toMatchObject({ avatar: "player:black", avatarNum: "9" });
  });
});
