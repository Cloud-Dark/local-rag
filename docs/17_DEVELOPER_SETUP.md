# Developer Setup — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Prasyarat

- **Node.js** v18+ (native fetch API support).
- **npm** (biasanya bundled dengan Node.js).
- **Git** (opsional, untuk version control).
- **File model GGUF embedding** (download dari HuggingFace).
- **RAM**: Minimal 2GB free untuk model embedding.
- **Disk**: ~500MB untuk model + ~100MB untuk dependencies.

## Setup Langkah demi Langkah

### 1. Clone Repository

```bash
git clone <your-repo-url>
cd local-rag
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Download Model Embedding

Rekomendasi model GGUF embedding:

```bash
# nomic-embed-text v1.5 — ringan, performa baik (137MB)
wget -P ./models https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_S.gguf

# BGE-M3 Q8_0 — multilingual, 8192 context (2.5GB)
# https://huggingface.co/maidalun1020/bce-embedding-base_v1-GGUF
```

### 4. Konfigurasi

Buat/update file `.env` di root project:

```env
EMBEDDING_MODEL_PATH=./models/bge-m3-Q8_0.gguf
EMBEDDING_CONTEXT_SIZE=8192
CHUNK_SIZE=800
CHUNK_OVERLAP=100
TOP_K=5
SEARCH_MIN_SCORE=0.7
DOCUMENTS_DIR=./documents
DB_PATH=./db/vectra
```

Sesuaikan `EMBEDDING_MODEL_PATH` dengan model yang didownload.

### 5. Siapkan Dokumen

Letakkan file yang ingin di-index di folder `documents/`.

Format didukung: .pdf, .txt, .md, .docx, .xlsx, .xls, .pptx, .csv.

### 6. Jalankan Server

```bash
npm start
```

Server akan berjalan secara default di `http://localhost:3000`.

Jika port 3000 sudah dipakai, server akan mencari port berikutnya (3001, 3002, ...).

### 7. Akses Web UI

Buka browser ke `http://localhost:3000`.

### 8. (Opsional) CLI Batch Indexing

```bash
npm run ingest
```

### 9. Testing Setup

```bash
# Cek status server
curl http://localhost:3000/api/health

# Upload dokumen
curl -X POST http://localhost:3000/api/training -F "files=@documents/contoh.pdf"

# Search
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "topK": 3}'
```

## Scripts npm

| Script | Perintah | Deskripsi |
|---|---|---|
| `start` | `node src/server.js` | Jalankan API server |
| `start:dev` | `set PORT=3001 && node src/server.js` | Server dengan port 3001 |
| `ingest` | `node src/ingest.js` | Batch indexing dokumen |
| `ingest:reset` | `node src/ingest.js --reset` | Reset + batch indexing |
| `search` | `node src/search.js` | CLI semantic search |

## Troubleshooting

### Model tidak ditemukan

```
Error: Embedding model tidak ditemukan: ./models/bge-m3-Q8_0.gguf
```

Solusi: Download model GGUF dan tempatkan sesuai `EMBEDDING_MODEL_PATH` di .env.

### Port sudah dipakai

Server auto-find port berikutnya. Cek console log untuk URL yang benar.

### ESM import error

Pastikan `"type": "module"` ada di package.json.

### Error PDF parsing

Pastikan file PDF tidak corrupt dan bisa dibaca.

### Training berjalan lama

Proses embedding sequential — waktu tergantung jumlah chunk dan kecepatan CPU.
