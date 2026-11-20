/**
 * Рейтинг системных голосов для speechSynthesis.
 * Имена голосов на macOS/iOS локализуются («Daniel» → «Дэниэл»), поэтому сравниваем по обоим вариантам.
 */

export interface VoiceLike {
  name: string;
  lang: string;
}

/** Нейросетевые и улучшенные голоса: Safari (Premium/Enhanced), Edge (Natural/Online), Chrome (Google). */
const HIGH = /premium|enhanced|natural|neural|online|высок\w* качеств|улучш/i;
const GOOD = /\b(Daniel|Serena|Kate|Oliver|Arthur|Martha|Stephanie|Jamie|Libby|Sonia|Ryan)\b|Дэниэл|Серена|Кейт|Оливер|Артур|Марта/i;
const OK = /\b(Samantha|Karen|Moira|Tessa|Ava|Allison|Susan|Tom|Evan|Zoe|Nathan)\b|Саманта|Карен|Мойра|Тесса|Ава|Эллисон|Сьюзан|Том|Зои/i;
const GOOGLE = /^Google/i;
/** Шуточные и «характерные» голоса macOS — никогда не выбираем автоматически. */
const NOVELTY =
  /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Fred|Good News|Jester|Junior|Organ|Superstar|Ralph|Trinoids|Whisper|Zarvox|Grandma|Grandpa|Rocko)\b|Альберт|Плохие новости|Бах|Колокольчик|Прыг-скок|Пузырьки|Виолончель|Воббл|Фред|Хорошие новости|Шутник|Джуниор|Орган|Суперзвезда|Ральф|Триноид|Шепот|Зарвокс/i;

export const isEnglish = (v: VoiceLike) => /^en/i.test(v.lang);
export const isNovelty = (v: VoiceLike) => NOVELTY.test(v.name);

export const voiceScore = (v: VoiceLike): number => {
  if (!isEnglish(v)) return -Infinity;
  if (isNovelty(v)) return -1000;
  let s = 0;
  if (HIGH.test(v.name)) s += 100;
  if (GOOGLE.test(v.name)) s += 40;
  if (GOOD.test(v.name)) s += 30;
  else if (OK.test(v.name)) s += 15;
  if (/en[-_]GB/i.test(v.lang)) s += 10;
  else if (/en[-_](US|IE|AU)/i.test(v.lang)) s += 5;
  return s;
};

/** Английские голоса без шуточных, лучшие первыми. */
export const rankVoices = <V extends VoiceLike>(voices: readonly V[]): V[] =>
  voices
    .filter((v) => isEnglish(v) && !isNovelty(v))
    .map((v, i) => ({ v, i, s: voiceScore(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v);
