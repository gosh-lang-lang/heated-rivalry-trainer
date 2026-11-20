/**
 * Иллюстрации к словам: сцена по предложению-примеру (поле example), слоями — фон, персонажи,
 * подвижные предметы — и с движением смыслового акцента (цикл 2–4 с).
 *
 * Здесь — то, что пишется руками: откуда брать слои и как они движутся.
 * Геометрия слоёв (рамка каждого на холсте, версия файлов) — word-art.gen.json, его пишет
 * scripts/word-art.ts из art-inbox/<src>/layers.json; там же — webp в public/words/<id>/.
 * Новое слово: сцена в art-inbox → запись в SCENES → `node scripts/word-art.ts <id>`. Экраны не трогаем.
 */

/** Координаты — в пикселях исходного холста сцены (1024×1024, начало сверху слева). */
export const ART_CANVAS = 1024;
/** Сторона холста в webp: ~2× ширины карточки на телефоне. */
export const ART_EXPORT = 640;
/** Картинка для списка: 56 px × 3. */
export const ART_LIST = 168;
/** Неподвижная сцена целиком (подсказка в «Впиши», «Выбери перевод» после ответа). */
export const ART_STILL = 480;

/** Кадр движения слоя. at — доля цикла 0…1; x, y — сдвиг в пикселях холста; r — градусы; s — масштаб (sx, sy — по осям); o — непрозрачность. */
export interface ArtKey {
  at: number;
  x?: number;
  y?: number;
  r?: number;
  s?: number;
  sx?: number;
  sy?: number;
  o?: number;
  /** сглаживание участка ОТ этого кадра до следующего; по умолчанию ease-in-out */
  ease?: string;
}

export interface ArtMotion {
  /** точка, вокруг которой поворот и масштаб (пиксели холста); по умолчанию — центр слоя */
  origin?: [number, number];
  keys: ArtKey[];
}

export interface ArtSceneSpec {
  /** папка в art-inbox с layers.json и PNG слоёв */
  src: string;
  /** длина цикла, мс */
  dur: number;
  /** что держать в кадре по вертикали (доля холста), когда кадр ниже квадрата; по умолчанию 0.5 */
  focus?: number;
  /** качество webp слоёв (по умолчанию 75); ниже — если сцена не влезает в 60 КБ */
  quality?: number;
  /** свой кроп для списка [x, y, сторона] в пикселях холста; без него — кроп от художника (crop в layers.json) */
  list?: [x: number, y: number, size: number];
  /** движение слоёв по имени (word-<id>-<имя>.png); слои без записи стоят на месте */
  motion: Record<string, ArtMotion>;
}

export type ArtBox = [x: number, y: number, w: number, h: number];
export interface ArtLayerGen {
  name: string;
  /** рамка слоя на холсте (обрезан по непрозрачному), пиксели холста */
  box: ArtBox;
}
export interface ArtSceneGen {
  /** версия файлов — в адрес, чтобы кэш не держал старую картинку */
  v: string;
  /** средний цвет фона — пока слои грузятся */
  bg: string;
  /** от заднего к переднему */
  layers: ArtLayerGen[];
}
export type ArtGen = Record<string, ArtSceneGen>;

/* --- общие движения (один объект на несколько слоёв — двигаются как одно целое) --- */

/** praise: критики смеются, покачиваясь назад — каждый в свою сторону, в разном ритме; ось — у нижнего края */
const laughLeft: ArtMotion = {
  origin: [280, 1024],
  keys: [{ at: 0 }, { at: 0.15, r: -1.3, y: -6, ease: "ease-out" }, { at: 0.3, r: -0.4 }, { at: 0.45, r: -1.5, y: -7, ease: "ease-out" }, { at: 0.6, r: -0.5 }, { at: 0.8 }, { at: 1 }],
};
const laughRight: ArtMotion = {
  origin: [710, 1024],
  keys: [{ at: 0 }, { at: 0.1 }, { at: 0.25, r: 1.3, y: -5, ease: "ease-out" }, { at: 0.4, r: 0.4 }, { at: 0.55, r: 1.6, y: -7, ease: "ease-out" }, { at: 0.7, r: 0.5 }, { at: 0.88 }, { at: 1 }],
};

