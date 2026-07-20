# Functional Requirements Document (FRD) — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Daftar Requirements

### FR-001: Semantic Search dengan Vector Embedding

Deskripsi: Sistem mampu mengubah query teks menjadi vector embedding dan mencari chunk paling mirip secara semantik.

Acceptance Criteria:
- Input query teks menghasilkan vector embedding via model GGUF.
- Cosine similarity dihitung antara query vector dan seluruh chunk vectors.
- Hasil diurutkan berdasarkan similarity score (descending).
- Hasil dengan score di bawah threshold (SEARCH_MIN_SCORE) difilter.
- Response JSON berisi rank, score, fileName, chunkIndex, text.

### FR-002: Upload & Indexing Dokumen PDF

Deskripsi: Sistem dapat menerima upload file PDF, mengekstrak teks, memecah menjadi chunks, dan menyimpannya ke vector store.

Acceptance Criteria:
- File PDF diupload via multipart/form-data.
- Teks diekstrak per halaman menggunakan pdf-parse.
- Teks dipecah menjadi chunks menggunakan chunking algorithm.
- Setiap chunk di-embed dan disimpan ke Vectra.
- Response mengembalikan jumlah chunks yang berhasil diproses.

### FR-003: REST API Server

Deskripsi: Sistem menyediakan REST API berbasis Express untuk training, search, dan manajemen dokumen.

Acceptance Criteria:
- Server berjalan di port yang dikonfigurasi (default 3000, auto-find fallback).
- Endpoint: POST /api/training, GET /api/get-list, POST /api/search, GET /api/health, DELETE /api/reset, POST /api/retrain, POST /api/retrain-all, GET /api/file/:fileName, GET /api/text/:fileName.
- Error handling dengan response JSON konsisten.
- 404 handler untuk endpoint tidak dikenal.

### FR-004: Web UI

Deskripsi: Antarmuka web untuk training, daftar dokumen, dan search.

Acceptance Criteria:
- SPA dengan 3 tab: Training, List, Search.
- Training tab: text input, file upload, URL fetch.
- List tab: daftar dokumen dengan metadata, tombol retrain/delete/view.
- Search tab: input query, tampilkan hasil dengan score dan source URLs.
- Responsif dan berjalan di browser modern.

### FR-005: CLI Tools

Deskripsi: CLI scripts untuk ingest (batch indexing) dan search (semantic search).

Acceptance Criteria:
- `npm run ingest` — baca semua file di documents/, chunk, embed, simpan.
- `npm run ingest:reset` — hapus index dulu baru ingest.
- `npm run search` — interactive CLI search dengan JSON output.
- Pipe mode: `echo "query" | node src/search.js`.
- Output JSON siap di-pipe ke aplikasi lain.

### FR-006: Konfigurasi via Environment Variables

Deskripsi: Semua konfigurasi dapat diatur melalui file .env.

Acceptance Criteria:
- EMBEDDING_MODEL_PATH, EMBEDDING_CONTEXT_SIZE, CHUNK_SIZE, CHUNK_OVERLAP, TOP_K, SEARCH_MIN_SCORE, DOCUMENTS_DIR, DB_PATH.
- Default values jika env var tidak diset.

### FR-007: Dukungan Format TXT dan MD

Deskripsi: Sistem dapat membaca dan meng-index file .txt dan .md.

Acceptance Criteria:
- File .txt dibaca sebagai UTF-8 text.
- File .md dibaca sebagai UTF-8 text.
- Diproses dengan smart chunking yang sama.

### FR-008: Dukungan Format DOCX

Deskripsi: Sistem dapat mengekstrak teks dari file Word (.docx).

Acceptance Criteria:
- File .docx diproses menggunakan mammoth.
- Teks diekstrak dari paragraf.

### FR-009: Dukungan Format XLSX/XLS

Deskripsi: Sistem dapat mengekstrak teks dari file Excel (.xlsx/.xls).

Acceptance Criteria:
- File .xlsx/.xls diproses menggunakan xlsx (SheetJS).
- Semua sheet dibaca.
- Tiap baris dikonversi menjadi teks pipe-separated.
- Header kolom disertakan.

### FR-010: Dukungan Format CSV

Deskripsi: Sistem dapat mengekstrak teks dari file CSV.

Acceptance Criteria:
- File .csv diproses menggunakan xlsx.
- Sama seperti parsing Excel.
- Q&A CSV dengan kolom "question" dan "answer" mendapatkan special chunking.

