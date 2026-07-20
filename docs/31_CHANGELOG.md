# Changelog — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

Semua perubahan signifikan pada project ini dicatat di sini.

Format berdasarkan [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-07-20

### Added

- DOCX, XLSX, CSV, PPTX document parsing — mendukung format Word, Excel, CSV, dan PowerPoint untuk embedding.
- Hybrid keyword-vector search — menggabungkan BM25 keyword search dengan semantic vector search via fusion algorithm.
- Metadata dan retrain APIs — POST /api/retrain, POST /api/retrain-all, metadata tracking per dokumen.
- Web UI redesign — 3 tabs (Training, List, Search), text input, source URLs, retrain/delete/view dari UI.
- Route restructuring — semua API di bawah `/api`, UI di bawah `/ui`.
- Smart auto-detect chunking — paragraph-aware chunking dengan sentence boundary detection.
- URL fetch training — sistem dapat mengambil konten dari URL, convert HTML ke text, dan meng-indexnya.
- Custom display names — file/URL dapat diberi nama display berbeda.
- Auto-find available port — jika port default (3000) terpakai, coba port berikutnya.
- Swagger UI — dokumentasi API interaktif dengan auto-detect server URL.
- Text input langsung — paste teks langsung tanpa file.

### Fixed

- Static file serving untuk Web UI.
- Swagger UI custom styling dan dynamic server URL.
- Replace node-fetch dengan native fetch API.
- Improved customNames dan sourceUrls parsing — support JSON array dan comma-separated string.
- DELETE /api/reset dengan error messages dan available files hint.
- Rename fileUrl ke sourceUrl untuk clarity.
- Use import instead of require untuk net module.

## [0.1.0] — 2024-01-01

### Added

- Initial RAG local setup — project scaffolding dengan Express.
- Swagger docs — OpenAPI 3.0 specification.
- PDF loading — document loader untuk file PDF.
- Chunking (fixed-size) — basic character-based chunking dengan overlap.
- Embedding via node-llama-cpp — GGUF model integration.
- Vectra vector store — JSON-based local vector database.
- CLI ingest — batch indexing script.
- CLI search — interactive semantic search.
- REST API — POST /training, GET /get-list, POST /search, GET /health, DELETE /reset.
- Web UI — basic interface untuk training dan search.
- Environment configuration — dotenv integration.
