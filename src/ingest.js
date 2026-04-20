// ─────────────────────────────────────────────────────────────
//  ingest.js — Jalankan: npm run ingest
//
//  Script ini akan:
//  1. Baca semua file PDF & TXT dari folder documents/
//  2. Pecah jadi chunk-chunk kecil
//  3. Embed tiap chunk pakai model GGUF
//  4. Simpan ke Vectra (JSON lokal)
// ─────────────────────────────────────────────────────────────

import { loadAndChunkAll } from "./loader.js";
import { embedText, disposeEmbedder } from "./embedder.js";
import { upsertChunk, getStats, clearIndex } from "./vectorStore.js";

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("       RAG INGEST — Memproses Dokumen  ");
  console.log("═══════════════════════════════════════\n");

  // Tanya apakah mau reset dulu
  const args = process.argv.slice(2);
  const shouldReset = args.includes("--reset");

  if (shouldReset) {
    console.log("🗑️  Mode --reset: menghapus index lama...");
    await clearIndex();
  }

  // 1. Load & chunk semua dokumen
  console.log("📂 Membaca dokumen dari folder documents/...");
  const chunks = await loadAndChunkAll();

  if (chunks.length === 0) {
    console.log("\n⚠️  Tidak ada dokumen ditemukan!");
    console.log("   Taruh file .pdf atau .txt di folder documents/");
    process.exit(0);
  }

  console.log(`\n✂️  Total chunks: ${chunks.length}\n`);

  // 2. Embed & simpan tiap chunk
  console.log("🔢 Mulai embedding...");
  let success = 0;
  let failed = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const progress = `[${i + 1}/${chunks.length}]`;

    try {
      process.stdout.write(`  ${progress} Embedding: ${chunk.id}...`);

      const vector = await embedText(chunk.text);
      await upsertChunk(chunk, vector);

      process.stdout.write(" ✅\n");
      success++;
    } catch (err) {
      process.stdout.write(` ❌ ${err.message}\n`);
      failed++;
    }
  }

  // 3. Tampilkan statistik
  const stats = await getStats();
  console.log("\n═══════════════════════════════════════");
  console.log("              SELESAI!");
  console.log("═══════════════════════════════════════");
  console.log(`  ✅ Berhasil  : ${success} chunks`);
  console.log(`  ❌ Gagal     : ${failed} chunks`);
  console.log(`  📦 Total DB  : ${stats.totalChunks} chunks`);
  console.log(`  📁 Lokasi DB : ${stats.dbPath}`);
  console.log("═══════════════════════════════════════\n");

  await disposeEmbedder();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
