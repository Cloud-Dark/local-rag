import { LocalIndex } from "vectra";
import path from "path";
import { CONFIG } from "./config.js";

let _index = null;

// ─────────────────────────────────────────
//  Inisialisasi Vectra index
// ─────────────────────────────────────────
export async function getIndex() {
  if (_index) return _index;

  _index = new LocalIndex(path.resolve(CONFIG.DB_PATH));

  // Buat index baru kalau belum ada
  if (!(await _index.isIndexCreated())) {
    await _index.createIndex();
    console.log("📁 Vector index baru dibuat di:", CONFIG.DB_PATH);
  } else {
    console.log("📁 Vector index ditemukan di:", CONFIG.DB_PATH);
  }

  return _index;
}

// ─────────────────────────────────────────
//  Simpan chunk + vector ke Vectra
// ─────────────────────────────────────────
export async function upsertChunk(chunk, vector) {
  const index = await getIndex();

  await index.upsertItem({
    id: chunk.id,
    vector,
    metadata: {
      text: chunk.text,
      ...chunk.metadata,
    },
  });
}

// ─────────────────────────────────────────
//  Cari chunk paling relevan berdasarkan query vector
// ─────────────────────────────────────────
export async function searchSimilar(queryVector, topK = CONFIG.TOP_K) {
  const index = await getIndex();

  const results = await index.queryItems(queryVector, topK);

  return results.map((r) => ({
    text: r.item.metadata.text,
    fileName: r.item.metadata.fileName,
    chunkIndex: r.item.metadata.chunkIndex,
    score: r.score,
  }));
}

// ─────────────────────────────────────────
//  Statistik index
// ─────────────────────────────────────────
export async function getStats() {
  const index = await getIndex();
  const stats = await index.listItems();
  return {
    totalChunks: stats.length,
    dbPath: CONFIG.DB_PATH,
  };
}

// ─────────────────────────────────────────
//  Reset / hapus semua data
// ─────────────────────────────────────────
export async function clearIndex() {
  const index = await getIndex();
  await index.deleteIndex();
  await index.createIndex();
  console.log("🗑️  Vector index direset.");
}
