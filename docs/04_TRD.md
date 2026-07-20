# Technical Requirements Document (TRD) — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Daftar Requirements

### TR-001: Node.js Runtime

Deskripsi: Sistem berjalan di atas Node.js runtime.

Spesifikasi:
- Node.js v18+ (mendukung native fetch API).
- ECMAScript Modules (`"type": "module"` di package.json).
- Cross-platform: Windows, macOS, Linux.

### TR-002: Embedding Engine (node-llama-cpp)

Deskripsi: Vector embedding dihasilkan menggunakan node-llama-cpp dengan model GGUF lokal.

Spesifikasi:
- Library: `node-llama-cpp` ^3.1.1.
- Model format: GGUF.
- Context size: configurable (default 8192 token).
- Output: array of numbers (floating point vector).
- Model di-load sekali saat server start (singleton).
- Method: `getEmbeddingFor(text)`.

Keterbatasan:
- Bergantung pada CPU/RAM — model besar mungkin lambat di perangkat rendah.
- Hanya embedding, tidak ada LLM generation.

### TR-003: Vector Store (Vectra)

Deskripsi: Vector embedding disimpan dan dicari menggunakan Vectra.

Spesifikasi:
- Library: `vectra` ^0.9.0.
- Storage: JSON lokal (no server required).
- Index path: configurable (default `./db/vectra`).
- Operation: createIndex, upsertItem, queryItems, deleteItem, deleteIndex, listItems.
- Query: cosine similarity search.

Keterbatasan:
- In-memory saat query — semua vector di-load ke RAM.
- Tidak cocok untuk > 100k vectors (performa menurun).
- Single process — tidak concurrent.

### TR-004: REST API Server (Express)

Deskripsi: HTTP server menggunakan Express.js.

Spesifikasi:
- Library: `express` ^4.19.2.
- File upload: `multer` ^1.4.5-lts.1.
- Swagger UI: `swagger-ui-express` ^5.0.1.
- Swagger spec parsing: `yamljs` ^0.3.0.
- Port: configurable (default 3000) dengan auto-find fallback.

### TR-005: Document Parsers

Spesifikasi library parser per format:

| Format | Library | Versi | Method |
|---|---|---|---|
| PDF | `pdf-parse` | ^1.1.1 | `pdfParse(buffer)` |
| DOCX | `mammoth` | ^1.12.0 | `extractRawText({ buffer })` |
| XLSX/XLS/CSV | `xlsx` | ^0.18.5 | `readFile()` / `read()` |
| PPTX | `jszip` | ^3.10.1 | `loadAsync(buffer)` + XML parsing |

### TR-006: Chunking Algorithm

Spesifikasi:
- Default CHUNK_SIZE: 800 karakter.
- Default CHUNK_OVERLAP: 100 karakter.
- Auto mode: paragraph-based split, sentence boundary awareness.
- Fixed mode: character count with sliding window.
- Q&A CSV special mode: per-row chunking untuk format "question"/"answer".
- ID generation: `{fileName}::chunk_{index}`.

### TR-007: BM25 Keyword Search

Spesifikasi:
- Tokenization: case folding, NFKD normalization, regex split by non-letter/non-number, filter tokens length > 1.
- Parameter k1: 1.2 (configurable via options).
- Parameter b: 0.75 (configurable via options).
- IDF formula: `ln(1 + (N - n + 0.5) / (n + 0.5))`.
- Score: sum of IDF * (tf * (k1+1)) / (tf + k1 * (1 - b + b * docLen / avgDocLen)).

### TR-008: Hybrid Search Fusion

Spesifikasi:
- Normalization: min-max scaling per result set.
- Fusion score: `alpha * norm(vectorScore) + (1-alpha) * norm(keywordScore)`.
- Default alpha: 0.7.
- Candidate pool: `max(k * 3, k)` untuk mengurangi overhead.

### TR-009: Web UI

Spesifikasi:
- Stack: Vanilla HTML + CSS + JavaScript (zero framework).
- No build step — file statis.
- API calls via `fetch()` ke `/api/*`.
- 3 tabs: Training, List, Search.

### TR-010: Metadata Persistence

Spesifikasi:
- File: `documents/.metadata.json`.
- Format: JSON object dengan key = display name dokumen.
- Fields per dokumen: createdDate, lastRetrainedAt, modelName, chunks, sourceUrl, isUrl, filePath.
- Load saat server start, save setiap update.

### TR-011: File Upload Validation

Spesifikasi:
- Allowed extensions: .pdf, .txt, .md, .docx, .xlsx, .xls, .pptx, .csv.
- Unique filename: timestamp suffix jika nama sudah ada.
- Error handling: format tidak didukung → 400 response.

### TR-012: Port Auto-Find

Spesifikasi:
- Function `findAvailablePort(startPort)` menggunakan net.createServer.
- Test listen pada port, jika EADDRINUSE → coba port+1.
- Port ditampilkan di console log.

### TR-013: Dependencies

Spesifikasi dari package.json:

Production:
- `dotenv` ^17.4.2 — environment variables.
- `express` ^4.19.2 — web server.
- `jszip` ^3.10.1 — PPTX parsing.
- `mammoth` ^1.12.0 — DOCX parsing.
- `multer` ^1.4.5-lts.1 — file upload.
- `node-llama-cpp` ^3.1.1 — embedding model inference.
- `pdf-parse` ^1.1.1 — PDF parsing.
- `swagger-ui-express` ^5.0.1 — Swagger UI.
- `vectra` ^0.9.0 — vector store.
- `xlsx` ^0.18.5 — Excel/CSV parsing.
- `yamljs` ^0.3.0 — YAML parsing.

Dev:
- `form-data` ^4.0.5 — test utility.