/** devour: светило встаёт в окне со сдвигом start (доля цикла) и снова через полцикла — «два дня» */
const rise = (start: number): ArtMotion => {
  const one = (t: number): ArtKey[] => [
    { at: t, o: 0, y: 30 },
    { at: t + 0.05, o: 1, y: 0, ease: "ease-out" },
    { at: t + 0.2, o: 1, y: 0 },
    { at: t + 0.25, o: 0, y: 30 },
  ];
  const keys = [...one(start), ...one(start + 0.5)];
  if (keys[0].at > 0) keys.unshift({ at: 0, o: 0, y: 30 });
  if (keys[keys.length - 1].at < 1) keys.push({ at: 1, o: 0, y: 30 });
  return { keys };
};
/** devour: оконце-счётчик вспыхивает в свою четверть цикла */
const tick = (start: number): ArtMotion => ({
  keys: [{ at: 0 }, ...(start > 0 ? [{ at: start }] : []), { at: start + 0.06, s: 1.45, ease: "ease-out" }, { at: start + 0.16 }, { at: 1 }],
});
/** devour: читательница вместе с книгой и кистями подаётся к странице — дважды за цикл */
const readerLean: ArtMotion = {
  origin: [492, 960],
  keys: [{ at: 0 }, { at: 0.18, r: 1.2, y: -4 }, { at: 0.38 }, { at: 0.5 }, { at: 0.68, r: 1.2, y: -4 }, { at: 0.88 }, { at: 1 }],
};

/** sacred: медленный вдох-выдох — тело, руки и кружка как одно целое */
const breath: ArtMotion = { origin: [505, 1000], keys: [{ at: 0 }, { at: 0.45, y: -6, r: -0.4 }, { at: 1 }] };

/** rambunctious: второй щенок скачет с носком в зубах */
const puppy2: ArtMotion = {
  origin: [210, 940],
  keys: [{ at: 0, y: -10 }, { at: 0.25, ease: "ease-in" }, { at: 0.5, y: -18, r: 3, ease: "ease-out" }, { at: 0.75, ease: "ease-in" }, { at: 1, y: -10 }],
};

/** слой виден в неподвижном кадре, а в движении скрыт (его роль играет другой слой) */
const hidden: ArtMotion = { keys: [{ at: 0, o: 0 }, { at: 1, o: 0 }] };

