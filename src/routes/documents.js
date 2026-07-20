import { Router } from "express";
import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";
import { getIndex } from "../vectorStore.js";
import { resolveFilePath, CONTENT_TYPES } from "../utils/fileUtils.js";
import { getDocumentMetadata } from "../services/documentService.js";
import { getTrainingStatus } from "./training.js";

const router = Router();

const UNKNOWN_FILE = "unknown";

async function buildDocMap(allItems, documentMetadata) {
  const docMap = {};
  for (const item of allItems) {
    const name = item.metadata?.fileName || UNKNOWN_FILE;
    const sourceUrlFromChunk = item.metadata?.sourceUrl;

    if (!docMap[name]) {
      const meta = documentMetadata[name] || {};
      let sourceUrl = meta.sourceUrl || sourceUrlFromChunk;

      docMap[name] = {
        fileName: name,
        chunks: 0,
        sourceUrl: sourceUrl || null,
        createdDate: meta.createdDate || null,
        modelName: meta.modelName || CONFIG.EMBEDDING_MODEL_PATH,
        lastRetrainedAt: meta.lastRetrainedAt || null,
      };

      if (meta.isUrl) {
        docMap[name].fileExists = false;
        docMap[name].filePath = null;
        docMap[name].isUrl = true;
      } else {
        const filePath = await resolveFilePath(name);
        docMap[name].fileExists = filePath !== null;
        docMap[name].filePath = filePath;
        docMap[name].isUrl = false;
      }
    }
    docMap[name].chunks++;

    if (sourceUrlFromChunk) {
      const existing = docMap[name].sourceUrl || [];
      if (Array.isArray(existing)) {
        if (!existing.includes(sourceUrlFromChunk)) {
          docMap[name].sourceUrl = [...existing, sourceUrlFromChunk];
        }
      } else if (existing !== sourceUrlFromChunk) {
        docMap[name].sourceUrl = [existing, sourceUrlFromChunk];
      }
    }
  }
  return docMap;
}

// ═══════════════════════════════════════════════════════════
//  GET /get-list
//  Lihat semua dokumen yang sudah di-training
//
//  Response:
//  {
//    "totalChunks": 56,
//    "documents": [
//      {
//        "fileName": "doc.pdf",
//        "chunks": 24,
//        "filePath": "./documents/doc.pdf",
//        "createdDate": "2024-01-01T00:00:00.000Z",
//        "modelName": "./models/mxbai-embed-large-v1.Q8_0.gguf",
//        "lastRetrainedAt": "2024-01-02T00:00:00.000Z"
//      }
//    ],
//    "lastTraining": "2024-01-01T00:00:00.000Z"
//  }
// ═══════════════════════════════════════════════════════════
router.get("/get-list", async (req, res) => {
  try {
    const index = await getIndex();
    const allItems = await index.listItems();
    const documentMetadata = getDocumentMetadata();
    const trainingStatus = getTrainingStatus();

    const docMap = await buildDocMap(allItems, documentMetadata);

    res.json({
      totalChunks: allItems.length,
      totalDocuments: Object.keys(docMap).length,
      documents: Object.values(docMap),
      lastTraining: trainingStatus.lastRun,
      isTrainingRunning: trainingStatus.isRunning,
      embeddingModel: CONFIG.EMBEDDING_MODEL_PATH,
    });
  } catch (err) {
    console.error("ERROR get-list:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  GET /file/:fileName
//  Download/akses file dokumen (PDF/TXT/MD)
//
//  Response: File binary atau 404 jika tidak ditemukan
// ═══════════════════════════════════════════════════════════
router.get("/file/:fileName", async (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);

  try {
    const filePath = await resolveFilePath(fileName);

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: `File "${fileName}" tidak ditemukan.`,
      });
    }

    const ext = path.extname(fileName).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (err) => {
      console.error('Error streaming file:', err);
      res.status(500).json({ success: false, error: 'Error reading file' });
    });
  } catch (err) {
    console.error('Error serving file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  GET /text/:fileName
//  Ambil text content dari database (untuk text input/URL fetch)
//
//  Response:
//  {
//    "fileName": "Text_xxx",
//    "chunks": [...],
//    "fullText": "..."
//  }
// ═══════════════════════════════════════════════════════════
router.get("/text/:fileName", async (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);

  try {
    const index = await getIndex();
    const allItems = await index.listItems();

    const chunks = allItems
      .filter(item => item.metadata?.fileName === fileName)
      .sort((a, b) => (a.metadata?.chunkIndex || 0) - (b.metadata?.chunkIndex || 0))
      .map(item => ({
        chunkIndex: item.metadata?.chunkIndex || 0,
        text: item.metadata?.text || '',
      }));

    if (chunks.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Text "${fileName}" tidak ditemukan.`,
      });
    }

    const fullText = chunks.map(c => c.text).join('\n\n');

    res.json({
      success: true,
      fileName,
      chunks,
      fullText,
      totalChunks: chunks.length,
    });
  } catch (err) {
    console.error('Error fetching text:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
