// ─────────────────────────────────────────────────────────────
//  search.js — Jalankan: npm run search
//
//  Pure semantic search — tanpa LLM.
//  Input  : pertanyaan / query teks
//  Output : JSON berisi chunk-chunk paling relevan
//
//  Contoh output:
//  {
//    "query": "apa itu machine learning?",
//    "topK": 3,
//    "results": [
//      {
//        "rank": 1,
//        "score": 0.921,
//        "fileName": "intro-ml.pdf",
//        "chunkIndex": 4,
//        "text": "Machine learning adalah..."
//      },
//      ...
//    ]
//  }
// ─────────────────────────────────────────────────────────────

import readline from "readline";
import { embedText, disposeEmbedder } from "./embedder.js";
import { searchSimilar, getStats } from "./vectorStore.js";
import { CONFIG } from "./config.js";

// ─────────────────────────────────────────
//  Core search function — bisa di-import
//  dari file lain juga
// ─────────────────────────────────────────
export async function semanticSearch(query, topK = CONFIG.TOP_K) {
  const queryVector = await embedText(query);
  const rawResults = await searchSimilar(queryVector, topK);

  return {
    query,
    topK,
    results: rawResults.map((r, i) => ({
      rank: i + 1,
      score: parseFloat(r.score.toFixed(4)),
      fileName: r.fileName,
      chunkIndex: r.chunkIndex,
      text: r.text,
    })),
  };
}

// ─────────────────────────────────────────
//  CLI interactive mode
// ─────────────────────────────────────────
async function main() {
  console.error("═══════════════════════════════════════");
  console.error("     RAG SEARCH — Semantic Search      ");
  console.error("═══════════════════════════════════════\n");

  // Cek DB
  const stats = await getStats();
  if (stats.totalChunks === 0) {
    console.error("⚠️  Database kosong! Jalankan dulu: npm run ingest");
    process.exit(1);
  }

  console.error(`📦 Knowledge base: ${stats.totalChunks} chunks\n`);

  // Mode: pipe (non-interactive) — cocok untuk integrasi
  // Contoh: echo "apa itu RAG?" | node src/search.js
  if (!process.stdin.isTTY) {
    const input = await readStdin();
    const query = input.trim();
    if (!query) process.exit(0);

    const result = await semanticSearch(query);
    console.log(JSON.stringify(result, null, 2));
    await disposeEmbedder();
    return;
  }

  // Mode: interactive
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // output prompt ke stderr, biar JSON ke stdout bersih
  });

  const ask = (prompt) =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.error('Ketik query, atau "exit" untuk keluar.');
  console.error("Output JSON akan muncul di stdout.\n");

  while (true) {
    const query = (await ask("🔍 Query: ")).trim();

    if (!query) continue;
    if (query.toLowerCase() === "exit") {
      console.error("\n👋 Sampai jumpa!");
      break;
    }

    try {
      console.error(`\n⏳ Mencari...`);
      const result = await semanticSearch(query);

      // JSON ke stdout (bersih, siap di-pipe ke LLM lain)
      console.log(JSON.stringify(result, null, 2));

      // Ringkasan ke stderr (buat info user)
      console.error(`\n✅ Ditemukan ${result.results.length} chunk relevan:`);
      result.results.forEach((r) => {
        console.error(
          `   [${r.rank}] score: ${r.score} | ${r.fileName} | chunk #${r.chunkIndex}`
        );
      });
      console.error("");
    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  }

  rl.close();
  await disposeEmbedder();
}

// ─────────────────────────────────────────
//  Helper: baca stdin sampai EOF
// ─────────────────────────────────────────
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
