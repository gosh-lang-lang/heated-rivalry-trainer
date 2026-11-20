import { describe, expect, it } from "vitest";
import { rankVoices, voiceScore } from "./voices";

const v = (name: string, lang = "en-GB") => ({ name, lang });

describe("выбор голоса", () => {
  it("шуточные голоса отсекаются на обоих языках", () => {
    const r = rankVoices([v("Zarvox", "en-US"), v("Хорошие новости", "en-US"), v("Grandpa (английский (Великобритания))"), v("Дэниэл")]);
    expect(r.map((x) => x.name)).toEqual(["Дэниэл"]);
  });
  it("Premium/Enhanced/Natural и Google — выше обычных", () => {
    const r = rankVoices([v("Daniel"), v("Serena (Premium)"), v("Google UK English Female"), v("Microsoft Sonia Online (Natural) - English (United Kingdom)")]);
    expect(r[0].name).toMatch(/Premium|Natural/);
    expect(r[r.length - 1].name).toBe("Daniel");
  });
  it("локализованное имя Daniel узнаётся", () => expect(voiceScore(v("Дэниэл"))).toBe(voiceScore(v("Daniel"))));
  it("британский голос выше американского при прочих равных", () =>
    expect(rankVoices([v("Eddy (US)", "en-US"), v("Eddy (UK)", "en-GB")])[0].lang).toBe("en-GB"));
  it("неанглийские не попадают в список", () => expect(rankVoices([v("Милена", "ru-RU")])).toEqual([]));
});
