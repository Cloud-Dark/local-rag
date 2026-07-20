import "dotenv/config";

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const CONFIG = {
  EMBEDDING_MODEL_PATH: process.env.EMBEDDING_MODEL_PATH || "./models/bge-m3-Q8_0.gguf",
  EMBEDDING_CONTEXT_SIZE: numberFromEnv("EMBEDDING_CONTEXT_SIZE", 8192),
  CHUNK_SIZE: numberFromEnv("CHUNK_SIZE", 800),
  CHUNK_OVERLAP: numberFromEnv("CHUNK_OVERLAP", 100),
  TOP_K: numberFromEnv("TOP_K", 5),
  SEARCH_MIN_SCORE: numberFromEnv("SEARCH_MIN_SCORE", 0.7),
  DOCUMENTS_DIR: process.env.DOCUMENTS_DIR || "./documents",
  DB_PATH: process.env.DB_PATH || "./db/vectra",

  // BM25 keyword search defaults
  BM25_K1: numberFromEnv("BM25_K1", 1.5),
  BM25_B: numberFromEnv("BM25_B", 0.75),

  // Server port
  PORT: parseInt(process.env.PORT, 10) || 3000,
};
