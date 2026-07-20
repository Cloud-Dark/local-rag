import fs from "fs";
import path from "path";
import multer from "multer";
import { CONFIG } from "../config.js";

export const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".docx", ".xlsx", ".xls", ".pptx", ".csv"];

export const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(CONFIG.DOCUMENTS_DIR, { recursive: true });
    cb(null, CONFIG.DOCUMENTS_DIR);
  },
  filename: (req, file, cb) => {
    const existing = path.join(CONFIG.DOCUMENTS_DIR, file.originalname);
    if (fs.existsSync(existing)) {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      cb(null, `${base}_${Date.now()}${ext}`);
    } else {
      cb(null, file.originalname);
    }
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Format tidak didukung: ${ext}. Gunakan PDF, TXT, MD, DOCX, XLSX, XLS, PPTX, atau CSV.`));
  }
};

export function createMulterUpload() {
  return multer({ storage, fileFilter });
}

export async function resolveFilePath(docName) {
  const filePath = path.join(CONFIG.DOCUMENTS_DIR, docName);
  if (await exists(filePath)) return filePath;
  if (!docName.endsWith('.txt')) {
    const txtPath = path.join(CONFIG.DOCUMENTS_DIR, `${docName}.txt`);
    if (await exists(txtPath)) return txtPath;
  }
  return null;
}

async function exists(p) {
  try { await fs.promises.access(p); return true; }
  catch { return false; }
}

export function parseArrayField(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return value.split(',').map(s => s.trim()).filter(s => s);
  }
}
