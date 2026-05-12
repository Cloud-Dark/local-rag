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
//  Static Files — UI
// ─────────────────────────────────────────
const publicPath = path.join(process.cwd(), "public");
app.use(express.static(publicPath));

// UI Routes
app.get("/ui", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});
app.get("/ui/*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Root redirect to UI
app.get("/", (req, res) => {
  res.redirect("/ui");
});

// ─────────────────────────────────────────
//  API Router — all routes under /api
// ─────────────────────────────────────────
const apiRouter = express.Router();
apiRouter.use(express.json());
app.use("/api", apiRouter);

// ─────────────────────────────────────────
//  Swagger UI
// ─────────────────────────────────────────
const swaggerDocument = yaml.load(path.join(process.cwd(), "swagger.yaml"));

// Auto-detect server URL from request
app.use("/api/api-docs", swaggerUi.serve, (req, res, next) => {
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
//  Document Metadata — track created/retrained info
//  Stored in memory and synced with vector metadata
// ─────────────────────────────────────────
let documentMetadata = {}; // Key: fileName, Value: { createdDate, lastRetrainedAt, modelName, chunks, sourceUrl, isUrl }

// ─────────────────────────────────────────
//  Metadata Persistence — save/load to JSON file
// ─────────────────────────────────────────
const METADATA_FILE = path.join(CONFIG.DOCUMENTS_DIR, '.metadata.json');

function loadMetadata() {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      const data = fs.readFileSync(METADATA_FILE, 'utf-8');
      documentMetadata = JSON.parse(data);
      console.log(`📦 Metadata loaded: ${Object.keys(documentMetadata).length} documents`);
    }
  } catch (err) {
    console.error('⚠️  Failed to load metadata:', err.message);
  }
}

function saveMetadata() {
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(documentMetadata, null, 2), 'utf-8');
    console.log(`💾 Metadata saved: ${Object.keys(documentMetadata).length} documents`);
  } catch (err) {
    console.error('⚠️  Failed to save metadata:', err.message);
  }
}

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
async function processFile(filePath, fileName, customName = null, sourceUrl = null, isRetrain = false) {
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

  // Update metadata
  const now = new Date().toISOString();
  documentMetadata[displayName] = {
    createdDate: isRetrain ? (documentMetadata[displayName]?.createdDate || now) : now,
    lastRetrainedAt: now,
    modelName: CONFIG.EMBEDDING_MODEL_PATH,
    chunks: success,
    sourceUrl: sourceUrl || null,
    isUrl: false,
  };
  saveMetadata();

  return { fileName: displayName, chunks: success, sourceUrl };
}

// ─────────────────────────────────────────
//  Helper — proses URL jadi chunks + embed + simpan
// ─────────────────────────────────────────
async function processUrl(url, customName = null, isRetrain = false) {
  const text = await fetchUrlContent(url);
  const displayName = customName || new URL(url).hostname;

  const chunks = chunkText(text, displayName, { auto: true });

  let success = 0;
  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);
    await upsertChunk(chunk, vector, url);
    success++;
  }

  // Update metadata
  const now = new Date().toISOString();
  documentMetadata[displayName] = {
    createdDate: isRetrain ? (documentMetadata[displayName]?.createdDate || now) : now,
    lastRetrainedAt: now,
    modelName: CONFIG.EMBEDDING_MODEL_PATH,
    chunks: success,
    sourceUrl: url,
    isUrl: true,
  };
  saveMetadata();

  return { fileName: displayName, chunks: success, sourceUrl: url };
}

