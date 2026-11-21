/**
 * Процесс оценки произношения: wav2vec2 (фонемы espeak) распознаёт звуки записи, phonemizer (espeak) даёт
 * ожидаемые звуки текста. Отдельный процесс, а не поток: две модели ONNX в потоках одного процесса роняют Node
 * (onnxruntime-node), а Kokoro уже живёт в потоке сервера. Упал — сервер работает дальше и запускает его заново.
 * Модель: onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX, int8 (~320 МБ), два потока ONNX — быстрее всего
 * на 1,5 ядра контейнера (больше потоков только мешают друг другу).
 */
import { AutoModelForCTC, Tensor } from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "node:fs";
import { phonemize } from "phonemizer";
import { ctcUnits, PRON_MODEL } from "./pron.ts";

const send = (m: unknown) => process.send!(m);

// при нехватке памяти ядро убивает в контейнере первым этот процесс, а не сервер: сайт работает, оценка — «недоступна»
try {
  writeFileSync("/proc/self/oom_score_adj", "1000");
} catch {
  /* не Linux */
}

const vocab = JSON.parse(readFileSync(new URL("./pron-vocab.json", import.meta.url), "utf8")) as Record<string, number>;
const units: string[] = [];
for (const [u, id] of Object.entries(vocab)) units[id] = u;

const modelP = AutoModelForCTC.from_pretrained(PRON_MODEL, {
  dtype: "q8",
  device: "cpu",
  session_options: { intraOpNumThreads: 2, enableCpuMemArena: false },
});
modelP.then(
  () => send({ ready: true }),
  (e: unknown) => send({ ready: false, error: String(e) }),
);

type Req = { id: number; kind: "hear"; pcm: Float32Array } | { id: number; kind: "ipa"; text: string };

process.on("message", async (m: Req) => {
  try {
    if (m.kind === "ipa") return send({ id: m.id, ipa: await phonemize(m.text, "en-us") });
    const model = await modelP;
    // нормализация как в preprocessor_config (do_normalize): нулевое среднее, единичная дисперсия
    const x = m.pcm;
    let mean = 0;
    for (const v of x) mean += v;
    mean /= x.length || 1;
    let vr = 0;
    for (const v of x) vr += (v - mean) ** 2;
    const sd = Math.sqrt(vr / (x.length || 1) + 1e-7);
    const input = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) input[i] = (x[i] - mean) / sd;
    const { logits } = (await model({ input_values: new Tensor("float32", input, [1, input.length]) })) as { logits: Tensor };
    const [, frames, size] = logits.dims as number[];
    send({ id: m.id, units: ctcUnits(logits.data as Float32Array, frames, size, units) });
  } catch (e) {
    send({ id: m.id, error: String(e) });
  }
});
