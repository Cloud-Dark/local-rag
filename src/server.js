// ─────────────────────────────────────────────
//  server.js — Entry point
//  REST API untuk RAG semantic search
//
//  Endpoints:
//  POST /api/training     Upload & index dokumen (PDF/TXT)
//  GET  /api/get-list     Lihat semua dokumen yang sudah di-training
//  POST /api/search       Cari chunk paling relevan (output JSON)
// ─────────────────────────────────────────────

import express from "express";
import path from "path";
import fs from "fs";
import swaggerUi from "swagger-ui-express";
import yaml from "yamljs";
import { createServer } from "net";
import { CONFIG } from "./config.js";
import { initEmbedder } from "./embedder.js";
import { loadMetadata } from "./utils/metadataUtils.js";
import { setDocumentMetadata } from "./services/documentService.js";

const app = express();
app.use(express.json());

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

// Serve agent.md for the API docs tab in UI
app.get("/agent.md", (req, res) => {
  const agentMdPath = path.join(process.cwd(), "agent.md");
  if (fs.existsSync(agentMdPath)) {
    res.type("text/markdown").sendFile(agentMdPath);
  } else {
    res.status(404).json({ error: "agent.md not found" });
  }
});

// Root redirect to UI
app.get("/", (req, res) => {
  res.redirect("/ui");
});

// ─────────────────────────────────────────
//  Swagger UI
// ─────────────────────────────────────────
const swaggerDocument = yaml.load(path.join(process.cwd(), "swagger.yaml"));

// Auto-detect server URL from request
app.use("/api/api-docs", swaggerUi.serve, (req, res, next) => {
  const protocol = req.protocol;
  const host = req.get('host');
  swaggerDocument.servers = [
    {
      url: `${protocol}://${host}`,
      description: "Current server",
    },
  ];
  swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
  })(req, res, next);
});

// ─────────────────────────────────────────
//  API Routes
// ─────────────────────────────────────────
import trainingRouter from "./routes/training.js";
import searchRouter from "./routes/search.js";
import documentsRouter from "./routes/documents.js";
import managementRouter from "./routes/management.js";
import healthRouter from "./routes/health.js";

app.use("/api", trainingRouter);
app.use("/api", searchRouter);
app.use("/api", documentsRouter);
app.use("/api", managementRouter);
app.use("/api", healthRouter);

// ─────────────────────────────────────────
//  404 handler
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint tidak ditemukan",
    availableEndpoints: [
      "POST /api/training  — upload & index dokumen",
      "GET  /api/get-list  — lihat dokumen yang sudah di-training",
      "POST /api/search    — cari chunk paling relevan",
      "GET  /api/health    — status server",
      "DELETE /api/reset   — hapus semua data / data file tertentu",
      "POST /api/retrain   — retrain dokumen tertentu",
      "POST /api/retrain-all — retrain semua dokumen",
    ],
  });
});

// ─────────────────────────────────────────
//  Start server
// ─────────────────────────────────────────
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
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

const DEFAULT_PORT = parseInt(process.env.PORT) || 3000;

async function start() {
  // Load metadata dari file, lalu inject ke services
  const metadata = await loadMetadata();
  setDocumentMetadata(metadata);

  // Warm up embedding model sebelum server ready
  console.log("\u{1F527} Inisialisasi embedding model...");
  await initEmbedder();

  // Cari port yang tersedia
  const PORT = await findAvailablePort(DEFAULT_PORT);

  app.listen(PORT, () => {
    console.log("\n\u{2554}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2557}");
    console.log("       RAG API Server — Running!        ");
    console.log("\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}");
    console.log(`  \u{1F680} URL        : http://localhost:${PORT}`);
    console.log(`  \u{1F3A8} Web UI     : http://localhost:${PORT}/ui`);
    console.log(`  \u{1F4D6} Swagger UI : http://localhost:${PORT}/api/api-docs`);
    console.log(`  \u{1F4EE} API Endpoints:`);
    console.log(`     POST   http://localhost:${PORT}/api/training`);
    console.log(`     GET    http://localhost:${PORT}/api/get-list`);
    console.log(`     POST   http://localhost:${PORT}/api/search`);
    console.log(`     GET    http://localhost:${PORT}/api/health`);
    console.log(`     DELETE http://localhost:${PORT}/api/reset`);
    console.log("\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\u{2550}\n");
  });
}

start().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