export const SCENES: Record<string, ArtSceneSpec> = {
  /* The players enjoy friendly banter before the game.
     Жёлтый наклоняется и подкалывает → над ними вспыхивает «подкол» → Красный хохочет, запрокинув голову. */
  banter: {
    src: "stage-03/layers-v1",
    dur: 3600,
    focus: 0.42,
    list: [250, 40, 520], // лица и вспышка между ними — читается и в 56 px
    motion: {
      // ось — у колен: голова уходит заметно, коньки почти на месте
      red: {
        origin: [290, 760],
        keys: [
          { at: 0 },
          { at: 0.34 },
          { at: 0.4, r: -2.2, y: -9, ease: "ease-out" },
          { at: 0.47, r: -1.6, y: 0, ease: "ease-in" },
          { at: 0.54, r: -2.4, y: -10, ease: "ease-out" },
          { at: 0.61, r: -1.7, y: 0, ease: "ease-in" },
          { at: 0.68, r: -1.9, y: -4 },
          { at: 0.86 },
          { at: 1 },
        ],
      },
      yellow: {
        origin: [715, 760],
        keys: [
          { at: 0 },
          { at: 0.12 },
          { at: 0.28, r: -3.2, x: -12, ease: "ease-out" },
          { at: 0.36, r: -2, x: -4 },
          { at: 0.5, r: -2.4, x: -5, y: -5 },
          { at: 0.62, r: -1.8, x: -4 },
          { at: 0.88 },
          { at: 1 },
        ],
      },
      // вспышка у точки «подкола»: выскакивает, держится, гаснет
      nudge: {
        origin: [468, 252],
        keys: [
          { at: 0, o: 0, s: 0.4 },
          { at: 0.27, o: 0, s: 0.4, ease: "ease-out" },
          { at: 0.32, o: 1, s: 1.4 },
          { at: 0.37, o: 1, s: 1.05 },
          { at: 0.46, o: 1, s: 1.2 },
          { at: 0.56, o: 1, s: 1.05 },
          { at: 0.68, o: 0, s: 1.1 },
          { at: 1, o: 0, s: 0.4 },
        ],
      },
    },
  },

  /* The new book got a lot of praise.
     Два критика хохочут от восторга над книгой — покачиваются в разном ритме, книга приподнимается.
     Кисти поверх книги (grip) — вместе со своим критиком. */
  praise: {
    src: "stage-03/layers-v1",
    dur: 3200,
    focus: 0.55,
    motion: {
      critic1: laughLeft,
      "critic1-grip": laughLeft,
      critic2: laughRight,
      "critic2-grip": laughRight,
      book: {
        origin: [523, 980],
        keys: [{ at: 0 }, { at: 0.18, y: -4 }, { at: 0.32 }, { at: 0.5, y: -6, r: 0.6 }, { at: 0.66, y: -1 }, { at: 0.86 }, { at: 1 }],
      },
    },
  },

  /* I devoured the book in two days.
     В окне по очереди встают солнце и луна — дважды; в оконцах сверху отмечается каждый день и ночь.
     Читательница с книгой подаётся вперёд — «проглатывает». */
  devour: {
    src: "stage-03/layers-v1",
    dur: 4000,
    focus: 0.3, // кадр 4:3 — по верху: оконца-счётчики дней важнее стопки книг внизу
    motion: {
      sun3: rise(0),
      moon3: rise(0.25),
      sun1: tick(0),
      moon1: tick(0.25),
      sun2: tick(0.5),
      moon2: tick(0.75),
      reader: readerLean,
      book: readerLean,
      "reader-grip-left": readerLean,
      "reader-grip-right": readerLean,
    },
  },

  /* For him, Sunday morning is sacred.
     Красный с закрытыми глазами вдыхает кофе: медленный вдох-выдох, пар поднимается, солнце тихо пульсирует. */
  sacred: {
    src: "stage-03/layers-v1",
    dur: 4000,
    focus: 0.4,
    motion: {
      "red-body": breath,
      "red-arm-left": breath,
      "red-arm-right": breath,
      mug: breath,
      steam: {
        origin: [690, 440],
        keys: [
          { at: 0, o: 0, y: 24, s: 0.9 },
          { at: 0.25, o: 1, y: 0, s: 1 },
          { at: 0.6, o: 0.9, y: -26, s: 1.05 },
          { at: 0.85, o: 0, y: -46, s: 1.1 },
          { at: 1, o: 0, y: 24, s: 0.9 },
        ],
      },
      sun: { keys: [{ at: 0 }, { at: 0.5, s: 1.12 }, { at: 1 }] },
    },
  },

  /* Our rambunctious puppies ran all over the house.
     Три щенка скачут вразнобой: носок — в зубах у второго, плед с дивана тащит третий; подушка и книги подпрыгивают. */
  rambunctious: {
    src: "stage-03/layers-v1",
    dur: 2400,
    focus: 0.55,
    quality: 70, // много подвижных слоёв — иначе больше 60 КБ
    motion: {
      puppy1: {
        origin: [495, 735],
        keys: [{ at: 0 }, { at: 0.25, y: -30, r: -3, ease: "ease-out" }, { at: 0.5, ease: "ease-in" }, { at: 0.75, y: -22, r: -2, ease: "ease-out" }, { at: 1, ease: "ease-in" }],
      },
      puppy2: puppy2,
      sock: puppy2,
      puppy3: {
        origin: [845, 480],
        keys: [{ at: 0 }, { at: 0.2, y: -20, r: 4, ease: "ease-out" }, { at: 0.4, ease: "ease-in" }, { at: 0.6, y: -16, r: 3, ease: "ease-out" }, { at: 0.8, ease: "ease-in" }, { at: 1 }],
      },
      // плед тащит белый щенок: край пледа (≈750, 330) ходит вместе с его прыжками, поворот — вокруг дивана
      blanket: {
        origin: [240, 220],
        keys: [{ at: 0 }, { at: 0.2, r: -2.9, x: 5, sy: 1.04, ease: "ease-out" }, { at: 0.4, ease: "ease-in" }, { at: 0.6, r: -2.3, x: 4, sy: 1.03, ease: "ease-out" }, { at: 0.8, ease: "ease-in" }, { at: 1 }],
      },
      cushion: {
        origin: [538, 910],
        keys: [{ at: 0 }, { at: 0.45 }, { at: 0.55, y: -14, r: -5, ease: "ease-out" }, { at: 0.68, ease: "ease-in" }, { at: 0.74, y: -4, r: 1 }, { at: 0.8 }, { at: 1 }],
      },
      book1: {
        origin: [900, 815],
        keys: [{ at: 0 }, { at: 0.08, y: -8, r: -4, ease: "ease-out" }, { at: 0.18, ease: "ease-in" }, { at: 1 }],
      },
      book2: {
        origin: [835, 970],
        keys: [{ at: 0 }, { at: 0.55 }, { at: 0.63, y: -7, r: 3, ease: "ease-out" }, { at: 0.73, ease: "ease-in" }, { at: 1 }],
      },
    },
  },

  /* He slept the entire day.
     Солнце проходит по стрелке весь путь — от восхода слева до заката справа, а он спит: одеяло мерно дышит.
     В неподвижном кадре видны все три солнца (как нарисовано), в движении — одно, идущее по дуге. */
  entire: {
    src: "stage-03/layers-v1",
    dur: 4000,
    focus: 0.45,
    motion: {
      sun1: {
        origin: [223, 338],
        keys: [
          { at: 0, o: 0, y: 24 },
          { at: 0.06, o: 1, ease: "linear" },
          // дуга через верхнее солнце (sun2) к правому (sun3)
          { at: 0.193, x: 68, y: -101, ease: "linear" },
          { at: 0.327, x: 170, y: -169, ease: "linear" },
          { at: 0.46, x: 290, y: -193, s: 1.1, ease: "linear" },
          { at: 0.593, x: 410, y: -169, ease: "linear" },
          { at: 0.727, x: 512, y: -101, ease: "linear" },
          { at: 0.86, x: 580, y: 0 },
          { at: 0.94, x: 580, y: 24, o: 0 },
          { at: 1, o: 0, y: 24 },
        ],
      },
      sun2: hidden,
      sun3: hidden,
      blanket: { origin: [712, 1000], keys: [{ at: 0 }, { at: 0.25, sy: 1.03 }, { at: 0.5 }, { at: 0.75, sy: 1.03 }, { at: 1 }] },
      sleeper: { origin: [608, 940], keys: [{ at: 0 }, { at: 0.25, y: -3 }, { at: 0.5 }, { at: 0.75, y: -3 }, { at: 1 }] },
    },
  },
};

