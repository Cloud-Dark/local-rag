import fs from "fs";
import path from "path";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import XLSX from "xlsx";
import { CONFIG } from "../config.js";
import { chunkText } from "../loader.js";
import { embedText } from "../embedder.js";
import { upsertChunk } from "../vectorStore.js";
import { updateDocumentMetadata } from "../utils/metadataUtils.js";
import { parseExcel, parsePptx } from "../utils/parsers.js";

// In-memory metadata reference for routes that need it
let documentMetadata = {};

export function setDocumentMetadata(meta) {
  documentMetadata = meta;
}

export function getDocumentMetadata() {
  return documentMetadata;
}

const TEXT_PREFIX = "Text_";

// ─────────────────────────────────────────
//  Extract text from file by extension
//  All format parsers: PDF, DOCX, XLSX, XLS, PPTX, CSV, TXT, MD
// ─────────────────────────────────────────
export async function extractText(filePath, ext, fileName) {
  const fsPromises = fs.promises;

  if (ext === ".pdf") {
    const buffer = await fsPromises.readFile(filePath);
    const parsed = await pdfParse(buffer);
    console.log(`  📄 PDF loaded: ${fileName} (${parsed.numpages} halaman)`);
    return parsed.text;
  }

  if (ext === ".txt" || ext === ".md") {
    const text = await fsPromises.readFile(filePath, "utf-8");
    console.log(`  📝 Text loaded: ${fileName}`);
    return text;
  }

  if (ext === ".docx") {
    const buffer = await fsPromises.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    console.log(`  📋 DOCX loaded: ${fileName}`);
    return result.value;
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.readFile(filePath);
    const text = parseExcel(workbook);
    console.log(`  📊 Excel loaded: ${fileName} (${workbook.SheetNames.length} sheets)`);
    return text;
  }

  if (ext === ".pptx") {
    const text = await parsePptx(filePath);
    console.log(`  📽️  PPTX loaded: ${fileName}`);
    return text;
  }

  if (ext === ".csv") {
    const raw = await fsPromises.readFile(filePath, "utf-8");
    const workbook = XLSX.read(raw, { type: "string" });
    const text = parseExcel(workbook);
    console.log(`  📊 CSV loaded: ${fileName}`);
    return text;
  }

  // Unknown extension — try raw read
  return fsPromises.readFile(filePath, "utf-8");
}
// parseExcel and parsePptx are imported from utils/parsers.js

// ─────────────────────────────────────────
//  Fetch URL content
// ─────────────────────────────────────────
export async function fetchUrlContent(url) {
  console.log(`🌐 Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

// ─────────────────────────────────────────
//  Process file: extract -> chunk -> embed -> upsert -> metadata
// ─────────────────────────────────────────
export async function processFile(filePath, fileName, customName = null, sourceUrl = null, isRetrain = false) {
  const ext = path.extname(fileName).toLowerCase();
  const displayName = customName || fileName;
  const text = await extractText(filePath, ext, fileName);
  return processTextContent(text, {
    displayName,
    sourceUrl,
    isRetrain,
    isUrl: false,
    filePath,
    storeSourceInChunks: true,
  });
}

// ─────────────────────────────────────────
//  Process URL: fetch -> chunk -> embed -> upsert -> metadata
// ─────────────────────────────────────────
export async function processUrl(url, customName = null, isRetrain = false) {
  const text = await fetchUrlContent(url);
  const displayName = customName || new URL(url).hostname;
  return processTextContent(text, {
    displayName,
    sourceUrl: url,
    isRetrain,
    isUrl: true,
    storeSourceInChunks: true,
  });
}

// ─────────────────────────────────────────
//  Process direct text: chunk -> embed -> upsert -> metadata
// ─────────────────────────────────────────
export async function processDirectText(text, customName = null, sourceUrl = null, isRetrain = false) {
  const displayName = customName || `${TEXT_PREFIX}${Date.now()}`;
  const fileName = `${displayName}.txt`;
  const filePath = path.join(CONFIG.DOCUMENTS_DIR, fileName);

  // Persist text as .txt file for retrain capability
  await fs.promises.mkdir(CONFIG.DOCUMENTS_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, text, 'utf-8');
  console.log(`  💾 Text saved as: ${fileName}`);

  return processTextContent(text, {
    displayName,
    sourceUrl,
    isRetrain,
    isUrl: false,
    filePath,
    storeSourceInChunks: false,
  });
}

// ─────────────────────────────────────────
//  Core: chunk text -> embed -> upsert -> metadata
// ─────────────────────────────────────────
export async function processTextContent(text, options = {}) {
  const {
    displayName,
    sourceUrl = null,
    isRetrain = false,
    isUrl = false,
    filePath = null,
    storeSourceInChunks = false,
  } = options;
  const chunks = chunkText(text, displayName, { auto: true });

  let success = 0;
  const sourceUrls = Array.isArray(sourceUrl) ? sourceUrl : (sourceUrl ? [sourceUrl] : []);

  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);
    // Original behavior: sourceUrl stored per chunk for files (with sourceUrl) and URLs,
    // but NOT for direct text input (processDirectText always passes null)
    const chunkSourceUrl = storeSourceInChunks
      ? (typeof sourceUrl === 'string' ? sourceUrl : null)
      : null;
    await upsertChunk(chunk, vector, chunkSourceUrl);
    success++;
  }

  const metadataSourceUrl = sourceUrls.length > 0 ? (sourceUrls.length === 1 ? sourceUrls[0] : sourceUrls) : null;

  const data = {
    chunks: success,
    sourceUrl: metadataSourceUrl,
    isUrl,
    ...(filePath ? { filePath } : {}),
  };

  await updateDocumentMetadata(documentMetadata, displayName, data, isRetrain);

  return {
    fileName: displayName,
    chunks: success,
    sourceUrl: metadataSourceUrl,
    ...(filePath ? { filePath } : {}),
  };
}
