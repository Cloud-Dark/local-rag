import { Router } from "express";
import { processFile, processUrl, processDirectText } from "../services/documentService.js";
import { getStats } from "../vectorStore.js";
import { parseArrayField, createMulterUpload } from "../utils/fileUtils.js";

const router = Router();
const upload = createMulterUpload();

// ─────────────────────────────────────────
//  State — track proses training yang sedang berjalan
// ─────────────────────────────────────────
let trainingStatus = {
  isRunning: false,
  lastRun: null,
  lastResult: null,
};

export function getTrainingStatus() {
  return trainingStatus;
}

export function setTrainingStatus(status) {
  trainingStatus = status;
}

// ═══════════════════════════════════════════════════════════
//  POST /training
//  Upload file atau URL → otomatis di-index
//
//  Body  : multipart/form-data atau JSON
//  Field : files (optional) — file PDF/TXT/MD
//  Field : urls (optional) — JSON array URL untuk di-fetch
//  Field : customNames (optional) — JSON array nama display
//  Field : sourceUrls (optional) — JSON array URL sumber (untuk files)
//
//  Response:
//  {
//    "success": true,
//    "processed": [
//      { "fileName": "KB_Exit_Clearance", "chunks": 24, "sourceUrl": "https://..." }
//    ],
//    "failed": [],
//    "totalChunksInDB": 56
//  }
// ═══════════════════════════════════════════════════════════
router.post("/training", upload.array("files"), async (req, res) => {
  // Support both JSON body and form-data
  const body = { ...req.body, ...req.query };

  if (!req.files || req.files.length === 0) {
    if (!body.urls && !body.url && !body.text) {
      return res.status(400).json({
        success: false,
        error: "Tidak ada file, URL, atau text yang diupload. Gunakan field 'files', 'urls', atau 'text'.",
      });
    }
  }

  if (trainingStatus.isRunning) {
    return res.status(409).json({
      success: false,
      error: "Training sedang berjalan, tunggu sampai selesai.",
    });
  }

  const customNames = parseArrayField(body.customNames);
  const sourceUrls = parseArrayField(body.sourceUrls);
  const urls = parseArrayField(body.urls || body.url);

  trainingStatus.isRunning = true;
  const processed = [];
  const failed = [];

  try {
    // Process files
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        try {
          const customName = customNames[i] || null;
          const sourceUrl = sourceUrls[i] || null;
          const result = await processFile(file.path, file.originalname || file.filename, customName, sourceUrl);
          processed.push(result);
        } catch (err) {
          failed.push({ fileName: file.originalname, error: err.message });
        }
      }
    }

    // Process URLs
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const customName = customNames[req.files?.length + i] || null;
        const result = await processUrl(url, customName);
        processed.push(result);
      } catch (err) {
        failed.push({ url, error: err.message });
      }
    }

    // Process direct text
    if (body.text) {
      try {
        const textCustomName = customNames[req.files?.length + urls.length] || null;
        const textSourceUrls = sourceUrls.slice(req.files?.length + urls.length) || [];
        const textSourceUrl = textSourceUrls.length > 0 ? textSourceUrls : null;
        const result = await processDirectText(body.text, textCustomName, textSourceUrl);
        processed.push(result);
      } catch (err) {
        failed.push({ fileName: "Text input", error: err.message });
      }
    }

    const stats = await getStats();
    const result = {
      success: true,
      processed,
      failed,
      totalChunksInDB: stats.totalChunks,
    };

    trainingStatus = {
      isRunning: false,
      lastRun: new Date().toISOString(),
      lastResult: result,
    };

    res.json(result);
  } catch (err) {
    trainingStatus.isRunning = false;
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
