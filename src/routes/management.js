import { Router } from "express";
import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";
import { getIndex, getStats, clearIndex } from "../vectorStore.js";
import { processFile, processUrl, getDocumentMetadata } from "../services/documentService.js";
import { saveMetadata } from "../utils/metadataUtils.js";
import { resolveFilePath } from "../utils/fileUtils.js";
import { getTrainingStatus, setTrainingStatus } from "./training.js";

const router = Router();
const UNKNOWN_FILE = "unknown";

// ═══════════════════════════════════════════════════════════
//  DELETE /reset
//  Hapus semua data dari vector database
//
//  Query params:
//    filesOnly=true  — hapus data dari file tertentu saja
//    fileName=xxx    — nama file yang akan dihapus (sesuai customName atau fileName)
//
//  Response:
//  {
//    "success": true,
//    "message": "Semua data dihapus",
//    "deletedChunks": 56
//  }
// ═══════════════════════════════════════════════════════════
router.delete("/reset", async (req, res) => {
  const { filesOnly, fileName } = req.query;

  try {
    const index = await getIndex();
    const allItems = await index.listItems();
    const documentMetadata = getDocumentMetadata();
    let deletedCount = 0;

    if (filesOnly === "true" && fileName) {
      for (const item of allItems) {
        if (item.metadata?.fileName === fileName) {
          await index.deleteItem(item.id);
          deletedCount++;
        }
      }

      if (deletedCount === 0) {
        const availableFiles = [...new Set(allItems.map(item => item.metadata?.fileName).filter(Boolean))];
        return res.status(404).json({
          success: false,
          message: `File "${fileName}" tidak ditemukan`,
          availableFiles,
          hint: "Gunakan GET /get-list untuk melihat daftar file yang tersedia",
        });
      }

      // Delete physical file if exists
      const filePath = await resolveFilePath(fileName);
      if (filePath) {
        await fs.promises.unlink(filePath);
        console.log(`  🗑️  File deleted: ${path.basename(filePath)}`);
      }

      // Delete from metadata
      if (documentMetadata[fileName]) {
        delete documentMetadata[fileName];
        await saveMetadata(documentMetadata);
        console.log(`  🗑️  Metadata deleted: ${fileName}`);
      }

      res.json({
        success: true,
        message: `Data dari file "${fileName}" dihapus`,
        deletedChunks: deletedCount,
        remainingChunks: allItems.length - deletedCount,
      });
    } else {
      await clearIndex();
      res.json({
        success: true,
        message: "Semua data dihapus",
        deletedChunks: allItems.length,
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  POST /retrain
//  Retrain dokumen tertentu dengan model embedding terbaru
//
//  Body:
//  {
//    "fileName": "doc.pdf"    ← nama file yang ingin di-retrain
//  }
//
//  Response:
//  {
//    "success": true,
//    "message": "Retrain berhasil",
//    "chunks": 24
//  }
// ═══════════════════════════════════════════════════════════
router.post("/retrain", async (req, res) => {
  const { fileName } = req.body;

  if (!fileName) {
    return res.status(400).json({
      success: false,
      error: "Field 'fileName' wajib diisi.",
    });
  }

  try {
    const index = await getIndex();
    const allItems = await index.listItems();
    const documentMetadata = getDocumentMetadata();

    const docItems = allItems.filter(item => item.metadata?.fileName === fileName);

    if (docItems.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Dokumen "${fileName}" tidak ditemukan.`,
      });
    }

    const meta = docItems[0].metadata;
    const sourceUrl = meta?.sourceUrl;
    const isUrl = meta?.isUrl || !!sourceUrl;

    // Delete old data from index
    for (const item of docItems) {
      await index.deleteItem(item.id);
    }

    let result;

    if (isUrl) {
      result = await processUrl(sourceUrl, fileName, true);
    } else {
      const filePath = await resolveFilePath(fileName);

      if (!filePath) {
        return res.status(404).json({
          success: false,
          error: `File "${fileName}" tidak ditemukan di disk.`,
        });
      }
      result = await processFile(filePath, fileName, fileName, null, true);
    }

    res.json({
      success: true,
      message: `Retrain "${fileName}" berhasil`,
      chunks: result.chunks,
      modelName: CONFIG.EMBEDDING_MODEL_PATH,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  POST /retrain-all
//  Retrain semua dokumen dengan model embedding terbaru
//
//  Response:
//  {
//    "success": true,
//    "message": "Retrain semua dokumen berhasil",
//    "totalDocuments": 5,
//    "totalChunks": 120
//  }
// ═══════════════════════════════════════════════════════════
router.post("/retrain-all", async (req, res) => {
  const trainingStatus = getTrainingStatus();

  if (trainingStatus.isRunning) {
    return res.status(409).json({
      success: false,
      error: "Training sedang berjalan, tunggu sampai selesai.",
    });
  }

  setTrainingStatus({ ...getTrainingStatus(), isRunning: true });

  try {
    const index = await getIndex();
    const allItems = await index.listItems();
    const documentMetadata = getDocumentMetadata();

    const docMap = {};
    for (const item of allItems) {
      const name = item.metadata?.fileName || UNKNOWN_FILE;
      if (!docMap[name]) {
        docMap[name] = {
          items: [],
          sourceUrl: item.metadata?.sourceUrl,
          isUrl: !!item.metadata?.sourceUrl,
        };
      }
      docMap[name].items.push(item);
    }

    const documents = Object.keys(docMap);
    const results = [];
    const failed = [];

    await clearIndex();

    for (const docName of documents) {
      const doc = docMap[docName];
      try {
        if (doc.isUrl) {
          const result = await processUrl(doc.sourceUrl, docName, true);
          results.push(result);
        } else {
          const filePath = await resolveFilePath(docName);

          if (filePath) {
            const result = await processFile(filePath, docName, docName, null, true);
            results.push(result);
          } else {
            failed.push({ fileName: docName, error: "File tidak ditemukan di disk" });
          }
        }
      } catch (err) {
        failed.push({ fileName: docName, error: err.message });
      }
    }

    const stats = await getStats();

    setTrainingStatus({
      isRunning: false,
      lastRun: new Date().toISOString(),
      lastResult: { success: true, results, failed },
    });

    res.json({
      success: true,
      message: "Retrain semua dokumen berhasil",
      totalDocuments: results.length,
      totalChunks: stats.totalChunks,
      failed: failed.length,
      modelName: CONFIG.EMBEDDING_MODEL_PATH,
    });
  } catch (err) {
    setTrainingStatus({ ...getTrainingStatus(), isRunning: false });
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
