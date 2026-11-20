// node render.mjs [filter] — снимает экраны src/*.html в shots/, затем доски boards/*.html в корень.
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
const require = createRequire("/Users/dltr/учу читаю/app/package.json");
const { chromium } = require("@playwright/test");
const DIR = path.dirname(fileURLToPath(import.meta.url));
const f = process.argv[2] || "";

const PHONE = { width: 390, height: 844 };
export const SHOTS = [
  ["words-a", "words.html?v=a"],
  ["words-b", "words.html?v=b&scroll=520"],
  ["words-c", "words.html?v=c"],
  ["path-a", "path.html?v=a"],
  ["path-b", "path.html?v=b"],
  ["path-a-dark", "path.html?v=a&theme=dark"],
  ["path-desk", "path-desk.html", { width: 1440, height: 960 }],
  ["reward-result", "result.html"],
  ["collection", "collection.html"],
  ["collection-dark", "collection.html?theme=dark"],
  ["card-front", "collection.html?modal=front"],
  ["card-back", "collection.html?modal=back"],
  ["w2-A1", "words2.html?v=A1"],
  ["w2-A2", "words2.html?v=A2"],
  ["w2-B1", "words2.html?v=B1"],
  ["w2-B2", "words2.html?v=B2&scroll=1090"],
  ["w2-C1", "words2.html?v=C1"],
  ["w2-C2", "words2.html?v=C2"],
  ["w3-list-night", "words3.html?v=list&theme=dark"],
  ["w3-word-night", "words3.html?v=word&theme=dark"],
  ["w3-list-day", "words3.html?v=list&theme=light&lesson=1"],
  ["w3-desk-night", "words3.html?v=desk&theme=dark", { width: 1440, height: 900 }],
  ["me-a", "me.html"],
  ["me-b", "me.html?scroll=560"],
  ["me-c", "me.html?scroll=1424"],
  ["me-d", "me.html?scroll=99999"],
];
const BOARDS = ["1-words", "2-path", "3-rewards", "4-progress", "1-words-v2", "1-words-c"];

const b = await chromium.launch();
for (const [name, url, vp] of SHOTS) {
  if (f && !name.startsWith(f) && f !== "shots") continue;
  const ctx = await b.newContext({ viewport: vp || PHONE, deviceScaleFactor: 2, colorScheme: url.includes("dark") ? "dark" : "light" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERR", e.message));
  await p.goto("file://" + DIR + "/src/" + url);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/shots/${name}.png` });
  await ctx.close();
  console.log("shot", name);
}
for (const name of BOARDS) {
  if (f && !name.startsWith(f) && f !== "boards") continue;
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log(name, "ERR", e.message));
  await p.goto("file://" + DIR + "/boards/" + name + ".html");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  await p.locator(".board").screenshot({ path: `${DIR}/${name}.png` });
  await ctx.close();
  console.log("board", name);
}
await b.close();
