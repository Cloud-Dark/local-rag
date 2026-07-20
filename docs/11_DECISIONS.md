# Architecture Decision Records (ADR) — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## ADR-001: node-llama-cpp sebagai Embedding Engine

**Tanggal:** 2024-01-01
**Konteks:** Perlu embedding model untuk mengubah teks menjadi vector. Opsi: API eksternal (OpenAI), library lokal (node-llama-cpp, transformers.js).
**Keputusan:** Pilih node-llama-cpp.
**Alasan:**
- 100% lokal, tanpa API key, tanpa biaya per query.
- Support GGUF format — banyak model embedding tersedia.
- Performa cukup untuk laptop/PC modern.
- Integrasi mudah dengan Node.js.
**Alternatif ditolak:**
- OpenAI Embeddings API — butuh koneksi internet, biaya, privasi terkompromi.
- transformers.js — masih experimental untuk embedding.
**Konsekuensi:**
- Bergantung pada CPU/RAM — model besar mungkin lambat di perangkat rendah.
- Tidak bisa untuk hardware tanpa Node.js.

## ADR-002: Vectra sebagai Vector Store

**Tanggal:** 2024-01-01
**Konteks:** Butuh vector database untuk menyimpan dan mencari embeddings. Opsi: Vectra, ChromaDB, LanceDB, Qdrant, atau database tradisional dengan vector extension.
**Keputusan:** Pilih Vectra.
**Alasan:**
- Zero infrastructure — JSON-based, no server.
- Paling ringan — cocok untuk proyek lokal.
- API sederhana (createIndex, upsertItem, queryItems).
**Alternatif ditolak:**
- ChromaDB/LanceDB/Qdrant — butuh server terpisah, overkill untuk proyek single-user.
- PostgreSQL + pgvector — butuh instalasi database.
**Konsekuensi:**
- Semua vector di-load ke RAM saat query—batas ~100k vectors.
- Tidak concurrent — single process.

## ADR-003: Hybrid Search sebagai Default Search Mode

**Tanggal:** 2024-12-24
**Konteks:** Butuh mode search default yang memberikan hasil terbaik. Vector search bagus untuk semantic, keyword search bagus untuk istilah teknis.
**Keputusan:** Hybrid search (vector + BM25) sebagai default.
**Alasan:**
- Menggabungkan kelebihan kedua metode.
- Parameter alpha (0.7 default) bisa di-tuning.
- Min-max normalization memungkinkan fusion fair.
**Alternatif ditolak:**
- Pure vector search — lemah pada keyword spesifik.
- Pure keyword search — tidak bisa tangkap sinonim/konteks.
**Konsekuensi:**
- Overhead compute lebih besar (dua kali search).
- Candidate pool harus lebih besar dari topK.

## ADR-004: Smart Chunking (Auto-Detect) sebagai Default

**Tanggal:** 2024-10-15
**Konteks:** Fixed-size chunking sering potong di tengah kalimat/paragraf, mengurangi kualitas embedding.
**Keputusan:** Auto-detect chunking (paragraph-aware) sebagai default, fixed-size sebagai fallback.
**Alasan:**
- Paragraph boundary menghasilkan chunk lebih koheren.
- Sentence boundary awareness mencegah kalimat terpotong.
- Q&A CSV special mode untuk format tanya-jawab.
**Alternatif ditolak:**
- Fixed-size only — chunk tidak natural, embedding kurang optimal.
- Semantic chunking (NLP-based) — terlalu berat untuk proyek ini.

## ADR-005: Local-First Architecture

**Tanggal:** 2024-01-01
**Konteks:** Menentukan prioritas desain: lokal atau cloud.
**Keputusan:** Local-first — 100% offline, zero API calls wajib.
**Alasan:**
- Privasi penuh — data tidak pernah meninggalkan perangkat.
- Tidak ada recurring cost.
- Bisa digunakan tanpa internet.
**Konsekuensi:**
- Fitur cloud (sync, backup) tidak tersedia.
- User harus download model sendiri.

## ADR-006: Metadata Persistence via JSON File

**Tanggal:** 2024-09-01
**Konteks:** Perlu menyimpan metadata dokumen (createdDate, model, dll) yang tidak bisa disimpan di Vectra index.
**Keputusan:** File JSON terpisah (`documents/.metadata.json`).
**Alasan:**
- Sederhana, tidak butuh dependency tambahan.
- Mudah dibaca dan diedit manual jika perlu.
- Selaras dengan filosofi lokal-first.
**Alternatif ditolak:**
- Embedded di Vectra metadata — terbatas.
- SQLite — overhead untuk kebutuhan sederhana.

## ADR-007: ES Modules (type: module)

**Tanggal:** 2024-01-01
**Konteks:** Memilih module system JavaScript.
**Keputusan:** ECMAScript Modules (`"type": "module"`).
**Alasan:**
- Standar modern JavaScript.
- `import`/`export` syntax lebih clean.
- Future-proof.
**Konsekuensi:**
- Tidak bisa `require()` langsung — perlu import syntax atau createRequire.

## ADR-008: Vanilla HTML/CSS/JS untuk Web UI

**Tanggal:** 2024-08-15
**Konteks:** Butuh antarmuka web tanpa menambah kompleksitas build tooling.
**Keputusan:** Vanilla HTML + CSS + JavaScript, zero framework.
**Alasan:**
- Tidak perlu Node.js build step.
- File statis — bisa di-serve langsung oleh Express.
- Cukup untuk 3 tab sederhana.
**Alternatif ditolak:**
- React/Vue — butuh build step, menambah kompleksitas.
**Konsekuensi:**
- State management manual.
- Tidak reactive (harus DOM manipulation manual).
