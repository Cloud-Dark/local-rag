# 🤖 RAG Lokal — Node.js

Sistem **Retrieval-Augmented Generation (RAG)** untuk **semantic search** dokumen.
Berjalan **100% lokal**, tanpa API key, tanpa biaya.

> **Catatan:** Project ini hanya menyediakan **embedding** dan **semantic search**. 
> LLM/chat disediakan terpisah sesuai kebutuhan kamu.

---

## Stack

| Komponen | Library | Keterangan |
|---|---|---|
| PDF Parser | `pdf-parse` | Baca file PDF |
| Embedding | `node-llama-cpp` | GGUF embedding model |
| Vector Store | `vectra` | JSON lokal, no server |
| API Server | `express` | REST API untuk training & search |

---

## Struktur Folder

```
rag-local/
├── documents/        ← Taruh PDF & TXT kamu di sini
├── models/           ← Taruh file .gguf embedding model
├── db/               ← Vector store (otomatis dibuat)
└── src/
    ├── config.js     ← Konfigurasi utama
    ├── loader.js     ← Load & chunk dokumen
    ├── embedder.js   ← Embedding via GGUF
    ├── vectorStore.js← Vectra wrapper
    ├── ingest.js     ← Script indexing dokumen
    ├── search.js     ← Script semantic search (CLI)
    └── server.js     ← REST API server
```

---

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Download model GGUF embedding dari HuggingFace

**Embedding model** (rekomendasi):
```bash
# nomic-embed-text (ringan, bagus)
# https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF

# Download manual atau gunakan wget:
wget -P ./models https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_S.gguf
```

### 3. Edit config.js
```js
EMBEDDING_MODEL_PATH: "./models/nomic-embed-text-v1.5.Q4_K_S.gguf",
```

### 4. Taruh dokumen
```bash
cp dokumen-kamu.pdf ./documents/
cp catatan.txt ./documents/
```

---

## Penggunaan

### 1. Jalankan API Server
```bash
npm start
```

Server akan berjalan di `http://localhost:3000`

**Swagger UI:** http://localhost:3000/api-docs

**Endpoints yang tersedia:**

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/training` | Upload & index dokumen |
| `GET` | `/get-list` | Lihat semua dokumen yang sudah di-training |
| `POST` | `/search` | Cari chunk paling relevan |
| `GET` | `/health` | Status server |
| `DELETE` | `/reset` | Hapus semua data / data file tertentu |

---

### 2. Upload & Training Dokumen

**Via API:**
```bash
curl -X POST http://localhost:3000/training \
  -F "files=@dokumen1.pdf" \
  -F "files=@dokumen2.txt"
```

**Response:**
```json
{
  "success": true,
  "processed": [
    { "fileName": "dokumen1.pdf", "chunks": 24 }
  ],
  "failed": [],
  "totalChunksInDB": 56
}
```

---

### 3. Lihat Dokumen yang Sudah Di-training

```bash
curl http://localhost:3000/get-list
```

**Response:**
```json
{
  "totalChunks": 56,
  "totalDocuments": 3,
  "documents": [
    {
      "fileName": "dokumen1.pdf",
      "chunks": 24,
      "fileExists": true,
      "filePath": "./documents/dokumen1.pdf"
    }
  ],
  "lastTraining": "2024-01-01T00:00:00.000Z",
  "isTrainingRunning": false
}
```

---

### 4. Search / Semantic Search

**Via API:**
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "apa itu machine learning?", "topK": 3}'
```

**Response:**
```json
{
  "query": "apa itu machine learning?",
  "topK": 3,
  "results": [
    {
      "rank": 1,
      "score": 0.921,
      "fileName": "intro-ml.pdf",
      "chunkIndex": 4,
      "text": "Machine learning adalah..."
    }
  ]
}
```

**Via CLI:**
```bash
npm run search
```

---

### 5. Reset / Hapus Data

**Hapus semua data:**
```bash
curl -X DELETE http://localhost:3000/reset
```

**Hapus data dari file tertentu saja:**
```bash
curl -X DELETE "http://localhost:3000/reset?filesOnly=true&fileName=dokumen.pdf"
```

**Response:**
```json
{
  "success": true,
  "message": "Semua data dihapus",
  "deletedChunks": 56
}
```

---

### 6. Ingest Dokumen (CLI Mode)

Jika ingin indexing dokumen dari folder `documents/` secara langsung:

```bash
# Ingest semua dokumen di folder documents/
npm run ingest

# Reset + ingest ulang dari awal
npm run ingest:reset
```

---

## Tips

- **Chunk size**: Kalau dokumen panjang & padat, naikkan `CHUNK_SIZE` ke 800-1000 di `config.js`
- **TOP_K**: Naikkan ke 5 kalau jawaban kurang lengkap
- **Model ringan**: Kalau RAM terbatas, pakai model Q2_K atau Q3_K

---

## Troubleshooting

| Error | Solusi |
|---|---|
| `Model not found` | Cek path di `config.js`, pastikan file `.gguf` ada |
| `Out of memory` | Pakai model yang lebih kecil (Q2_K atau Q3_K) |
| `Empty database` | Jalankan `npm run ingest` atau upload dokumen via `/training` |

---

## Integrasi dengan LLM Kamu

Setelah dapat hasil search, kamu bisa kirim ke LLM pilihan kamu:

```javascript
const response = await fetch('http://localhost:3000/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'pertanyaan kamu', topK: 3 })
});

const { results } = await response.json();

// Kirim context ke LLM kamu
const context = results.map(r => r.text).join('\n\n');
const jawaban = await callYourLLM(context, pertanyaan);
```
