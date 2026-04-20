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
//  Smart chunking — auto detect paragraph/section boundaries
//  - Jangan potong di tengah kalimat
//  - Dynamic size berdasarkan struktur teks
//  - Keep context tetap utuh
// ─────────────────────────────────────────
export function chunkText(text, fileName, options = {}) {
  const {
    CHUNK_SIZE = CONFIG.CHUNK_SIZE,
    CHUNK_OVERLAP = CONFIG.CHUNK_OVERLAP,
    auto = true // Auto-detect mode
  } = options;

  const chunks = [];
  
  // Bersihkan whitespace berlebih tapi keep struktur
  const clean = text.trim();

  if (!auto) {
    // Mode lama: fixed size chunking
    return chunkTextFixed(clean, fileName, CHUNK_SIZE, CHUNK_OVERLAP);
  }

  // Auto-detect: split by paragraphs first
  const paragraphs = clean.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  
  let currentChunk = "";
  let charStart = 0;
  let index = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    
    // Kalau paragraph + current chunk masih muat, gabung
    if (currentChunk.length + trimmedPara.length <= CHUNK_SIZE) {
      if (currentChunk) currentChunk += "\n\n";
      currentChunk += trimmedPara;
    } else {
      // Current chunk sudah penuh, simpan dan mulai baru
      if (currentChunk) {
        chunks.push({
          id: `${fileName}::chunk_${index}`,
          text: currentChunk,
          metadata: {
            fileName,
            chunkIndex: index,
            charStart,
            charEnd: charStart + currentChunk.length,
          },
        });
        index++;
        charStart += currentChunk.length;
        
        // Overlap: ambil sebagian dari akhir chunk sebelumnya
        if (CHUNK_OVERLAP > 0 && currentChunk.length > CHUNK_OVERLAP) {
          currentChunk = currentChunk.slice(-CHUNK_OVERLAP) + "\n\n" + trimmedPara;
        } else {
          currentChunk = trimmedPara;
        }
      } else {
        // Paragraph sendiri lebih besar dari CHUNK_SIZE
        // Split by sentence
        const sentences = splitBySentences(trimmedPara);
        
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length <= CHUNK_SIZE) {
            if (currentChunk) currentChunk += " ";
            currentChunk += sentence;
          } else {
            if (currentChunk) {
              chunks.push({
                id: `${fileName}::chunk_${index}`,
                text: currentChunk,
                metadata: {
                  fileName,
                  chunkIndex: index,
                  charStart,
                  charEnd: charStart + currentChunk.length,
                },
              });
              index++;
              charStart += currentChunk.length;
              currentChunk = sentence;
            } else {
              currentChunk = sentence;
            }
          }
        }
      }
    }
  }

  // Simpan chunk terakhir
  if (currentChunk) {
    chunks.push({
      id: `${fileName}::chunk_${index}`,
      text: currentChunk,
      metadata: {
        fileName,
        chunkIndex: index,
        charStart,
        charEnd: charStart + currentChunk.length,
      },
    });
  }

  return chunks;
}

// ─────────────────────────────────────────
//  Split text by sentences (untuk paragraph panjang)
// ─────────────────────────────────────────
function splitBySentences(text) {
  // Split by . ! ? tapi jangan kalau ada angka (dr., mr., etc)
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  return sentences.map(s => s.trim()).filter(s => s.length > 0);
}

// ─────────────────────────────────────────
//  Fixed size chunking (mode lama)
// ─────────────────────────────────────────
function chunkTextFixed(text, fileName, CHUNK_SIZE, CHUNK_OVERLAP) {
  const chunks = [];
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
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}

// ─────────────────────────────────────────
//  Load + chunk semua dokumen sekaligus
// ─────────────────────────────────────────
export async function loadAndChunkAll(dir = CONFIG.DOCUMENTS_DIR, options = {}) {
  const docs = await loadDocuments(dir);
  const allChunks = [];

  for (const doc of docs) {
    const chunks = chunkText(doc.text, doc.fileName, options);
    allChunks.push(...chunks);
    console.log(`  ✂️  ${doc.fileName}: ${chunks.length} chunks`);
  }

  console.log(`\n  📊 Total: ${allChunks.length} chunks`);
  return allChunks;
}
