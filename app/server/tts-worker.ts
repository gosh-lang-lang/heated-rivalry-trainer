/**
 * Поток генерации: Kokoro + кодирование MP3.
 * Вынесено из основного потока, чтобы сервер отдавал готовые файлы, пока идёт генерация.
 */
import { KokoroTTS } from "kokoro-js";
import { parentPort, workerData } from "node:worker_threads";
import { spokenText, TTS_SPEED } from "../src/core/tts.ts";
import { toMp3 } from "./mp3.ts";

interface Req {
  id: number;
  text: string;
  voice: string;
}

const modelP = KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: (workerData as { dtype: "fp32" | "q8" }).dtype,
  device: "cpu",
});
modelP.then(
  () => parentPort!.postMessage({ ready: true }),
  (e: unknown) => parentPort!.postMessage({ ready: false, error: String(e) }),
);

parentPort!.on("message", async ({ id, text, voice }: Req) => {
  try {
    const tts = await modelP;
    // голос задаёт и акцент: a* — американский, b* — британский
    const audio = await tts.generate(spokenText(text), { voice: voice as never, speed: TTS_SPEED });
    const mp3 = toMp3(audio.audio as Float32Array, audio.sampling_rate);
    parentPort!.postMessage({ id, mp3 }, [mp3.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort!.postMessage({ id, error: String(e) });
  }
});
