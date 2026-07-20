import fs from "fs";
import { getLlama } from "node-llama-cpp";
import { CONFIG } from "./config.js";

let _llama = null;
let _embeddingContext = null;

// ─────────────────────────────────────────
//  Inisialisasi embedding model (sekali saja)
// ─────────────────────────────────────────
export async function initEmbedder() {
  if (_embeddingContext) return _embeddingContext;

  if (!await fs.promises.access(CONFIG.EMBEDDING_MODEL_PATH).then(() => true).catch(() => false)) {
    throw new Error(`Embedding model tidak ditemukan: ${CONFIG.EMBEDDING_MODEL_PATH}`);
  }

  console.log(`🔧 Loading embedding model: ${CONFIG.EMBEDDING_MODEL_PATH}`);
  _llama = await getLlama();

  const model = await _llama.loadModel({
    modelPath: CONFIG.EMBEDDING_MODEL_PATH,
  });

  _embeddingContext = await model.createEmbeddingContext({
    contextSize: CONFIG.EMBEDDING_CONTEXT_SIZE,
  });

  console.log("✅ Embedding model siap!");
  return _embeddingContext;
}

// ─────────────────────────────────────────
//  Embed satu teks → array of numbers
// ─────────────────────────────────────────
export async function embedText(text) {
  const ctx = await initEmbedder();
  const result = await ctx.getEmbeddingFor(text);
  return Array.from(result.vector);
}

// ─────────────────────────────────────────
//  Embed banyak teks sekaligus (dengan progress)
// ─────────────────────────────────────────
/*
export async function embedBatch(texts, onProgress) {
  const vectors = [];

  for (let i = 0; i < texts.length; i++) {
    const vec = await embedText(texts[i]);
    vectors.push(vec);

    if (onProgress) onProgress(i + 1, texts.length);
  }

  return vectors;
}
*/

export async function disposeEmbedder() {
  if (_embeddingContext) {
    await _embeddingContext.dispose();
    _embeddingContext = null;
  }
  // Model stored as local variable in initEmbedder — we track it via module scope
  // node-llama-cpp model.dispose() and getLlama() reset handled below:
  _llama = null;
}
