# Product Requirements Document (PRD) — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## 1. Problem Statement

Layanan semantic search berbasis cloud (OpenAI, Pinecone, dll) memerlukan koneksi internet, API key dengan biaya per penggunaan, dan upload data ke server pihak ketiga (risiko privasi). Kebutuhan akan semantic search lokal yang tidak memerlukan koneksi internet, tanpa biaya per query, data tetap 100% di perangkat pengguna, dan dapat diintegrasikan dengan LLM lokal maupun cloud.

## 2. Target User

### Primary: Developer

- Membangun aplikasi yang membutuhkan semantic search pada dokumen internal.
- Ingin integrasi via REST API.
- Membutuhkan CLI tools untuk automation.

### Secondary: Knowledge Worker

- Ingin mencari dokumen pribadi secara semantik.
- Nyaman dengan antarmuka web sederhana.
- Tidak ingin data meninggalkan perangkat.

## 3. Prioritas Fitur (MoSCoW)

### Must Have

| Fitur | ID FRD |
|---|---|
| Semantic search dengan vector embedding | FR-001 |
| Upload dan indexing dokumen PDF | FR-002 |
| REST API server | FR-003 |
| Web UI untuk training dan search | FR-004 |
| CLI untuk ingest dan search | FR-005 |
| Konfigurasi via environment variables | FR-006 |
| Dukungan format TXT dan MD | FR-007 |

### Should Have

| Fitur | ID FRD |
|---|---|
| Dukungan format DOCX | FR-008 |
| Dukungan format XLSX/XLS | FR-009 |
| Dukungan format CSV | FR-010 |
| Dukungan format PPTX | FR-011 |
| Keyword search (BM25) | FR-012 |
| Hybrid search (vector + keyword) | FR-013 |
| Smart chunking dengan auto-detect | FR-014 |
| Metadata tracking per dokumen | FR-015 |
| URL fetch dan indexing | FR-016 |
| Retrain dokumen individual dan massal | FR-017 |

### Could Have

| Fitur | ID FRD |
|---|---|
| Swagger/OpenAPI documentation | FR-018 |
| Auto-find available port | FR-019 |
| Text input langsung (tanpa file) | FR-020 |
| Multiple source URLs per dokumen | FR-021 |
| Custom display name untuk dokumen | FR-022 |

### Won't Have (Saat Ini)

- OCR untuk gambar/scan (_TBD_).
- Autentikasi multi-user.
- Distributed mode.
- Realtime collaboration.

## 4. User Stories

1. Sebagai developer, saya ingin mengupload dokumen PDF via API agar isinya dapat dicari secara semantik.
2. Sebagai developer, saya ingin mencari chunk paling relevan dengan query tertentu agar bisa digunakan sebagai context LLM.
3. Sebagai knowledge worker, saya ingin mengupload file DOCX dan XLSX melalui web UI agar mudah diindex.
4. Sebagai developer, saya ingin mengganti model embedding tanpa kehilangan data dokumen.
5. Sebagai user, saya ingin URL website di-fetch dan di-index agar konten web bisa dicari.
6. Sebagai developer, saya ingin melihat daftar dokumen yang sudah di-training beserta metadatanya.
7. Sebagai user, saya ingin menghapus dokumen tertentu tanpa menghapus semuanya.
8. Sebagai developer, saya ingin melakukan hybrid search (semantic + keyword) untuk hasil lebih akurat.

## 5. Metrik

| Metrik | Target | Alat Ukur |
|---|---|---|
| Waktu indexing per dokumen | < 30 detik untuk 50 halaman | Log server |
| Waktu search per query | < 3 detik | Log server / client timing |
| Akurasi semantic search | Precision@5 > 70% | Uji manual |
| Akurasi hybrid search | Precision@5 > 80% | Uji manual |
| Dukungan format file | 8 format (PDF/DOCX/XLSX/CSV/PPTX/TXT/MD/URL) | Dokumentasi |
| Uptime server | > 99% | Monitoring manual |
