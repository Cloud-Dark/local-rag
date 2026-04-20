import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import { CONFIG } from "./config.js";

// ─────────────────────────────────────────
//  Load semua dokumen dari folder documents/
// ─────────────────────────────────────────
export async function loadDocuments(dir = CONFIG.DOCUMENTS_DIR) {
  const files = fs.readdirSync(dir);
  const docs = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const ext = path.extname(file).toLowerCase();

    try {
      let text = "";

      if (ext === ".pdf") {
        const buffer = fs.readFileSync(filePath);
        const parsed = await pdfParse(buffer);
        text = parsed.text;
        console.log(`  📄 PDF loaded: ${file} (${parsed.numpages} halaman)`);
      } else if (ext === ".txt" || ext === ".md") {
        text = fs.readFileSync(filePath, "utf-8");
        console.log(`  📝 Text loaded: ${file}`);
      } else {
        console.log(`  ⏭️  Skip: ${file} (format tidak didukung)`);
        continue;
      }

      docs.push({ fileName: file, filePath, text });
    } catch (err) {
      console.error(`  ❌ Gagal load ${file}:`, err.message);
    }
  }

  return docs;
}

// ─────────────────────────────────────────
//  Pecah teks jadi chunk-chunk kecil
// ─────────────────────────────────────────
export function chunkText(text, fileName) {
  const { CHUNK_SIZE, CHUNK_OVERLAP } = CONFIG;
  const chunks = [];

  // Bersihkan whitespace berlebih
  const clean = text.replace(/\s+/g, " ").trim();

  let start = 0;
  let index = 0;

  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    const chunkText = clean.slice(start, end);

    chunks.push({
      id: `${fileName}::chunk_${index}`,
      text: chunkText,
      metadata: {
        fileName,
        chunkIndex: index,
        charStart: start,
        charEnd: end,
      },
    });

    index++;
    // Geser start dengan mempertimbangkan overlap
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

// ─────────────────────────────────────────
//  Load + chunk semua dokumen sekaligus
// ─────────────────────────────────────────
export async function loadAndChunkAll(dir = CONFIG.DOCUMENTS_DIR) {
  const docs = await loadDocuments(dir);
  const allChunks = [];

  for (const doc of docs) {
    const chunks = chunkText(doc.text, doc.fileName);
    allChunks.push(...chunks);
    console.log(`  ✂️  ${doc.fileName}: ${chunks.length} chunks`);
  }

  return allChunks;
}
