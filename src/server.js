// ─────────────────────────────────────────────────────────────
//  server.js — Jalankan: npm start
//
//  REST API untuk RAG semantic search
//
//  Endpoints:
//  POST /training          Upload & index dokumen (PDF/TXT)
//  GET  /get-list          Lihat semua dokumen yang sudah di-training
//  POST /search            Cari chunk paling relevan (output JSON)
// ─────────────────────────────────────────────────────────────

import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import swaggerUi from "swagger-ui-express";
import yaml from "yamljs";
import { createServer } from "net";
import fetch from "node-fetch";
import { CONFIG } from "./config.js";
import { loadAndChunkAll, chunkText } from "./loader.js";
import { embedText, initEmbedder } from "./embedder.js";
import { upsertChunk, searchSimilar, getStats, getIndex, clearIndex } from "./vectorStore.js";
import pdfParse from "pdf-parse";

const app = express();
app.use(express.json());

// ─────────────────────────────────────────
//  Static Files — UI
// ─────────────────────────────────────────
const publicPath = path.join(process.cwd(), "public");
app.use(express.static(publicPath));

// Root route - serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ─────────────────────────────────────────
//  Swagger UI
// ─────────────────────────────────────────
const swaggerDocument = yaml.load(path.join(process.cwd(), "swagger.yaml"));

// Auto-detect server URL from request
app.use("/api-docs", swaggerUi.serve, (req, res, next) => {
  // Set dynamic server URL based on request host
  const protocol = req.protocol;
  const host = req.get('host');
  swaggerDocument.servers = [
    {
      url: `${protocol}://${host}`,
      description: "Current server"
    }
  ];
  swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }'
  })(req, res, next);
});

// ─────────────────────────────────────────
//  Multer — simpan upload ke documents/
// ─────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(CONFIG.DOCUMENTS_DIR, { recursive: true });
    cb(null, CONFIG.DOCUMENTS_DIR);
  },
  filename: (req, file, cb) => {
    // Hindari overwrite — tambah timestamp kalau nama sama
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
  const allowed = [".pdf", ".txt", ".md"];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Format tidak didukung: ${ext}. Gunakan PDF, TXT, atau MD.`));
  }
};

const upload = multer({ storage, fileFilter });

// ─────────────────────────────────────────
//  State — track proses training yang sedang berjalan
// ─────────────────────────────────────────
let trainingStatus = {
  isRunning: false,
  lastRun: null,
  lastResult: null,
};

// ─────────────────────────────────────────
//  Helper — fetch konten dari URL
// ─────────────────────────────────────────
async function fetchUrlContent(url) {
  console.log(`🌐 Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  
  // Simple HTML to text conversion (remove tags)
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return text;
}

// ─────────────────────────────────────────
//  Helper — proses 1 file jadi chunks + embed + simpan
// ─────────────────────────────────────────
async function processFile(filePath, fileName, customName = null, sourceUrl = null) {
  console.log("DEBUG processFile:", { fileName, customName, sourceUrl });
  const ext = path.extname(fileName).toLowerCase();
  let text = "";
  const displayName = customName || fileName;
  console.log("DEBUG displayName:", displayName);

  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    text = parsed.text;
  } else {
    text = fs.readFileSync(filePath, "utf-8");
  }

  const chunks = chunkText(text, displayName, { auto: true });

  let success = 0;
  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);
    await upsertChunk(chunk, vector, sourceUrl);
    success++;
  }

  return { fileName: displayName, chunks: success, sourceUrl };
}

// ─────────────────────────────────────────
//  Helper — proses URL jadi chunks + embed + simpan
// ─────────────────────────────────────────
async function processUrl(url, customName = null) {
  const text = await fetchUrlContent(url);
  const displayName = customName || new URL(url).hostname;
  
  const chunks = chunkText(text, displayName, { auto: true });
  
  let success = 0;
  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);
    await upsertChunk(chunk, vector, url);
    success++;
  }
  
  return { fileName: displayName, chunks: success, sourceUrl: url };
}