// ─────────────────────────────────────────
//  Helper — proses direct text jadi chunks + embed + simpan
// ─────────────────────────────────────────
async function processText(text, customName = null, sourceUrl = null, isRetrain = false) {
  const displayName = customName || `Text_${Date.now()}`;
  const fileName = `${displayName}.txt`;
  const filePath = path.join(CONFIG.DOCUMENTS_DIR, fileName);

  // Simpan text sebagai file .txt di folder documents/ agar bisa di-retrain
  fs.mkdirSync(CONFIG.DOCUMENTS_DIR, { recursive: true });
  fs.writeFileSync(filePath, text, 'utf-8');
  console.log(`  💾 Text saved as: ${fileName}`);

  const chunks = chunkText(text, displayName, { auto: true });

  let success = 0;
  // Source URLs hanya untuk metadata, tidak perlu disimpan ke setiap chunk
  const sourceUrls = Array.isArray(sourceUrl) ? sourceUrl : (sourceUrl ? [sourceUrl] : []);
  
  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);
    // Simpan chunk tanpa sourceUrl (sourceUrl hanya di metadata document)
    await upsertChunk(chunk, vector, null);
    success++;
  }

  // Update metadata - simpan semua source URLs sebagai array
  const now = new Date().toISOString();
  documentMetadata[displayName] = {
    createdDate: isRetrain ? (documentMetadata[displayName]?.createdDate || now) : now,
    lastRetrainedAt: now,
    modelName: CONFIG.EMBEDDING_MODEL_PATH,
    chunks: success,
    sourceUrl: sourceUrls.length > 0 ? sourceUrls : null,
    isUrl: false,
    filePath: filePath,
  };
  saveMetadata();

  return { fileName: displayName, chunks: success, sourceUrl: sourceUrls.length > 0 ? sourceUrls : null, filePath };
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
apiRouter.post("/training", upload.array("files"), async (req, res) => {
  // Support both JSON body and form-data
  const body = { ...req.body, ...req.query };

  if (!req.files || req.files.length === 0) {
    // Check if URLs or text are provided instead
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

    // Process direct text
    if (body.text) {
      try {
        const textCustomName = customNames[req.files?.length + urls.length] || null;
        // Ambil semua sourceUrls yang tersisa untuk text input
        const textSourceUrls = sourceUrls.slice(req.files?.length + urls.length) || [];
        const textSourceUrl = textSourceUrls.length > 0 ? textSourceUrls : null;
        const result = await processText(body.text, textCustomName, textSourceUrl);
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
apiRouter.get("/get-list", async (req, res) => {
  try {
    const index = await getIndex();
    const allItems = await index.listItems();

    console.log("DEBUG get-list: allItems =", allItems.map(i => ({
      id: i.id,
      fileName: i.metadata?.fileName,
      sourceUrl: i.metadata?.sourceUrl,
    })));

    // Group by fileName
    const docMap = {};
    for (const item of allItems) {
      const name = item.metadata?.fileName || "unknown";
      const sourceUrlFromChunk = item.metadata?.sourceUrl;

      if (!docMap[name]) {
        // Get metadata from in-memory tracking or use defaults
        const meta = documentMetadata[name] || {};

        // Use sourceUrl from metadata (can be array) or from chunk
        let sourceUrl = meta.sourceUrl || sourceUrlFromChunk;

        docMap[name] = {
          fileName: name,
          chunks: 0,
          sourceUrl: sourceUrl || null,
          createdDate: meta.createdDate || null,
          modelName: meta.modelName || CONFIG.EMBEDDING_MODEL_PATH,
          lastRetrainedAt: meta.lastRetrainedAt || null,
        };

        // Cek apakah file masih ada di disk (hanya untuk file, bukan URL)
        // Check if this is a URL-sourced document (isUrl flag in metadata)
        if (meta.isUrl) {
          // Ini dari URL, tidak ada file fisik
          docMap[name].fileExists = false;
          docMap[name].filePath = null;
          docMap[name].isUrl = true;
        } else {
          // Ini dari file - cek apakah file masih ada di disk
          let filePath = path.join(CONFIG.DOCUMENTS_DIR, name);

          // Kalau file tanpa ekstensi .txt tidak ada, coba dengan ekstensi .txt (untuk text input)
          if (!fs.existsSync(filePath) && !name.endsWith('.txt')) {
            const txtFilePath = path.join(CONFIG.DOCUMENTS_DIR, `${name}.txt`);
            if (fs.existsSync(txtFilePath)) {
              filePath = txtFilePath;
            }
          }

          docMap[name].fileExists = fs.existsSync(filePath);
          docMap[name].filePath = filePath;
          docMap[name].isUrl = false;
        }
      }
      docMap[name].chunks++;
      // Collect all unique sourceUrls from chunks (for backwards compatibility)
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
//        "fileUrl": "/api/file/intro-ml.pdf",
//        "sourceUrl": "https://...",
//        "chunkIndex": 4,
//        "text": "Machine learning adalah..."
//      }
//    ]
//  }
// ═══════════════════════════════════════════════════════════
apiRouter.post("/search", async (req, res) => {
  const { query, topK, minScore } = req.body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({
      success: false,
      error: "Field 'query' wajib diisi dan harus berupa string.",
    });
  }

  try {
    const k = parseInt(topK) || CONFIG.TOP_K;
    const requestedMinScore = Number(minScore);
    const threshold = minScore !== undefined && minScore !== null && Number.isFinite(requestedMinScore)
      ? Math.max(0, Math.min(1, requestedMinScore))
      : CONFIG.SEARCH_MIN_SCORE;
    const queryVector = await embedText(query.trim());
    const rawResults = await searchSimilar(queryVector, k);
    const filteredResults = rawResults.filter((r) => r.score >= threshold);
    const bestScore = rawResults.length > 0 ? rawResults[0].score : null;

    res.json({
      query: query.trim(),
      topK: k,
      minScore: threshold,
      bestScore: bestScore === null ? null : parseFloat(bestScore.toFixed(4)),
      matched: filteredResults.length > 0,
      filteredOut: rawResults.length - filteredResults.length,
      results: filteredResults.map((r, i) => {
        // Get all source URLs from document metadata (not from chunk)
        const docMeta = documentMetadata[r.fileName];
        let allSourceUrls = docMeta?.sourceUrl || r.sourceUrl || null;
        
        // Ensure sourceUrl is always an array for consistency
        if (allSourceUrls && !Array.isArray(allSourceUrls)) {
          allSourceUrls = [allSourceUrls];
        }
        
        // Use first URL for fileUrl (for backwards compatibility)
        const fileUrl = allSourceUrls && allSourceUrls.length > 0
          ? allSourceUrls[0]  // First URL for external documents
          : `/api/file/${encodeURIComponent(r.fileName)}`;  // Local file endpoint

        return {
          rank: i + 1,
          score: parseFloat(r.score.toFixed(4)),
          fileName: r.fileName,
          fileUrl: fileUrl,
          sourceUrl: allSourceUrls || null,  // Return ALL source URLs as array
          chunkIndex: r.chunkIndex,
          text: r.text,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────
//  Health check
// ─────────────────────────────────────────
apiRouter.get("/health", async (req, res) => {
  const stats = await getStats();
  res.json({
    status: "ok",
    totalChunks: stats.totalChunks,
    isTrainingRunning: trainingStatus.isRunning,
    embeddingModel: CONFIG.EMBEDDING_MODEL_PATH,
  });
});

// ═══════════════════════════════════════════════════════════
//  GET /api/file/:fileName
//  Download/akses file dokumen (PDF/TXT/MD)
//
//  Response: File binary atau 404 jika tidak ditemukan
// ═══════════════════════════════════════════════════════════
apiRouter.get("/file/:fileName", async (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);

  try {
    let filePath = path.join(CONFIG.DOCUMENTS_DIR, fileName);

    // Cek apakah file ada
    if (!fs.existsSync(filePath)) {
      // Kalau tidak ada, coba dengan ekstensi .txt (untuk text input)
      if (!fileName.endsWith('.txt')) {
        const txtFilePath = path.join(CONFIG.DOCUMENTS_DIR, `${fileName}.txt`);
        if (fs.existsSync(txtFilePath)) {
          filePath = txtFilePath;
        }
      }
    }
    
    // Kalau masih tidak ada, return 404
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: `File "${fileName}" tidak ditemukan.`,
      });
    }

    // Set content type berdasarkan ekstensi
    const ext = path.extname(fileName).toLowerCase();
    const contentTypes = {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    // Set headers untuk download/inline view
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

    // Stream file
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
//  GET /api/text/:fileName
//  Ambil text content dari database (untuk text input/URL fetch)
//
//  Response:
//  {
//    "fileName": "Text_xxx",
//    "chunks": [...],
//    "fullText": "..."
//  }
// ═══════════════════════════════════════════════════════════
apiRouter.get("/text/:fileName", async (req, res) => {
  const fileName = decodeURIComponent(req.params.fileName);
  
  try {
    const index = await getIndex();
    const allItems = await index.listItems();
    
    // Cari chunks untuk fileName ini
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
    
    // Gabungkan semua chunks
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
apiRouter.delete("/reset", async (req, res) => {
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

      // Hapus file fisik jika ada (untuk text file)
      let filePath = path.join(CONFIG.DOCUMENTS_DIR, fileName);
      if (!fs.existsSync(filePath) && !fileName.endsWith('.txt')) {
        const txtFilePath = path.join(CONFIG.DOCUMENTS_DIR, `${fileName}.txt`);
        if (fs.existsSync(txtFilePath)) {
          fs.unlinkSync(txtFilePath);
          console.log(`  🗑️  File deleted: ${fileName}.txt`);
        }
      } else if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`  🗑️  File deleted: ${fileName}`);
      }

      // Hapus dari metadata
      if (documentMetadata[fileName]) {
        delete documentMetadata[fileName];
        saveMetadata();
        console.log(`  🗑️  Metadata deleted: ${fileName}`);
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
apiRouter.post("/retrain", async (req, res) => {
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

    // Cari dokumen berdasarkan fileName
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

    // Hapus data lama dari index dulu
    for (const item of docItems) {
      await index.deleteItem(item.id);
    }

    let result;

    if (isUrl) {
      // Retrain URL
      result = await processUrl(sourceUrl, fileName, true);
    } else {
      // Retrain file - cek apakah file masih ada
      let filePath = path.join(CONFIG.DOCUMENTS_DIR, fileName);

      // Kalau file tanpa ekstensi .txt tidak ada, coba dengan ekstensi .txt (untuk text input)
      if (!fs.existsSync(filePath) && !fileName.endsWith('.txt')) {
        const txtFilePath = path.join(CONFIG.DOCUMENTS_DIR, `${fileName}.txt`);
        if (fs.existsSync(txtFilePath)) {
          filePath = txtFilePath;
        }
      }

      if (!fs.existsSync(filePath)) {
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
apiRouter.post("/retrain-all", async (req, res) => {
  if (trainingStatus.isRunning) {
    return res.status(409).json({
      success: false,
      error: "Training sedang berjalan, tunggu sampai selesai.",
    });
  }

  trainingStatus.isRunning = true;

  try {
    const index = await getIndex();
    const allItems = await index.listItems();

    // Group items by fileName
    const docMap = {};
    for (const item of allItems) {
      const name = item.metadata?.fileName || "unknown";
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

    // Hapus semua data lama
    await clearIndex();

    // Retrain setiap dokumen
    for (const docName of documents) {
      const doc = docMap[docName];
      try {
        if (doc.isUrl) {
          const result = await processUrl(doc.sourceUrl, docName, true);
          results.push(result);
        } else {
          // Cek apakah ini text file (Text_*.txt) atau file biasa
          let filePath = path.join(CONFIG.DOCUMENTS_DIR, docName);
          
          // Kalau file tanpa ekstensi .txt tidak ada, coba dengan ekstensi .txt
          if (!fs.existsSync(filePath) && !docName.endsWith('.txt')) {
            const txtFilePath = path.join(CONFIG.DOCUMENTS_DIR, `${docName}.txt`);
            if (fs.existsSync(txtFilePath)) {
              filePath = txtFilePath;
            }
          }
          
          if (fs.existsSync(filePath)) {
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

    trainingStatus = {
      isRunning: false,
      lastRun: new Date().toISOString(),
      lastResult: { success: true, results, failed },
    };

    res.json({
      success: true,
      message: "Retrain semua dokumen berhasil",
      totalDocuments: results.length,
      totalChunks: stats.totalChunks,
      failed: failed.length,
      modelName: CONFIG.EMBEDDING_MODEL_PATH,
    });
  } catch (err) {
    trainingStatus.isRunning = false;
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
      "POST /retrain   — retrain dokumen tertentu",
      "POST /retrain-all — retrain semua dokumen",
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
  // Load metadata dari file
  loadMetadata();

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
    console.log(`  🎨 Web UI     : http://localhost:${PORT}/ui`);
    console.log(`  📖 Swagger UI : http://localhost:${PORT}/api/api-docs`);
    console.log(`  📮 API Endpoints:`);
    console.log(`     POST   http://localhost:${PORT}/api/training`);
    console.log(`     GET    http://localhost:${PORT}/api/get-list`);
    console.log(`     POST   http://localhost:${PORT}/api/search`);
    console.log(`     GET    http://localhost:${PORT}/api/health`);
    console.log(`     DELETE http://localhost:${PORT}/api/reset`);
    console.log("═══════════════════════════════════════\n");
  });
}

start().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
