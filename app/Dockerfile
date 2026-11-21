# syntax=docker/dockerfile:1
# Сборка из корня репозитория: docker build -f app/Dockerfile .
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
# GPU нет: onnxruntime-node не должен качать CUDA-сборку
ENV npm_config_onnxruntime_node_install_cuda=skip
WORKDIR /srv/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY words.json /srv/words.json
COPY app/ ./
RUN npm run build

FROM ${NODE_IMAGE}
# Коммит, из которого собран образ (передаёт deploy/deploy.sh); unknown — собран в обход скрипта
ARG APP_VERSION=unknown
LABEL org.opencontainers.image.revision=$APP_VERSION
ENV NODE_ENV=production PORT=8787 TTS_CACHE_DIR=/data/tts AUTH_DB=/data/auth/auth.db npm_config_onnxruntime_node_install_cuda=skip
WORKDIR /srv/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# Модель Kokoro — в образ: контейнер работает без доступа в интернет и не качает её при каждом запуске
RUN node --input-type=module -e "import { KokoroTTS } from 'kokoro-js'; await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' }); console.log('model ok')"
# Модель оценки произношения (wav2vec2, фонемы espeak, int8 ~320 МБ) — тоже в образ
RUN node --input-type=module -e "import { AutoModelForCTC } from '@huggingface/transformers'; await AutoModelForCTC.from_pretrained('onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX', { dtype: 'q8', device: 'cpu' }); console.log('pron model ok')"
RUN mkdir -p /data/tts /data/auth && chown node:node /data/tts /data/auth
COPY words.json /srv/words.json
COPY --from=build /srv/app/dist ./dist
COPY app/server ./server
COPY app/src/core ./src/core
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
