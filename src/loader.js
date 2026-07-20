import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import XLSX from "xlsx";
import JSZip from "jszip";
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
      } else if (ext === ".docx") {
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        console.log(`  📋 DOCX loaded: ${file}`);
      } else if (ext === ".xlsx" || ext === ".xls") {
        const workbook = XLSX.readFile(filePath);
        text = parseExcel(workbook);
        console.log(`  📊 Excel loaded: ${file} (${workbook.SheetNames.length} sheets)`);
      } else if (ext === ".pptx") {
        text = await parsePptx(filePath);
        console.log(`  📽️  PPTX loaded: ${file}`);
      } else if (ext === ".csv") {
        const raw = fs.readFileSync(filePath, "utf-8");
        const workbook = XLSX.read(raw, { type: "string" });
        text = parseExcel(workbook);
        console.log(`  📊 CSV loaded: ${file}`);
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

  const qaChunks = chunkQuestionAnswerCsv(clean, fileName);
  if (qaChunks.length > 0) {
    return qaChunks;
  }

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

function chunkQuestionAnswerCsv(text, fileName) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const questionIndex = header.indexOf("question");
  const answerIndex = header.indexOf("answer");
  if (questionIndex < 0 || answerIndex < 0) return [];

  const chunks = [];
  let charStart = 0;

  for (const row of rows.slice(1)) {
    const question = row[questionIndex]?.trim();
    const answer = row[answerIndex]?.trim();
    if (!question || !answer) continue;

    const chunk = `Pertanyaan: ${question}\nJawaban: ${answer}`;
    const index = chunks.length;
    chunks.push({
      id: `${fileName}::chunk_${index}`,
      text: chunk,
      metadata: {
        fileName,
        chunkIndex: index,
        charStart,
        charEnd: charStart + chunk.length,
      },
    });
    charStart += chunk.length + 1;
  }

  return chunks;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);

  return rows;
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

// ─────────────────────────────────────────
//  Helper — parse Excel workbook jadi text
// ─────────────────────────────────────────
function parseExcel(workbook) {
  const parts = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (json.length === 0) continue;

    parts.push(`=== Sheet: ${sheetName} ===`);
    for (const row of json) {
      const cells = row.filter((c) => c !== "").join(" | ");
      if (cells) parts.push(cells);
    }
  }
  return parts.join("\n");
}

// ─────────────────────────────────────────
//  Helper — parse PPTX file jadi text
// ─────────────────────────────────────────
async function parsePptx(filePath) {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const parts = [];

  // PPTX slides are stored as /ppt/slides/slideN.xml
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort();

  for (const slideFile of slideFiles) {
    const content = await zip.files[slideFile].async("string");
    // Extract text from XML (remove tags)
    const text = content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      parts.push(`[Slide ${slideFiles.indexOf(slideFile) + 1}]`);
      parts.push(text);
    }
  }

  return parts.join("\n\n");
}
