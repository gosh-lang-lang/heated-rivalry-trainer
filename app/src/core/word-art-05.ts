/**
 * Сцены этапа 5 (56 слов) — слои от ChatGPT в art-inbox/stage-05/layers-b1…b7, движение — здесь.
 * Как устроена запись — word-art.ts (ArtSceneSpec). Над каждой сценой — пример и что в ней движется.
 * Координаты — пиксели холста 1024×1024; кадр 4:3 в карточке — полоса y 128…896 (focus 0.5).
 */
import type { ArtSceneSpec } from "./word-art.ts";
import { follow, hiddenIn, IN, k, OUT, shake, shown, spin, wave } from "./word-art-motion.ts";

const src = (b: number) => `stage-05/layers-b${b}`;
const REDO = "stage-05/layers-redo1";
const REDO2 = "stage-05/layers-redo2";

const SCENES_05: Record<string, ArtSceneSpec> = {
  /* ── пачка 1 ── */

  /* She writes novels about hockey players.
     Над машинкой качается облачко-мечта с хоккеистами; лист вылетает из машинки и уносится, второй порхает. */
  novel: {
    src: src(1),
    dur: 3600,
    motion: {
      imagination: wave({ y: -8, r: 1.5 }, { origin: [640, 660] }),
      page1: {
        origin: [695, 725],
        keys: [k(0, { o: 0, x: -50, y: 40, r: -12 }), k(0.1, { o: 1, x: -30, y: 20, r: -8 }, "ease-out"), k(0.55, { x: 40, y: -40, r: 10 }), k(0.75, { o: 0, x: 80, y: -70, r: 16 }), k(1, { o: 0, x: -50, y: 40, r: -12 })],
      },
      page2: wave({ y: -10, r: 6, x: 4 }, { n: 2, phase: 0.2, origin: [875, 655] }),
    },
  },

  /* The kids are playing on the lawn.
     Средний прыгает в куче листьев, листья взлетают и оседают, двое по бокам смеются. */
  "autumn-lawn": {
    src: src(1),
    dur: 2800,
    motion: {
      child1: { origin: [505, 680], keys: [k(0), k(0.12, { sy: 0.97, y: 6 }, "ease-out"), k(0.38, { y: -46, r: -2 }, "ease-out"), k(0.62, {}, "ease-in"), k(0.7, { sy: 0.98, y: 4 }), k(0.8), k(1)] },
      leaves: { origin: [520, 900], keys: [k(0), k(0.2), k(0.45, { y: -22, s: 1.03, r: 1.5 }, "ease-out"), k(0.85, { y: 0, r: -0.5 }, "ease-in"), k(1)] },
      child2: wave({ r: -1.5, y: -4 }, { n: 2, origin: [189, 884] }),
      child3: wave({ r: 1.5, y: -4 }, { n: 2, phase: 0.25, origin: [840, 825] }),
    },
  },

  /* He is passionate about hockey.
     Красный рвётся вперёд, сжав кулак; пламя на свитере полыхает. */
  passionate: {
    src: src(1),
    dur: 3200,
    motion: {
      red: { origin: [420, 1024], keys: [k(0), k(0.2, { r: 1.6, y: -10 }, "ease-out"), k(0.32, { r: 0.8, y: -3 }), k(0.44, { r: 1.8, y: -12 }, "ease-out"), k(0.62), k(1)] },
      flame: follow("red", wave({ sy: 0.1, sx: -0.04 }, { n: 4, origin: [490, 830] })),
    },
  },

  /* The book is an exploration of first love.
     Компас с сердцем-стрелкой ищет — и находит; двое идут по страницам навстречу. */
  exploration: {
    src: src(1),
    dur: 3600,
    focus: 0.55,
    motion: {
      compass: { origin: [512, 408], keys: [k(0), k(0.15, { r: 28 }, "ease-out"), k(0.3, { r: -18 }), k(0.42, { r: 8 }), k(0.52, { r: -3 }), k(0.6), k(1)] },
      lover1: { origin: [363, 805], keys: [k(0), k(0.12, { x: 6, y: -5 }), k(0.24, { x: 12 }), k(0.36, { x: 18, y: -5 }), k(0.48, { x: 24 }), k(0.85, { x: 0 }), k(1)] },
      lover2: { origin: [633, 805], keys: [k(0), k(0.12, { x: -6, y: -5 }), k(0.24, { x: -12 }), k(0.36, { x: -18, y: -5 }), k(0.48, { x: -24 }), k(0.85, { x: 0 }), k(1)] },
    },
  },

  /* The team is red-hot this month.
     Красный рывком уходит вперёд, огненный след за коньками полыхает, шайба у клюшки. */
  "red-hot": {
    src: src(1),
    dur: 2800,
    motion: {
      red: { origin: [560, 876], keys: [k(0), k(0.3, { x: 18, y: -4, r: 1 }, "ease-out"), k(0.55, { x: 12 }), k(1)] },
      firetrail: follow("red", wave({ sx: 0.06, sy: -0.05, o: 0.15 }, { n: 3, origin: [870, 860] })),
      puck: follow("red", wave({ x: 6 }, { n: 2 })),
    },
  },

  /* They are on a five-game winning streak.
     Пять звёзд над командой загораются по очереди, после пятой — все вспыхивают разом. */
  streak: {
    src: src(1),
    dur: 3600,
    motion: Object.fromEntries(
      [1, 2, 3, 4, 5].map((i) => {
        const a = 0.06 + (i - 1) * 0.11;
        return [
          `star${i}`,
          { keys: [k(0, { o: 0.3, s: 0.85 }), k(a, { o: 0.3, s: 0.85 }, "ease-out"), k(a + 0.05, { o: 1, s: 1.25 }), k(a + 0.1, { o: 1, s: 1 }), k(0.68, { o: 1, s: 1 }, "ease-out"), k(0.73, { o: 1, s: 1.18 }), k(0.8, { o: 1, s: 1 }), k(0.9, { o: 1, s: 1 }), k(1, { o: 0.3, s: 0.85 })] },
        ];
      }),
    ),
  },

  /* The smell of fresh coffee is irresistible.
     Пар вьётся лентами к Жёлтому, а он с блаженной улыбкой тянется к кружке. */
  irresistible: {
    src: src(1),
    dur: 3600,
    motion: {
      steam: wave({ x: -10, sy: 0.05, r: -2 }, { origin: [800, 675] }),
      yellow: wave({ r: 1.6, x: 6 }, { phase: 0.1, origin: [319, 906] }),
    },
  },


  /* ── пачка 2 ── */

  /* He scored two goals last night.
     Шайба влетает в сетку (первая уже там), над воротами вспыхивает лампа; Красный доводит бросок. */
  score: {
    src: src(2),
    dur: 3200,
    motion: {
      puck: { keys: [k(0, { o: 0, x: -250, y: 95 }), k(0.12, { o: 0, x: -250, y: 95 }, "linear"), k(0.14, { o: 1, x: -230, y: 88 }, "ease-out"), k(0.3, { x: 0, y: 0 }), k(0.33, { x: 6 }), k(0.36), k(0.8), k(0.88, { o: 0 }), k(1, { o: 0, x: -250, y: 95 })] },
      "goal-lamp": { origin: [835, 300], keys: [k(0), k(0.3), k(0.34, { s: 1.18 }, "ease-out"), k(0.4, { s: 1 }), k(0.46, { s: 1.14 }), k(0.52, { s: 1 }), k(0.58, { s: 1.1 }), k(0.66), k(1)] },
      red: { origin: [345, 880], keys: [k(0, { r: -2.5 }), k(0.1, { r: -3 }, "ease-in"), k(0.16, { r: 1.5 }, "ease-out"), k(0.3, { r: 1 }), k(0.4, { r: 0 }), k(1, { r: -2.5 })] },
    },
  },

  /* Can I have another coffee?
     Жёлтый с улыбкой подставляет кружку — «ещё»; бариста льёт, струя кофе живая. */
  another: {
    src: src(2),
    dur: 3200,
    motion: {
      yellow: wave({ r: 0.8, y: -3 }, { origin: [252, 906] }),
      "yellow-arm": follow("yellow", wave({ r: -2, y: -4 }, { n: 2, phase: 0.1, origin: [150, 640] })),
      mug: follow("yellow", wave({ r: -2, y: -4 }, { n: 2, phase: 0.1, origin: [150, 640] })),
      coffee: wave({ sy: 0.08, sx: 0.12 }, { n: 4, origin: [564, 510] }),
    },
  },

  /* He winked at me and smiled.
     Жёлтый подмигивает — веко опускается, у глаза вспыхивает искра, голова чуть наклоняется. */
  wink: {
    src: src(2),
    dur: 2800,
    focus: 0.55,
    motion: {
      yellow: { origin: [461, 1021], keys: [k(0), k(0.25), k(0.35, { r: -1.8, y: -4 }), k(0.62, { r: -1.8, y: -4 }), k(0.75), k(1)] },
      "eye-closed": follow("yellow", shown(0.3, 0.62, 0.04)),
      spark: follow("yellow", { origin: [459, 485], keys: [k(0, { o: 0, s: 0.3, r: -40 }), k(0.32, { o: 0, s: 0.3, r: -40 }, "ease-out"), k(0.4, { o: 1, s: 1.25, r: 0 }), k(0.48, { o: 1, s: 0.95 }), k(0.56, { o: 1, s: 1.1 }), k(0.68, { o: 0, s: 0.6, r: 20 }), k(1, { o: 0, s: 0.3, r: -40 })] }),
    },
  },

  /* The cat was firmly ensconced on the sofa.
     Кот развалился и мерно дышит, никуда не собираясь; хозяин с подушкой переминается рядом. */
  "firmly-ensconced": {
    src: src(2),
    dur: 4000,
    focus: 0.55,
    motion: {
      cat: wave({ sy: 0.025 }, { origin: [630, 725] }),
      owner: wave({ r: 1.2, x: 4 }, { phase: 0.25, origin: [215, 920] }),
    },
  },

  /* This film takes on sensitive topics.
     Сердце на экране разбито — и склеивается пластырем; зрители в зале замерли.
     Зрительницу (viewer) художник посадил поверх парня в красном с фона — сняли. */
  "take-on-sensitive-topics": {
    src: src(2),
    dur: 3600,
    focus: 0.45,
    drop: ["viewer"],
    motion: {
      "heart-broken": { origin: [525, 325], keys: [k(0), k(0.12, { r: -4 }), k(0.2, { r: 4 }), k(0.28, { r: -3 }), k(0.36, { r: 0 }), k(0.42), k(0.48, { o: 0, s: 0.9 }), k(0.92, { o: 0, s: 0.9 }), k(1)] },
      "heart-healed": { origin: [525, 325], keys: [k(0, { o: 0, s: 0.9 }), k(0.42, { o: 0, s: 0.9 }, "ease-out"), k(0.5, { o: 1, s: 1.15 }), k(0.58, { o: 1, s: 1 }), k(0.66, { o: 1, s: 1.08 }), k(0.74, { o: 1, s: 1 }), k(0.92, { o: 1, s: 1 }), k(1, { o: 0, s: 0.9 })] },
    },
  },

  /* She wrote him a heartfelt letter.
     Из конверта всплывает сердце и бьётся, она с улыбкой дописывает. */
  heartfelt: {
    src: src(2),
    dur: 3200,
    motion: {
      heart: { origin: [785, 330], keys: [k(0), k(0.1, { s: 1.07, y: -5 }, "ease-out"), k(0.18, { y: -7 }), k(0.26, { s: 1.06, y: -10 }, "ease-out"), k(0.36, { y: -12 }), k(0.7, { y: -5 }), k(1)] },
      writer: wave({ r: 0.7, y: -2 }, { n: 2, origin: [321, 907] }),
    },
  },

  /* He is always grumpy in the morning.
     Над ним туча, будильник трезвонит и трясётся — он хмурится сильнее и зарывается в подушку. */
  grumpy: {
    src: src(2),
    dur: 3200,
    focus: 0.55,
    motion: {
      alarm: shake(0.08, 0.5, { r: 7, x: 3 }, 12, [840, 890]),
      cloud: wave({ x: 10, y: -4 }, { origin: [475, 250] }),
      yellow: { origin: [372, 929], keys: [k(0), k(0.12), k(0.22, { y: 6, r: 1 }), k(0.52, { y: 6, r: 1 }), k(0.66), k(1)] },
      "brows-angry": follow("yellow", { keys: [k(0), k(0.12), k(0.2, { y: 4, sy: 0.85 }), k(0.52, { y: 4, sy: 0.85 }), k(0.62), k(1)] }),
    },
  },

  /* I love enemies-to-lovers stories.
     В облачке слева соперники искрят и ругаются — гаснет; в облачке справа вспыхивает сердце. Читательница улыбается. */
  "enemies-to-lovers": {
    src: src(2),
    dur: 3600,
    // облако ссоры нарисовано приплюснутым — вытягиваем; оба облака меньше, чтобы не теснили читательницу
    reshape: { rivalry: { s: 0.85, sy: 1.15 }, love: { s: 0.85 } },
    motion: {
      rivalry: { origin: [290, 590], keys: [k(0), k(0.05, { r: -2, x: -4 }), k(0.1, { r: 2, x: 4 }), k(0.15, { r: -2, x: -4 }), k(0.2, { r: 1.5, x: 3 }), k(0.25), k(0.4), k(0.5, { o: 0.55, s: 0.95 }), k(0.88, { o: 0.55, s: 0.95 }), k(1)] },
      love: { origin: [740, 590], keys: [k(0, { o: 0.55, s: 0.95 }), k(0.38, { o: 0.55, s: 0.95 }, "ease-out"), k(0.48, { o: 1, s: 1.08 }), k(0.56, { o: 1, s: 1 }), k(0.66, { o: 1, s: 1.05 }), k(0.76, { o: 1, s: 1 }), k(0.88, { o: 1, s: 1 }), k(1, { o: 0.55, s: 0.95 })] },
      reader: wave({ r: 1, y: -3 }, { origin: [505, 1024] }),
    },
  },

  /* ── пачка 3 ── */

  /* We have loads of time.
     Двое лениво качаются в гамаке, облака плывут, песочные часы стоят — торопиться некуда. */
  "loads-of": {
    src: src(3),
    dur: 4000,
    focus: 0.55,
    motion: {
      couple: wave({ r: 1.4, x: 6 }, { origin: [512, 250] }),
      clouds: wave({ x: 18 }, { phase: 0.25 }),
    },
  },

  /* I literally ran to the station.
     Бегун мчится к вокзалу, стрелка часов на фасаде крутится, поезд у платформы вот-вот уйдёт. */
  literally: {
    src: src(3),
    dur: 2400,
    motion: {
      runner: { origin: [333, 930], keys: [k(0), k(0.12, { y: -12, r: 1.5 }, "ease-in"), k(0.25, { x: 4 }, "ease-out"), k(0.37, { y: -12, r: 1.5 }, "ease-in"), k(0.5, {}, "ease-out"), k(0.62, { y: -12, r: 1.5 }, "ease-in"), k(0.75, { x: 4 }, "ease-out"), k(0.87, { y: -12, r: 1.5 }, "ease-in"), k(1)] },
      "clock-hand": spin([826, 283], 12),
      train: wave({ x: 10, y: -1.5 }),
    },
  },

  /* The steak was still sizzling on the plate.
     Пар клубится и уходит вверх, брызги масла выскакивают и пропадают. */
  sizzling: {
    src: src(3),
    dur: 2400,
    motion: {
      steam: { origin: [505, 550], keys: [k(0, { o: 0.4, y: 20, sy: 0.9 }), k(0.4, { y: 0 }), k(0.75, { o: 0.85, y: -16, sy: 1.06, x: 6 }), k(1, { o: 0.4, y: 20, sy: 0.9 })] },
      splatters: wave({ s: 0.08, o: 0.6 }, { n: 3, origin: [497, 520] }),
    },
  },

  /* All the stories are tied up in the last chapter.
     Свободные ленты на последней главе стягиваются в бант. */
  "all-tied-up": {
    src: src(3),
    dur: 3200,
    focus: 0.6,
    motion: {
      "ribbons-loose": { origin: [520, 650], keys: [k(0), k(0.15, { r: -2 }), k(0.3, { r: 2 }), k(0.4, { s: 0.85, o: 0 }), k(0.9, { s: 0.85, o: 0 }), k(1)] },
      bow: { origin: [520, 700], keys: [k(0, { o: 0, s: 0.7 }), k(0.36, { o: 0, s: 0.7 }, "ease-out"), k(0.46, { o: 1, s: 1.1 }), k(0.54, { s: 0.97 }), k(0.6), k(0.88), k(0.96, { o: 0, s: 0.9 }), k(1, { o: 0, s: 0.7 })] },
    },
  },


  /* It's a slow-burn story, so be patient.
     Между двумя на скамейке свеча: огонёк медленно разгорается в пламя. Они делают вид, что не смотрят. */
  "slow-burn": {
    src: src(3),
    dur: 4000,
    focus: 0.55,
    motion: {
      "flame-small": { origin: [525, 590], keys: [k(0), k(0.1, { sx: 0.92, sy: 1.06 }), k(0.2), k(0.3, { sx: 0.92, sy: 1.06 }), k(0.4), k(0.55, { o: 0 }), k(0.92, { o: 0 }), k(1)] },
      "flame-grown": { origin: [525, 590], keys: [k(0, { o: 0, s: 0.4 }), k(0.35, { o: 0, s: 0.4 }, "ease-out"), k(0.6, { o: 1, s: 0.9 }), k(0.75, { o: 1, s: 1, sx: 0.95 }), k(0.85, { o: 1, s: 1, sy: 1.04 }), k(0.92, { o: 1, s: 1 }), k(1, { o: 0, s: 0.4 })] },
      red: wave({ r: 0.8 }, { origin: [167, 975], phase: 0.5 }),
      yellow: wave({ r: -0.8 }, { origin: [849, 982] }),
    },
  },

  /* She endured three hours of meetings.
     Стрелки часов несутся по кругу, а она клюёт носом: голова клонится, вздрагивает — глаза на миг открываются. */
  endure: {
    src: src(3),
    dur: 4000,
    focus: 0.45,
    motion: {
      // у художника ось стрелок (760, 240) не в центре циферблата (802, 210): в движении ставим на центр и чуть уменьшаем,
      // чтобы минутная не вылезала за обод
      "clock-hand": { origin: [760, 240], keys: [k(0, { x: 42, y: -30, s: 0.8, r: 0 }, "linear"), k(1, { x: 42, y: -30, s: 0.8, r: 360 })] },
      woman: { origin: [341, 1024], keys: [k(0, { r: 0.6 }), k(0.3, { r: 1.8, y: 8 }, "ease-in"), k(0.34, { r: -0.5, y: -6 }, "ease-out"), k(0.5, { r: 0 }), k(1, { r: 0.6 })] },
      "eyes-closed": follow("woman", hiddenIn(0.32, 0.5, 0.02)),
    },
  },

  /* Losing your keys is so frustrating.
     Он в ярости роется в сумке, вещи сыплются — а ключи качаются в замке двери. */
  frustrating: {
    src: src(3),
    dur: 2800,
    motion: {
      searcher: shake(0.05, 0.45, { r: 1.2, y: 3 }, 6, [365, 1000]),
      items: { keys: [k(0), k(0.15, { y: -10 }, "ease-out"), k(0.3, {}, "ease-in"), k(0.38, { y: -5 }, "ease-out"), k(0.46, {}, "ease-in"), k(1)] },
      keys: wave({ r: 9 }, { origin: [845, 595] }),
    },
  },

  /* ── пачка 4 ── */

  /* It was a glorious sunny day.
     Солнце сияет — лучи покачиваются и пульсируют, флажки над набережной трепещут, велосипедисты катят. */
  glorious: {
    src: src(4),
    dur: 3600,
    motion: {
      "sun-rays": wave({ r: 10, s: 0.05 }, { origin: [785, 305] }),
      flags: wave({ sy: 0.06, r: 0.6 }, { n: 2, origin: [506, 200] }),
      cyclist: wave({ y: -3, r: 0.5 }, { n: 4, origin: [330, 1024] }),
    },
  },

  /* The Voyageurs play at home tonight.
     Прожекторы шарят по арене, Красный и партнёр выкатываются из туннеля. */
  voyageurs: {
    src: src(4),
    dur: 3600,
    motion: {
      spotlights: { ...wave({ r: 4, o: 0.3 }, { origin: [670, 48] }) },
      red: wave({ x: 12, y: -4, r: 1 }, { origin: [705, 950] }),
      teammate: wave({ x: 8, y: -3, r: 1 }, { phase: 0.15, origin: [290, 950] }),
    },
  },

  /* Montreal plays against Boston tonight.
     Обе стороны подаются к центру — клюшки сшибаются, вспыхивает искра, шайба дрожит. */
  against: {
    src: src(4),
    dur: 2800,
    motion: {
      red: { origin: [381, 857], keys: [k(0), k(0.3, { x: 10, r: 1.5 }, "ease-in"), k(0.36, { x: 6, r: 0.8 }, "ease-out"), k(0.7), k(1)] },
      yellow: { origin: [590, 834], keys: [k(0), k(0.3, { x: -10, r: -1.5 }, "ease-in"), k(0.36, { x: -6, r: -0.8 }, "ease-out"), k(0.7), k(1)] },
      spark: { origin: [502, 696], keys: [k(0, { o: 0, s: 0.3 }), k(0.28, { o: 0, s: 0.3 }, "ease-out"), k(0.33, { o: 1, s: 1.3, r: 15 }), k(0.42, { o: 1, s: 1, r: 0 }), k(0.55, { o: 0, s: 0.8 }), k(1, { o: 0, s: 0.3 })] },
      puck: { keys: [k(0), k(0.3), k(0.33, { x: 5 }), k(0.36, { x: -4 }), k(0.39, { x: 3 }), k(0.42), k(1)] },
    },
  },


  /* Boston is our archrival.
     Красный и Жёлтый лоб в лоб перед игрой, позади трибуна пополам — красная и жёлтая; между лбами трещит молния,
     Жёлтый расплывается в ухмылке. Перерисовано (layers-redo2). Художник дал игроков по пояс — в полном кадре это
     торсы над льдом с ровным срезом, поэтому сцена увеличена в 1,6 раза вокруг лиц: срез уходит за нижний край. */
  archrival: {
    src: REDO2,
    dur: 3200,
    focus: 0.5,
    reshape: { "*": { s: 1.6, at: [512, 230] } },
    motion: {
      red: { origin: [253, 1024], keys: [k(0), k(0.15, { x: 6, r: 0.6 }, OUT), k(0.5, { x: 6, r: 0.6 }), k(0.7, {}, IN), k(1)] },
      yellow: { origin: [790, 1024], keys: [k(0), k(0.15, { x: -6, r: -0.6 }, OUT), k(0.5, { x: -6, r: -0.6 }), k(0.7, {}, IN), k(1)] },
      lightning: { origin: [514, 273], keys: [k(0, { o: 0.25 }), k(0.12, { o: 0.25 }), k(0.16, { o: 1, s: 1.15 }), k(0.2, { o: 0.3 }), k(0.24, { o: 1, s: 1.1 }), k(0.3, { o: 0.4, s: 1 }), k(0.36, { o: 1 }), k(0.5, { o: 0.25 }), k(1, { o: 0.25 })] },
      "yellow-smirk": follow("yellow", shown(0.3, 0.8, 0.06)),
    },
  },

  /* I didn't go out. Instead, I read a book.
     За окном мигают огни вечеринки, а он листает книгу — страница переворачивается. */
  instead: {
    src: src(4),
    dur: 3600,
    motion: {
      lights: wave({ o: 0.45 }, { n: 3 }),
      page: { origin: [556, 640], keys: [k(0), k(0.3), k(0.45, { sx: 0.25, r: -6, y: -8 }, "ease-in"), k(0.6, { sx: 0.05, o: 0, r: -8 }), k(0.75, { o: 0 }), k(0.85), k(1)] },
      reader: wave({ y: -3 }, { origin: [439, 1024] }),
    },
  },

  /* The game was a grueling humiliation for the home team.
     Лампочки соперника на табло всё загораются, а наши на скамейке тяжело вздыхают и опускают плечи. */
  "grueling-humiliation": {
    src: src(4),
    dur: 4000,
    focus: 0.45,
    motion: {
      "opponent-lights": wave({ o: 0.5, s: 0.03 }, { n: 3, origin: [602, 250] }),
      red: { origin: [530, 1000], keys: [k(0), k(0.35, { y: -6, sy: 1.01 }), k(0.6, { y: 8, sy: 0.98 }, "ease-in"), k(1)] },
      teammate: { origin: [180, 1000], keys: [k(0, { y: 4 }), k(0.45, { y: -5 }), k(0.75, { y: 8 }), k(1, { y: 4 })] },
    },
  },

  /* The score stood at 2–2 after the first period.
     На табло мигают по очереди две красные и две жёлтые лампы — поровну. */
  "the-score-stood-at": {
    src: src(4),
    dur: 3200,
    focus: 0.45,
    motion: {
      "red-lamps": { origin: [285, 222], keys: [k(0), k(0.08, { s: 1.12 }), k(0.18), k(0.5), k(0.58, { s: 1.12 }), k(0.68), k(1)] },
      "yellow-lamps": { origin: [738, 222], keys: [k(0), k(0.25), k(0.33, { s: 1.12 }), k(0.43), k(0.75), k(0.83, { s: 1.12 }), k(0.93), k(1)] },
    },
  },

  /* ── пачка 5 ── */

  /* They live in a century-old house.
     Из трубы старого дома вьётся дымок, плющ шевелится на ветру, старики стоят в обнимку. */
  "century-old": {
    src: src(5),
    dur: 4000,
    motion: {
      smoke: { origin: [252, 167], keys: [k(0, { o: 0.5, y: 10, s: 0.92 }), k(0.5, { o: 1, y: -6, x: 6, s: 1.04 }), k(1, { o: 0.5, y: 10, s: 0.92 })] },
      ivy: wave({ r: 0.5 }, { origin: [303, 262] }),
      couple: wave({ r: 0.6 }, { phase: 0.3, origin: [634, 1013] }),
    },
  },


  /* The last minutes of the game were intense.
     Полоса времени на табло тает; шайба летит, вратарь выбрасывает ловушку. */
  intense: {
    src: src(5),
    dur: 3200,
    motion: {
      "time-bar": { origin: [540, 225], keys: [k(0, {}, "linear"), k(0.86, { sx: 0.2 }), k(0.9, { sx: 0.2, o: 0 }), k(0.96, { o: 0 }), k(1)] },
      puck: { keys: [k(0, { o: 0, x: 150, y: 40 }), k(0.1, { o: 0, x: 150, y: 40 }, "linear"), k(0.13, { o: 1, x: 120, y: 32 }, "ease-out"), k(0.3, { x: 0, y: 0 }), k(0.34, { x: -4 }), k(0.38), k(0.8), k(0.86, { o: 0 }), k(1, { o: 0, x: 150, y: 40 })] },
      goalie: { origin: [510, 910], keys: [k(0), k(0.2), k(0.3, { r: -1.5, x: 6 }, "ease-out"), k(0.5, { r: -1, x: 4 }), k(0.7), k(1)] },
    },
  },

  /* There is no animosity between us.
     Молния между ними гаснет, вспыхивает дружеская звёздочка — и оба чуть подаются друг к другу.
     Рукопожатие (handshake) снято: у фигур свои руки опущены, с ним выходило по четыре руки. */
  animosity: {
    src: src(5),
    dur: 3600,
    drop: ["handshake"],
    motion: {
      red: { origin: [226, 1024], keys: [k(0), k(0.38), k(0.5, { r: 1.5 }, "ease-out"), k(0.86, { r: 1.5 }), k(0.98), k(1)] },
      yellow: { origin: [773, 1024], keys: [k(0), k(0.4), k(0.52, { r: -1.5 }, "ease-out"), k(0.86, { r: -1.5 }), k(0.98), k(1)] },
      // художник поставил их над рукопожатием, правее середины — сдвинуты в просвет между игроками (x ≈ 480) и чуть меньше
      lightning: { origin: [540, 435], keys: [k(0, { o: 0, x: -60, s: 0.8 }), k(0.02, { o: 0, x: -60, s: 0.8 }), k(0.06, { o: 1, x: -60, s: 0.9 }), k(0.12, { o: 0.4, x: -60, s: 0.8 }), k(0.16, { o: 1, x: -60, s: 0.8 }), k(0.26, { o: 1, x: -60, s: 0.8 }), k(0.34, { o: 0, x: -60, s: 0.5 }), k(1, { o: 0, x: -60, s: 0.8 })] },
      friendship: { origin: [540, 435], keys: [k(0, { o: 0, x: -60, s: 0.3 }), k(0.32, { o: 0, x: -60, s: 0.3 }, "ease-out"), k(0.42, { o: 1, x: -60, s: 0.95, r: 20 }), k(0.5, { o: 1, x: -60, s: 0.8, r: 0 }), k(0.88, { o: 1, x: -60, s: 0.8 }), k(0.96, { o: 0, x: -60, s: 0.5 }), k(1, { o: 0, x: -60, s: 0.3 })] },
    },
  },

  /* We sat in the farthest row.
     С самого верхнего ряда, приложив ладонь ко лбу, высматривают крошечных игроков — они носятся по льду.
     Бинокль (binoculars) снят — висел в воздухе. */
  "the-farthest": {
    src: src(5),
    dur: 3600,
    drop: ["binoculars"],
    motion: {
      players: wave({ x: 14 }, { n: 1 }),
      spectators: wave({ r: 0.5, y: -2 }, { n: 2, origin: [369, 1024] }),
    },
  },

  /* This is the cheapest ticket.
     На самом дешёвом билете — одна монетка; она подпрыгивает, рука забирает билет. */
  "the-cheapest": {
    src: src(5),
    dur: 3200,
    focus: 0.6,
    motion: {
      hand: { origin: [251, 780], keys: [k(0), k(0.4), k(0.6, { x: -16, y: 6 }), k(0.8, { x: -16, y: 6 }), k(1)] },
      ticket: follow("hand", { keys: [k(0), k(1)] }),
      coin: follow("hand", { origin: [353, 791], keys: [k(0), k(0.08, { y: -18, r: -20 }, "ease-out"), k(0.16, { r: 0 }, "ease-in"), k(0.22, { y: -8 }, "ease-out"), k(0.28, {}, "ease-in"), k(1)] }),
    },
  },

  /* He won the face-off.
     Вбрасывание: шайба падает из руки судьи на точку, Красный первым рывком подтягивает её к себе, Жёлтый тянется
     следом и опаздывает. Перерисовано (layers-redo2): все трое в полный рост. */
  "face-off": {
    src: REDO2,
    dur: 3000,
    focus: 0.5,
    motion: {
      puck: { keys: [k(0, { y: -160, o: 0 }), k(0.04, { y: -160, o: 0 }), k(0.07, { y: -160, o: 1 }, "ease-in"), k(0.2, {}, "ease-out"), k(0.23, { y: -5 }, "ease-in"), k(0.26), k(0.34, {}, "ease-out"), k(0.48, { x: -110, y: 6 }), k(0.84, { x: -110, y: 6 }), k(0.92, { x: -110, y: 6, o: 0 }), k(1, { y: -160, o: 0 })] },
      red: { origin: [240, 748], keys: [k(0), k(0.32, {}, "ease-out"), k(0.42, { x: -18, r: -1.5 }), k(0.8, { x: -18, r: -1.5 }, "ease-in-out"), k(0.95), k(1)] },
      yellow: { origin: [800, 748], keys: [k(0), k(0.4, {}, "ease-out"), k(0.52, { x: -14, r: -1.5 }), k(0.62, { x: -10, r: -1 }), k(0.8, { x: -10, r: -1 }, "ease-in-out"), k(0.95), k(1)] },
    },
  },

  /* ── пачка 6 ── */

  /* The referee dropped the puck.
     Судья разжимает руку — шайба падает на лёд, подпрыгивает и замирает. */
  puck: {
    src: src(6),
    dur: 2800,
    focus: 0.55,
    motion: {
      puck: { keys: [k(0, { y: -150, o: 0 }), k(0.06, { y: -150, o: 0 }, "linear"), k(0.08, { y: -145, o: 1 }, "ease-in"), k(0.3, { y: 0 }, "ease-out"), k(0.36, { y: -14 }, "ease-in"), k(0.42), k(0.82), k(0.9, { o: 0 }), k(1, { y: -150, o: 0 })] },
      "referee-arm": { origin: [420, 310], keys: [k(0, { r: -2 }), k(0.08, { r: -2 }), k(0.14, { r: 1, y: -4 }, "ease-out"), k(0.4), k(1, { r: -2 })] },
    },
  },

  /* She cheerfully said hello to everyone.
     Она весело пружинит на ходу, смеётся, вокруг вспыхивают искорки.
     Машущую руку (wave-arm) художник добавил третьей: обе свои руки у неё уже есть (одна опущена, другая у лямки) — снята. */
  cheerfully: {
    src: src(6),
    dur: 2800,
    drop: ["wave-arm"],
    motion: {
      woman: wave({ y: -4, r: 0.6 }, { n: 2, origin: [485, 980] }),
      sparks: wave({ o: 0.6, s: 0.06 }, { n: 2, phase: 0.25, origin: [525, 376] }),
    },
  },

  /* Her eyes sparkled with joy.
     В глазах вспыхивают звёздочки, она смеётся, чуть запрокинув голову. */
  sparkle: {
    src: src(6),
    dur: 2800,
    focus: 0.5,
    motion: {
      woman: wave({ r: -1, y: -3 }, { origin: [499, 1010] }),
      "eye-sparks": follow("woman", { origin: [588, 453], keys: [k(0), k(0.1, { s: 1.35, r: 15 }, "ease-out"), k(0.2, { s: 0.9 }), k(0.3, { s: 1.15, r: -8 }), k(0.4), k(0.6), k(0.7, { s: 1.25, r: 10 }, "ease-out"), k(0.8), k(1)] }),
    },
  },

  /* The dog growled at the stranger.
     Пёс напрягается и рычит — от пасти расходятся дуги звука, прохожий отшатывается. */
  growl: {
    src: src(6),
    dur: 2800,
    focus: 0.6,
    motion: {
      dog: { origin: [238, 894], keys: [k(0), k(0.15, { x: 8, r: 0.8 }, "ease-out"), k(0.2, { x: 6 }), k(0.24, { x: 9 }), k(0.28, { x: 6 }), k(0.32, { x: 9 }), k(0.36, { x: 7 }), k(0.6), k(1)] },
      snarl: follow("dog", { keys: [k(0), k(1)] }),
      "sound-waves": { origin: [484, 610], keys: [k(0, { o: 0, sx: 0.6 }), k(0.15, { o: 0, sx: 0.6 }, "ease-out"), k(0.22, { o: 1, sx: 1 }), k(0.3, { o: 0.6, sx: 1.15 }), k(0.38, { o: 1, sx: 1 }), k(0.5, { o: 0, sx: 1.2 }), k(1, { o: 0, sx: 0.6 })] },
      stranger: { origin: [734, 949], keys: [k(0), k(0.2), k(0.3, { x: 10, r: 1.5 }, "ease-out"), k(0.6, { x: 8, r: 1 }), k(0.85), k(1)] },
    },
  },

  /* There is still time to win.
     На табло мигает последнее деление — ещё есть время; Красный делает рывок к воротам. */
  still: {
    src: src(6),
    dur: 2400,
    motion: {
      "last-light": { origin: [871, 237], keys: [k(0), k(0.12, { o: 0.25 }), k(0.25), k(0.37, { o: 0.25 }), k(0.5), k(0.62, { o: 0.25 }), k(0.75), k(0.87, { o: 0.25 }), k(1)] },
      red: { origin: [440, 857], keys: [k(0), k(0.3, { x: 16, y: -3, r: 1 }, "ease-out"), k(0.55, { x: 10 }), k(1)] },
    },
  },

  /* "Maybe we should go home," she mused.
     Она задумчиво смотрит вверх — облачко с домом покачивается, падают осенние листья. */
  muse: {
    src: src(6),
    dur: 4000,
    motion: {
      "thought-house": wave({ y: -8, r: 1.5 }, { origin: [700, 530] }),
      leaves: { keys: [k(0, { y: -12, x: 8, r: -2, o: 0.6 }), k(0.5, { y: 10, x: -6, r: 2 }), k(1, { y: -12, x: 8, r: -2, o: 0.6 })] },
      woman: wave({ r: 0.6 }, { phase: 0.25, origin: [310, 1024] }),
    },
  },

  /* I could barely hear him.
     Он кричит сквозь шум трибун — дуги звука тают по дороге; Красный приставил ладонь к уху и подался ближе. */
  barely: {
    src: src(6),
    dur: 3200,
    motion: {
      sound: { origin: [610, 540], keys: [k(0, { o: 0, sx: 0.7 }), k(0.1, { o: 1, sx: 0.85 }, "ease-out"), k(0.45, { o: 0.15, sx: 1.15 }), k(0.55, { o: 0, sx: 0.7 }), k(0.6, { o: 1, sx: 0.85 }), k(0.95, { o: 0.15, sx: 1.15 }), k(1, { o: 0, sx: 0.7 })] },
      speaker: wave({ y: -4, r: -0.6 }, { n: 3, origin: [760, 1020] }),
      listener: wave({ r: 1.5, x: 4 }, { origin: [255, 1000] }),
    },
  },

  /* His notes are barely comprehensible.
     Каракули на планшете тренера пляшут, Красный недоумённо склоняет голову. */
  comprehensible: {
    src: src(6),
    dur: 3200,
    focus: 0.55,
    motion: {
      scribbles: wave({ r: 1.5, x: 2 }, { n: 6, origin: [638, 725] }),
      player: { origin: [231, 1024], keys: [k(0), k(0.25, { r: -2.2 }), k(0.6, { r: -2.2 }), k(0.8), k(1)] },
      coach: wave({ y: -3 }, { n: 2, origin: [678, 959] }),
    },
  },

  /* ── пачка 7 ── */

  /* Always wear a mouth guard in hockey.
     Красный подносит капу ко рту и надевает: в руке капа пропадает и появляется во рту. */
  "mouth-guard": {
    src: src(7),
    dur: 3200,
    focus: 0.55,
    motion: {
      "arm-guard": { keys: [k(0, { y: 160, o: 0 }), k(0.06, { y: 150, o: 0 }, "ease-out"), k(0.14, { y: 110, o: 1 }), k(0.36, { y: 0 }), k(0.4, { y: -4 }), k(0.44, { y: -4, o: 0 }), k(1, { y: 160, o: 0 })] },
      "guard-in-mouth": { keys: [k(0, { o: 0 }), k(0.41, { o: 0 }), k(0.45, { o: 1 }), k(0.88, { o: 1 }), k(0.94, { o: 0 }), k(1, { o: 0 })] },
      red: { origin: [382, 1010], keys: [k(0), k(0.4), k(0.46, { y: -4, r: -0.6 }), k(0.56), k(1)] },
    },
  },

  /* He gritted his teeth and kept playing.
     Вспыхивает звёздочка боли, он стискивает зубы — и рвётся дальше. */
  "grit-one-s-teeth": {
    src: src(7),
    dur: 2800,
    motion: {
      "pain-star": { origin: [807, 448], keys: [k(0, { o: 0, s: 0.4 }), k(0.08, { o: 1, s: 1.3, r: 20 }, "ease-out"), k(0.16, { o: 1, s: 0.95, r: 0 }), k(0.24, { o: 1, s: 1.15 }), k(0.34, { o: 0, s: 0.7 }), k(1, { o: 0, s: 0.4 })] },
      red: { origin: [476, 888], keys: [k(0), k(0.1, { x: -3 }), k(0.4, { x: 14, y: -3, r: 1 }, "ease-out"), k(0.7, { x: 8 }), k(1)] },
      "teeth-clenched": follow("red", { keys: [k(0), k(1)] }),
    },
  },

  /* His jokes really get under my skin.
     Жёлтый шепчет шуточку и хохочет — по Красному бегут колючие искорки, его передёргивает. */
  "get-under-someone-s-skin": {
    src: src(7),
    dur: 3200,
    motion: {
      yellow: wave({ y: -4, r: -0.8 }, { n: 2, origin: [270, 1000] }),
      red: shake(0.2, 0.5, { r: 0.9, x: 3 }, 7, [740, 1000]),
      prickles: follow("red", { origin: [731, 685], keys: [k(0, { o: 0.3, s: 0.9 }), k(0.18, { o: 0.3, s: 0.9 }, "ease-out"), k(0.25, { o: 1, s: 1.1 }), k(0.33, { o: 0.6, s: 1 }), k(0.41, { o: 1, s: 1.1 }), k(0.55, { o: 0.3, s: 0.9 }), k(1, { o: 0.3, s: 0.9 })] }),
    },
  },

  /* When the referee said no, he almost lost it.
     Судья показывает «нет» — Жёлтый трясётся от злости, из ушей валит пар, партнёр едва сдерживает. */
  "lose-it": {
    src: src(7),
    dur: 2800,
    motion: {
      yellow: shake(0.05, 0.95, { r: 0.8, x: 2 }, 16, [530, 1000]),
      steam: { origin: [515, 490], keys: [k(0, { o: 0.4, s: 0.8 }), k(0.2, { o: 1, s: 1.1 }, "ease-out"), k(0.45, { o: 0.5, s: 0.92 }), k(0.7, { o: 1, s: 1.12 }, "ease-out"), k(1, { o: 0.4, s: 0.8 })] },
      teammate: wave({ r: 1, x: 4 }, { n: 2, origin: [190, 980] }),
    },
  },

  /* Boston capitalized on our mistakes.
     Наш защитник растянулся на льду, а Жёлтый подхватывает шайбу и рвётся к воротам. */
  "capitalize-on": {
    src: src(7),
    dur: 2800,
    focus: 0.55,
    motion: {
      attacker: { origin: [625, 900], keys: [k(0), k(0.35, { x: 18, y: -4, r: 1 }, "ease-out"), k(0.6, { x: 12 }), k(1)] },
      puck: follow("attacker", { keys: [k(0), k(0.2, { x: -6 }), k(0.4, { x: 6 }), k(0.6, { x: -4 }), k(1)] }),
      defender: wave({ x: -6, r: -1.5 }, { origin: [190, 780] }),
    },
  },

  /* He loves to talk shit on the ice.
     Жёлтый что-то язвит — облачко с молниями вспыхивает и дёргается, соперник закатывает глаза. */
  "talk-shit": {
    src: src(7),
    dur: 3200,
    // у облачка полупрозрачная прямоугольная подложка (бледный прямоугольник поверх трибуны) — срезаем
    alphaFloor: { speech: 60 },
    motion: {
      speech: { origin: [580, 390], keys: [k(0, { o: 0.6, s: 0.9 }), k(0.1, { o: 1, s: 1.12, r: -4 }, "ease-out"), k(0.18, { s: 1, r: 3 }), k(0.26, { s: 1.08, r: -2 }), k(0.34, { s: 1, r: 0 }), k(0.6), k(0.75, { o: 0.6, s: 0.9 }), k(1, { o: 0.6, s: 0.9 })] },
      yellow: wave({ y: -4, r: 0.8 }, { n: 2, origin: [290, 1024] }),
      rival: { origin: [780, 1020], keys: [k(0), k(0.3), k(0.42, { r: -2.2, y: -3 }), k(0.75, { r: -2.2, y: -3 }), k(0.88), k(1)] },
    },
  },

  /* The team prepared to leave the hotel.
     Дверь отеля распахивается — у входа ждёт автобус; одна поднимает сумку, другой застёгивает свою. */
  "prepare-to": {
    src: src(7),
    dur: 3600,
    focus: 0.55,
    motion: {
      door: { origin: [664, 364], keys: [k(0), k(0.2), k(0.45, { sx: 0.82 }), k(0.75, { sx: 0.82 }), k(0.95), k(1)] },
      player2: wave({ y: -8 }, { origin: [225, 850] }),
      player1: wave({ x: 5, y: -2 }, { n: 3, origin: [500, 880] }),
    },
  },

  /* She speaks English with a thick Russian accent.
     Облачко её речи — жирные волны — пульсирует; собеседник задумчиво склоняет голову, вслушиваясь. */
  "thick-accent": {
    src: src(7),
    dur: 3200,
    motion: {
      speech: wave({ sx: 0.04, sy: 0.08, r: 1 }, { n: 2, origin: [560, 450] }),
      woman: wave({ r: 0.8, y: -2 }, { n: 2, phase: 0.2, origin: [290, 1024] }),
      listener: wave({ r: -1.5 }, { origin: [825, 1024] }),
    },
  },

  /* ── переделка (layers-redo1): сцены, отклонённые в пачках 1–7, нарисованы заново ── */

  /* The team is a mix of young and old players.
     Новичок и седой ветеран подаются друг к другу и стукаются кулаками — вспышка, новичок расплывается в улыбке.
     В неподвижном кадре кулаки уже сомкнуты, поэтому в цикле оба сначала чуть отходят. */
  mix: {
    src: REDO,
    dur: 3200,
    focus: 0.5,
    motion: {
      rookie: { origin: [260, 979], keys: [k(0, { x: -14 }), k(0.12, { x: -14 }, "ease-in"), k(0.3), k(0.33, { x: -3 }, "ease-out"), k(0.37), k(0.72), k(0.92, { x: -14 }), k(1, { x: -14 })] },
      veteran: { origin: [755, 979], keys: [k(0, { x: 14 }), k(0.12, { x: 14 }, "ease-in"), k(0.3), k(0.33, { x: 3 }, "ease-out"), k(0.37), k(0.72), k(0.92, { x: 14 }), k(1, { x: 14 })] },
      bump: shown(0.3, 0.42, 0.03, [490, 385], 0.4),
      "rookie-grin": follow("rookie", shown(0.36, 0.86, 0.05)),
    },
  },

  /* That was a helluva game!
     Парень в центре прыгает, растянув шарф над головой; болельщица кричит, руки вверх; старик хлопает; сыплется конфетти. */
  helluva: {
    src: REDO,
    dur: 2800,
    focus: 0.48,
    motion: {
      jumper: { origin: [510, 788], keys: [k(0), k(0.08, { y: 6, sy: 0.97 }, "ease-out"), k(0.28, { y: -34 }, "ease-in"), k(0.48), k(0.56, { y: 6, sy: 0.97 }, "ease-out"), k(0.76, { y: -34 }, "ease-in"), k(0.96), k(1)] },
      "fan-left": wave({ r: 2, y: -4 }, { n: 2, phase: 0.25, origin: [205, 889] }),
      "fan-right": wave({ y: -4, r: -0.8 }, { n: 4, origin: [830, 888] }),
      confetti: { keys: [k(0, { y: -70, o: 0 }), k(0.1, { y: -58, o: 1, r: 0 }), k(0.5, { y: -20, r: 1.5 }), k(0.84, { y: 8, o: 1, r: 0 }), k(0.94, { y: 14, o: 0 }), k(1, { y: -70, o: 0 })] },
    },
  },

  /* The fans love their team.
     Болельщики у бортика приподнимают плакат-сердце — сердце светится; игроки на льду машут им клюшками. */
  their: {
    src: REDO,
    dur: 3200,
    focus: 0.55,
    motion: {
      fans: { origin: [240, 952], keys: [k(0), k(0.18, { y: -12 }, OUT), k(0.34, {}, IN), k(0.5), k(0.68, { y: -12 }, OUT), k(0.84, {}, IN), k(1)] },
      "sign-glow": follow("fans", { origin: [235, 597], keys: [k(0, { o: 0 }), k(0.18, { o: 1, s: 1.06 }), k(0.4, { o: 0.15, s: 1 }), k(0.68, { o: 1, s: 1.06 }), k(0.9, { o: 0, s: 1 }), k(1, { o: 0 })] }),
      team: wave({ r: 1.6, x: 3 }, { n: 2, phase: 0.1, origin: [770, 954] }),
    },
  },

  /* For the fans, the rivalry became personified by two players.
     Две половины трибуны по очереди вскидывают шарфы, и баннер их игрока вспыхивает ярче вслед за своей половиной. */
  "become-personified": {
    src: REDO,
    dur: 3600,
    motion: {
      "red-fans": wave({ y: -8 }, { origin: [240, 875] }),
      "yellow-fans": wave({ y: -8 }, { phase: 0.5, origin: [770, 875] }),
      "red-banner": wave({ o: 0.25, s: -0.015 }, { phase: 0.5, origin: [265, 185] }),
      "yellow-banner": wave({ o: 0.25, s: -0.015 }, { origin: [758, 185] }),
    },
  },

  /* He bent down to tie his skates.
     Жёлтый на скамейке наклоняется к коньку и дважды рывком затягивает шнурки, потом выпрямляется.
     Корпус качается вокруг таза едва-едва: кисти на шнурках едут вместе с ним и не должны уйти с конька. */
  "bend-bent": {
    src: REDO,
    dur: 3200,
    focus: 0.55,
    motion: {
      "yellow-torso": { origin: [270, 560], keys: [k(0), k(0.18, { r: 1.2, y: 3 }, OUT), k(0.78, { r: 1.2, y: 3 }), k(0.95, {}, IN), k(1)] },
      laces: follow("yellow-torso", { keys: [k(0), k(0.28), k(0.33, { y: -7 }, "ease-out"), k(0.4), k(0.5), k(0.55, { y: -7 }, "ease-out"), k(0.62), k(1)] }),
    },
  },
};

/** У всех сцен этапа 5 кадр — по содержимому: художник рисовал под 4:3 и местами залил края ровным цветом. */
export const STAGE_05: Record<string, ArtSceneSpec> = Object.fromEntries(Object.entries(SCENES_05).map(([id, s]) => [id, { frame: "content", ...s }]));
