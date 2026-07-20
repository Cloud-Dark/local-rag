# Master Checklist — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Fase 1: Foundation

- [x] Project scaffolding dengan Express
- [x] Konfigurasi via environment variables (dotenv)
- [x] Embedding model integration (node-llama-cpp)
- [x] Vector store dengan Vectra
- [x] Document loader untuk PDF
- [x] CLI ingest script
- [x] CLI search script
- [x] REST API server
- [x] Swagger/OpenAPI documentation
- [x] Auto-find available port
- [x] Swagger UI dynamic server URL

## Fase 2: Format Dokumen

- [x] PDF parsing (pdf-parse)
- [x] TXT/MD parsing (built-in)
- [x] DOCX parsing (mammoth)
- [x] XLSX/XLS parsing (xlsx/SheetJS)
- [x] CSV parsing (xlsx)
- [x] PPTX parsing (jszip)

## Fase 3: Chunking & Embedding

- [x] Fixed-size chunking
- [x] Smart auto-detect chunking (paragraph/sentence aware)
- [x] Q&A CSV special chunking
- [x] Batch embedding dengan progress
- [x] Context size configuration

## Fase 4: Search

- [x] Vector (semantic) search
- [x] BM25 keyword search
- [x] Hybrid search (vector + keyword fusion)
- [x] Min-score threshold filtering
- [x] Search type parameter (vector/keyword/hybrid)
- [x] Alpha parameter untuk hybrid weight
- [x] Score normalization (min-max)

## Fase 5: API & Metadata

- [x] POST /api/training (multi-format: files, URL, text)
- [x] GET /api/get-list (dokumen + metadata)
- [x] POST /api/search
- [x] GET /api/health
- [x] DELETE /api/reset (all / specific file)
- [x] POST /api/retrain (single document)
- [x] POST /api/retrain-all (all documents)
- [x] GET /api/file/:fileName (download file)
- [x] GET /api/text/:fileName (text content)
- [x] Metadata persistence (.metadata.json)
- [x] Document metadata (createdDate, modelName, lastRetrainedAt, chunks)

## Fase 6: Web UI

- [x] Training tab (text input, file upload, URL fetch)
- [x] Document list tab (with metadata)
- [x] Search tab (with results display)
- [x] Multiple source URLs support
- [x] Custom display names
- [x] Retrain from UI
- [x] Delete from UI
- [x] View file / text content
- [x] Retrain All button

## Fase 7: URL & Text Input

- [x] URL fetch training
- [x] HTML to text conversion (strip tags)
- [x] Direct text input training
- [x] Multiple source URLs per document
- [x] Text input saved as .txt file

## Fase 8: Dokumentasi

- [x] Project charter (docs/00_PROJECT_CHARTER.md)
- [x] PRD (docs/01_PRD.md)
- [x] FRD (docs/03_FRD.md)
- [x] TRD (docs/04_TRD.md)
- [x] Architecture (docs/05_ARCHITECTURE.md)
- [x] Master checklist (docs/07_MASTER_CHECKLIST.md)
- [x] ADR / Decisions (docs/11_DECISIONS.md)
- [x] Glossary (docs/13_GLOSSARY.md)
- [x] Config reference (docs/16_CONFIG_REFERENCE.md)
- [x] Developer setup (docs/17_DEVELOPER_SETUP.md)
- [x] Database structure (docs/20_DATABASE.md)
- [x] Backend modules (docs/21_BACKEND.md)
- [x] Changelog (docs/31_CHANGELOG.md)
- [x] API endpoints spec (docs/specs/)
- [x] Standards index (docs/standards/)

## Fase 9: Rencana ke Depan

- [ ] OCR untuk gambar/scan (Tesseract.js) — _TBD_
- [ ] Fitur tambahan dari feedback user — _TBD_