### FR-011: Dukungan Format PPTX

Deskripsi: Sistem dapat mengekstrak teks dari file PowerPoint (.pptx).

Acceptance Criteria:
- File .pptx diproses menggunakan jszip.
- Teks diekstrak dari XML tiap slide.
- Label [Slide N] disertakan per slide.

### FR-012: Keyword Search (BM25)

Deskripsi: Sistem menyediakan pencarian berbasis keyword menggunakan algoritma BM25.

Acceptance Criteria:
- Tokenization dengan case folding dan NFKD normalization.
- BM25 scoring dengan parameter k1 (1.2) dan b (0.75).
- Query token diekstrak, IDF dihitung dari seluruh dokumen.
- Hasil diurutkan berdasarkan BM25 score (descending).

### FR-013: Hybrid Search

Deskripsi: Sistem menggabungkan vector search dan keyword search dengan bobot alpha.

Acceptance Criteria:
- Vector dan keyword results di-min-max normalize.
- Fusion score: alpha * norm(vectorScore) + (1-alpha) * norm(keywordScore).
- Default alpha = 0.7.
- Candidate pool = max(k * 3, k) untuk hybrid.
- Hasil difilter berdasarkan threshold score.

### FR-014: Smart Chunking

Deskripsi: Sistem memiliki dua mode chunking: auto-detect (paragraph-based) dan fixed-size.

Acceptance Criteria:
- Auto mode: split by paragraphs, respect sentence boundaries.
- Fixed mode: split by character count dengan overlap.
- Overlap default 100 karakter.
- Chunk memiliki metadata: fileName, chunkIndex, charStart, charEnd.
- ID format: `{fileName}::chunk_{index}`.

### FR-015: Metadata Tracking

Deskripsi: Sistem menyimpan metadata per dokumen termasuk createdDate, modelName, chunks, lastRetrainedAt, sourceUrl.

Acceptance Criteria:
- Metadata disimpan di documents/.metadata.json.
- Metadata di-load saat server start.
- Metadata di-update setelah training/retrain.
- Metadata tersedia via GET /api/get-list.

### FR-016: URL Fetch & Indexing

Deskripsi: Sistem dapat mengambil konten dari URL, mengkonversi HTML ke text, dan meng-indexnya.

Acceptance Criteria:
- URL di-fetch menggunakan native fetch API.
- HTML dibersihkan dari script/style tags.
- Konten di-chunk dan di-embed seperti file biasa.
- Metadata mencatat sourceUrl.

### FR-017: Retrain Dokumen

Deskripsi: Sistem dapat melakukan ulang proses embedding untuk dokumen tertentu atau semua dokumen.

Acceptance Criteria:
- POST /api/retrain: retrain satu dokumen.
- POST /api/retrain-all: retrain semua dokumen.
- Data lama dihapus dari index.
- File dibaca ulang dari disk / URL di-fetch ulang.
- Metadata lastRetrainedAt dan modelName diupdate.

### FR-018: Swagger/OpenAPI Documentation

Deskripsi: API didokumentasikan dengan OpenAPI 3.0 dan Swagger UI interaktif.

Acceptance Criteria:
- File swagger.yaml berisi spesifikasi OpenAPI 3.0.
- Swagger UI tersedia di /api/api-docs.
- Server URL auto-detect dari request host.
- Custom CSS tanpa topbar.

### FR-019: Auto-Find Available Port

Deskripsi: Server otomatis mencari port yang tersedia jika port default (3000) sudah terpakai.

Acceptance Criteria:
- Jika port 3000 terpakai, coba 3001, 3002, dst.
- Port yang ditemukan ditampilkan di console log.

### FR-020: Text Input Langsung

Deskripsi: Sistem dapat menerima teks langsung (paste) tanpa file.

Acceptance Criteria:
- Field `text` pada POST /api/training.
- Teks disimpan sebagai file .txt di documents/.
- Di-chunk dan di-embed seperti biasa.

### FR-021: Multiple Source URLs

Deskripsi: Dokumen text dapat memiliki multiple source URLs.

Acceptance Criteria:
- sourceUrls bisa berupa array of strings.
- Metadata menyimpan semua source URLs.
- Source URLs ditampilkan di search results.

### FR-022: Custom Display Name

Deskripsi: File/URL dapat diberi nama display yang berbeda dari nama asli.

Acceptance Criteria:
- Field customNames pada POST /api/training.
- Digunakan sebagai identifier di metadata dan search results.
