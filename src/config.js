// ============================================================
//  KONFIGURASI — sesuaikan path model GGUF kamu di sini
// ============================================================

export const CONFIG = {
  // --- Embedding Model ---
  // Contoh: nomic-embed-text, all-minilm, mxbai-embed-large
  EMBEDDING_MODEL_PATH: "./models/nomic-embed-text-v1.5.Q4_K_S.gguf",

  // --- Embedding Settings ---
  EMBEDDING_CONTEXT_SIZE: 2048,

  // --- RAG Settings ---
  CHUNK_SIZE: 500,             // Karakter per chunk
  CHUNK_OVERLAP: 50,           // Overlap antar chunk (biar konteks nyambung)
  TOP_K: 3,                    // Ambil N chunk paling relevan

  // --- Paths ---
  DOCUMENTS_DIR: "./documents", // Taruh PDF & TXT kamu di sini
  DB_PATH: "./db/vectra",       // Vector store disimpan di sini
};
