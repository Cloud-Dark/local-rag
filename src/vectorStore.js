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
export async function upsertChunk(chunk, vector, sourceUrl = null) {
  const index = await getIndex();

  await index.upsertItem({
    id: chunk.id,
    vector,
    metadata: {
      text: chunk.text,
      ...chunk.metadata,
      sourceUrl, // explicit, wins over anything in chunk.metadata
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
    id: r.item.id,
    text: r.item.metadata.text,
    fileName: r.item.metadata.fileName,
    chunkIndex: r.item.metadata.chunkIndex,
    sourceUrl: r.item.metadata.sourceUrl || null, // URL sumber kalau ada
    score: r.score,
  }));
}

// ─────────────────────────────────────────
//  Statistik index
// ─────────────────────────────────────────
export async function getStats() {
  const index = await getIndex();
  // NOTE: listItems() fetches ALL items just to count — expensive for large DBs
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
  _index = null; // force next getIndex() to create fresh
  console.log("🗑️  Vector index direset.");
}