// ═══════════════════════════════════════════════════════════
//  POST /training
//  Upload file atau URL → otomatis di-index
//
//  Body  : multipart/form-data atau JSON
//  Field : files (optional) - file PDF/TXT/MD
//  Field : urls (optional) - JSON array URL untuk di-fetch
//  Field : customNames (optional) - JSON array nama display
//  Field : sourceUrls (optional) - JSON array URL sumber (untuk files)
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
app.post("/training", upload.array("files"), async (req, res) => {
  // Support both JSON body and form-data
  const body = { ...req.body, ...req.query };
  
  if (!req.files || req.files.length === 0) {
    // Check if URLs are provided instead
    if (!body.urls && !body.url) {
      return res.status(400).json({
        success: false,
        error: "Tidak ada file atau URL yang diupload. Gunakan field 'files' atau 'urls'.",
      });
    }
  }

  if (trainingStatus.isRunning) {
    return res.status(409).json({
      success: false,
      error: "Training sedang berjalan, tunggu sampai selesai.",
    });
  }

  // Parse customNames
  let customNames = [];
  const customNamesSource = body.customNames;
  if (customNamesSource) {
    try {
      const parsed = JSON.parse(customNamesSource);
      customNames = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      customNames = customNamesSource.split(',').map(s => s.trim()).filter(s => s);
    }
  }
  console.log("DEBUG customNames:", customNames);

  // Parse sourceUrls (for files)
  let sourceUrls = [];
  const sourceUrlsSource = body.sourceUrls;
  if (sourceUrlsSource) {
    try {
      const parsed = JSON.parse(sourceUrlsSource);
      sourceUrls = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      sourceUrls = sourceUrlsSource.split(',').map(s => s.trim()).filter(s => s);
    }
  }
  console.log("DEBUG sourceUrls:", sourceUrls);

  // Parse urls (for URL fetching)
  let urls = [];
  const urlsSource = body.urls || body.url;
  if (urlsSource) {
    try {
      const parsed = JSON.parse(urlsSource);
      urls = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      urls = urlsSource.split(',').map(s => s.trim()).filter(s => s);
    }
  }
  console.log("DEBUG urls:", urls);

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
//        "filePath": "./documents/doc.pdf"
//      }
//    ],
//    "lastTraining": "2024-01-01T00:00:00.000Z"
//  }
// ═══════════════════════════════════════════════════════════
app.get("/get-list", async (req, res) => {
  try {
    const index = await getIndex();
    const allItems = await index.listItems();

    // Group by fileName
    const docMap = {};
    for (const item of allItems) {
      const name = item.metadata?.fileName || "unknown";
      if (!docMap[name]) {
        docMap[name] = { fileName: name, chunks: 0 };

        // Cek apakah file masih ada di disk
        const filePath = path.join(CONFIG.DOCUMENTS_DIR, name);
        docMap[name].fileExists = fs.existsSync(filePath);
        docMap[name].filePath = filePath;
      }
      docMap[name].chunks++;
    }

    res.json({
      totalChunks: allItems.length,
      totalDocuments: Object.keys(docMap).length,
      documents: Object.values(docMap),
      lastTraining: trainingStatus.lastRun,
      isTrainingRunning: trainingStatus.isRunning,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  POST /search
//  Cari chunk paling mirip dengan query
//
//  Body:
//  {
//    "query": "apa itu machine learning?",
//    "topK": 3           ← opsional, default dari config
//  }
//
//  Response:
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
//      }
//    ]
//  }
// ═══════════════════════════════════════════════════════════
app.post("/search", async (req, res) => {
  const { query, topK } = req.body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({
      success: false,
      error: "Field 'query' wajib diisi dan harus berupa string.",
    });
  }

  try {
    const k = parseInt(topK) || CONFIG.TOP_K;
    const queryVector = await embedText(query.trim());
    const rawResults = await searchSimilar(queryVector, k);

    res.json({
      query: query.trim(),
      topK: k,
      results: rawResults.map((r, i) => ({
        rank: i + 1,
        score: parseFloat(r.score.toFixed(4)),
        fileName: r.fileName,
        sourceUrl: r.sourceUrl || null,
        chunkIndex: r.chunkIndex,
        text: r.text,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────
app.get("/health", async (req, res) => {
  const stats = await getStats();
  res.json({
    status: "ok",
    totalChunks: stats.totalChunks,
    isTrainingRunning: trainingStatus.isRunning,
    embeddingModel: CONFIG.EMBEDDING_MODEL_PATH,
  });
});

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
app.delete("/reset", async (req, res) => {
  const { filesOnly, fileName } = req.query;

  try {
    const index = await getIndex();
    const allItems = await index.listItems();
    let deletedCount = 0;

    if (filesOnly === "true" && fileName) {
      // Hapus hanya dari file tertentu
      for (const item of allItems) {
        if (item.metadata?.fileName === fileName) {
          await index.deleteItem(item.id);
          deletedCount++;
        }
      }
      
      // Kalau tidak ada yang dihapus, berikan info nama file yang tersedia
      if (deletedCount === 0) {
        const availableFiles = [...new Set(allItems.map(item => item.metadata?.fileName).filter(Boolean))];
        return res.status(404).json({
          success: false,
          message: `File "${fileName}" tidak ditemukan`,
          availableFiles,
          hint: "Gunakan GET /get-list untuk melihat daftar file yang tersedia",
        });
      }
      
      res.json({
        success: true,
        message: `Data dari file "${fileName}" dihapus`,
        deletedChunks: deletedCount,
        remainingChunks: allItems.length - deletedCount,
      });
    } else {
      // Reset total
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

// ─────────────────────────────────────────
//  404 handler
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint tidak ditemukan",
    availableEndpoints: [
      "POST /training  — upload & index dokumen",
      "GET  /get-list  — lihat dokumen yang sudah di-training",
      "POST /search    — cari chunk paling relevan",
      "GET  /health    — status server",
      "DELETE /reset   — hapus semua data / data file tertentu",
    ],
  });
});

// ─────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────
//  Find available port
// ─────────────────────────────────────────
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port sudah digunakan, coba port berikutnya
        server.close();
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.on('listening', () => {
      server.close(() => resolve(startPort));
    });
    server.listen(startPort);
  });
}

const DEFAULT_PORT = process.env.PORT || 3000;

async function start() {
  // Warm up embedding model sebelum server ready
  console.log("🔧 Inisialisasi embedding model...");
  await initEmbedder();

  // Cari port yang tersedia
  const PORT = await findAvailablePort(DEFAULT_PORT);

  app.listen(PORT, () => {
    console.log("\n═══════════════════════════════════════");
    console.log("       RAG API Server — Running!        ");
    console.log("═══════════════════════════════════════");
    console.log(`  🚀 URL        : http://localhost:${PORT}`);
    console.log(`  🎨 Web UI     : http://localhost:${PORT}`);
    console.log(`  📖 Swagger UI : http://localhost:${PORT}/api-docs`);
    console.log(`  📮 Endpoints:`);
    console.log(`     POST   http://localhost:${PORT}/training`);
    console.log(`     GET    http://localhost:${PORT}/get-list`);
    console.log(`     POST   http://localhost:${PORT}/search`);
    console.log(`     GET    http://localhost:${PORT}/health`);
    console.log(`     DELETE http://localhost:${PORT}/reset`);
    console.log("═══════════════════════════════════════\n");
  });
}

start().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