const pct = (n: number) => `${+n.toFixed(3)}%`;

/** Движение слоя → transform-origin и кадры Web Animations (сдвиг — в % от рамки слоя, чтобы не зависеть от размера на экране). */
export function toKeyframes(m: ArtMotion, box: ArtBox): { origin: string; frames: Keyframe[] } {
  const [bx, by, bw, bh] = box;
  const [ox, oy] = m.origin ?? [bx + bw / 2, by + bh / 2];
  const frames = m.keys.map((k) => {
    const t = [`translate(${pct(((k.x ?? 0) / bw) * 100)}, ${pct(((k.y ?? 0) / bh) * 100)})`, `rotate(${k.r ?? 0}deg)`, `scale(${k.sx ?? k.s ?? 1}, ${k.sy ?? k.s ?? 1})`].join(" ");
    return { offset: k.at, transform: t, opacity: k.o ?? 1, easing: k.ease ?? "ease-in-out" } satisfies Keyframe;
  });
  return { origin: `${pct(((ox - bx) / bw) * 100)} ${pct(((oy - by) / bh) * 100)}`, frames };
}

/** Рамка слоя в % от холста — для абсолютного позиционирования. */
export const boxStyle = ([x, y, w, h]: ArtBox) => ({ left: pct((x / ART_CANVAS) * 100), top: pct((y / ART_CANVAS) * 100), width: pct((w / ART_CANVAS) * 100), height: pct((h / ART_CANVAS) * 100) });

/** Адрес файла сцены в public/. */
export const artUrl = (id: string, file: string, v: string) => `/words/${id}/${file}.webp?v=${v}`;

/** Проверки: описание сцен ↔ сгенерированные слои ↔ слова. */
export function checkArt(specs: Record<string, ArtSceneSpec>, gen: ArtGen, wordIds: string[]): string[] {
  const errs: string[] = [];
  const words = new Set(wordIds);
  for (const id of new Set([...Object.keys(specs), ...Object.keys(gen)])) {
    const s = specs[id],
      g = gen[id];
    if (!words.has(id)) errs.push(`${id}: нет такого слова`);
    if (!s) errs.push(`${id}: слои есть, описания сцены нет`);
    if (!g) errs.push(`${id}: описание есть, слои не собраны (node scripts/word-art.ts ${id})`);
    if (!s || !g) continue;
    if (g.layers[0]?.name !== "bg") errs.push(`${id}: первым слоем должен идти фон`);
    if (!(s.dur >= 2000 && s.dur <= 4000)) errs.push(`${id}: цикл ${s.dur} мс — нужно 2–4 с`);
    if (s.list && (s.list[0] < 0 || s.list[1] < 0 || s.list[2] <= 0 || s.list[0] + s.list[2] > ART_CANVAS || s.list[1] + s.list[2] > ART_CANVAS)) errs.push(`${id}: кроп для списка вне холста`);
    const names = new Set(g.layers.map((l) => l.name));
    for (const [name, m] of Object.entries(s.motion)) {
      if (!names.has(name)) errs.push(`${id}: движение для слоя «${name}», а такого слоя нет`);
      const at = m.keys.map((k) => k.at);
      if (at[0] !== 0 || at[at.length - 1] !== 1) errs.push(`${id}/${name}: кадры должны идти от 0 до 1`);
      if (at.some((a, i) => i > 0 && a < at[i - 1])) errs.push(`${id}/${name}: кадры не по порядку`);
      const [a, b] = [m.keys[0], m.keys[m.keys.length - 1]];
      if (["x", "y", "r", "s", "sx", "sy", "o"].some((p) => a[p as keyof ArtKey] !== b[p as keyof ArtKey])) errs.push(`${id}/${name}: конец цикла не совпадает с началом — будет рывок`);
    }
    for (const l of g.layers) {
      const [x, y, w, h] = l.box;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > ART_CANVAS + 0.01 || y + h > ART_CANVAS + 0.01) errs.push(`${id}/${l.name}: рамка вне холста`);
    }
  }
  return errs;
}
