# Project Charter — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Visi

Sistem Retrieval-Augmented Generation (RAG) yang berjalan 100% lokal, tanpa API key, tanpa biaya berlangganan, dan tanpa ketergantungan ke layanan eksternal. Memberdayakan individu dan organisasi untuk melakukan semantic search pada dokumen pribadi mereka dengan privasi penuh.

## Misi

1. Menyediakan mesin semantic search yang dapat dijalankan di laptop/PC tanpa koneksi internet.
2. Mendukung berbagai format dokumen umum (PDF, DOCX, XLSX, PPTX, CSV, TXT, MD).
3. Memberikan REST API sederhana dengan dokumentasi interaktif (Swagger).
4. Menyediakan antarmuka web untuk kemudahan penggunaan non-teknis.
5. Menjaga performa embedding dan pencarian tetap optimal di perangkat konsumen.

## Scope

### In Scope

- Semantic search berbasis vector embedding menggunakan model GGUF lokal.
- Keyword search menggunakan algoritma BM25.
- Hybrid search (gabungan vector + keyword).
- Upload dan indexing dokumen multiple format.
- URL fetching untuk konten web.
- REST API dengan dokumentasi Swagger/OpenAPI 3.0.
- Web UI (Single Page Application) untuk training dan search.
- CLI tools untuk ingest dan search.
- Metadata tracking per dokumen (created date, model, retrain history).
- Retrain individual dan massal.
- Auto-detection port jika port default sudah terpakai.
- Smart chunking dengan auto-detect mode dan fixed-size mode.
- Dukungan multi-sheet Excel dan presentasi PowerPoint.

### Out of Scope

- LLM/chat generation (project hanya menyediakan embedding dan retrieval).
- OCR untuk gambar/scan (_TBD_ — rencana Tesseract.js).
- Autentikasi dan authorisasi multi-user.
- Distributed/cluster mode.
- Realtime collaboration.
- Dashboard analytics.
- Cloud deployment.

## Stakeholder

| Stakeholder | Peran |
|---|---|
| Cloud Dark | Pemilik proyek, pengembang utama |
| Developer / Knowledge Worker | Target pengguna utama |
| Komunitas open-source | Kontributor potensial |

## Kriteria Sukses

1. Server berjalan di Windows dengan Node.js 18+.
2. Semantic search menghasilkan relevansi bermakna (skor cosine similarity > 0.7 untuk hasil relevan).
3. Hybrid search outperforms pure vector atau pure keyword search.
4. Semua format dokumen didukung dapat diproses tanpa error.
5. Server auto-recovery pada port conflict.
6. Dokumentasi API lengkap dan interaktif.

## Milestone Board

Lihat [07_MASTER_CHECKLIST.md](07_MASTER_CHECKLIST.md).
