/** Подделка процесса оценки для server/pron-process.test.ts: сразу «готова», на hear отвечает своим pid. */
const send = (m: unknown) => process.send!(m);
send({ ready: true });
process.on("message", (m: { id: number; kind: string; pcm?: Float32Array }) => {
  if (m.kind === "die") process.exit(3);
  send({ id: m.id, units: [{ u: String(process.pid) }], ipa: ["aɪ"] });
});
