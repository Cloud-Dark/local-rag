# RAG Local — Dokumentasi Lengkap

Sistem **Retrieval-Augmented Generation (RAG)** untuk **semantic search** dokumen.  
Berjalan **100% lokal**, tanpa API key, tanpa biaya.

> Project ini menyediakan **embedding** dan **semantic search**.  
> LLM/chat disediakan terpisah sesuai kebutuhan.

---

## Daftar Isi

- [Tech Stack](#tech-stack)
- [Struktur Folder](#struktur-folder)
- [Setup & Instalasi](#setup--instalasi)
- [Konfigurasi (.env)](#konfigurasi-env)
- [Cara Menjalankan Server](#cara-menjalankan-server)
- [API Endpoints](#api-endpoints)
  - [POST /api/training](#1-post-apitraining)
  - [POST /api/retrain](#2-post-apiretrain)
  - [POST /api/retrain-all](#3-post-apiretrain-all)
  - [GET /api/get-list](#4-get-apiget-list)
  - [POST /api/search](#5-post-apisearch)
  - [GET /api/health](#6-get-apihealth)
  - [DELETE /api/reset](#7-delete-apireset)
  - [GET /api/file/:fileName](#8-get-apifilename)
  - [GET /api/text/:fileName](#9-get-apitextfilename)
- [Web UI](#web-ui)
- [CLI Usage](#cli-usage)
- [3 Mode Pencarian](#3-mode-pencarian)
- [FAQ](#faq)

---

## Tech Stack

| Komponen | Library | Fungsi |
|---|---|---|
| **Embedding Model** | `node-llama-cpp` | Load GGUF model untuk generate vector embedding |
| **Vector Store** | `vectra` | Vector database (JSON lokal, tanpa server) |
| **PDF Parser** | `pdf-parse` | Baca teks dari file PDF |
| **API Server** | `express` + `multer` | REST API + file upload |
| **Frontend** | Vanilla HTML/CSS/JS | Web UI 4 tab (Training, List, Search, API) |
| **Swagger** | `swagger-ui-express` | Dokumentasi API interaktif |

---

## Struktur Folder

```
D:\project\local-rag\
├── .env                    ← Konfigurasi environment
├── .gitignore
├── package.json
├── README.md
├── swagger.yaml            ← Dokumentasi OpenAPI 3.0
├── test-search.js          ← Test hybrid search
│
├── agent.md                ← Dokumentasi ini 📄
│
├── documents/              ← Folder dokumen (upload & penyimpanan)
│   ├── .metadata.json      ← Metadata tracking (createdDate, model, etc.)
│   ├── *.pdf
│   ├── *.txt
│   └── *.md
│
├── models/                 ← Letakkan file .gguf embedding model di sini
│   └── *.gguf
│
├── db/                     ← Vector database (otomatis dibuat)
│   └── vectra/
│       └── index.json
│
├── public/                 ← Static files (Web UI)
│   └── index.html
│
└── src/                    ← Source code
    ├── config.js           ← Konfigurasi dari environment
    ├── server.js           ← Express API server (entry point utama)
    ├── embedder.js         ← Embedding via GGUF (node-llama-cpp)
    ├── vectorStore.js      ← Wrapper Vectra (CRUD vector index)
    ├── loader.js           ← Load PDF/TXT + chunking (smart & fixed mode)
    ├── ingest.js           ← CLI batch indexing
    ├── search.js           ← CLI semantic search
    └── keywordSearch.js    ← BM25 keyword search engine
```

---

## Setup & Instalasi

### 1. Prasyarat

- **Node.js** v18+
- **npm**
- File model **GGUF embedding** (download dari HuggingFace)

### 2. Clone & Install

```bash
git clone <repo-url>
cd D:\project\local-rag
npm install
```

### 3. Download Model Embedding

Rekomendasi model GGUF embedding:

```bash
# nomic-embed-text v1.5 — ringan,推荐
wget -P ./models https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_S.gguf

# BGE-M3 — support multilingual, 8192 context
# https://huggingface.co/maidalun1020/bce-embedding-base_v1-GGUF
```

### 4. Konfigurasi .env

Buat file `.env` (sudah ada, edit sesuai kebutuhan):

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

### 5. Jalankan Server

```bash
npm start
```

Server akan berjalan di `http://localhost:3000` (otomatis cari port berikutnya jika 3000 sudah dipakai).

---

## Konfigurasi (.env)

| Variable | Default | Deskripsi |
|---|---|---|
| `EMBEDDING_MODEL_PATH` | `./models/bge-m3-Q8_0.gguf` | Path ke file model GGUF embedding |
| `EMBEDDING_CONTEXT_SIZE` | `8192` | Context window model embedding (token) |
| `CHUNK_SIZE` | `800` | Ukuran chunk dalam karakter |
| `CHUNK_OVERLAP` | `100` | Overlap antar chunk (karakter) |
| `TOP_K` | `5` | Jumlah hasil search default |
| `SEARCH_MIN_SCORE` | `0.7` | Threshold minimum similarity score |
| `DOCUMENTS_DIR` | `./documents` | Folder penyimpanan dokumen |
| `DB_PATH` | `./db/vectra` | Path vector database |

---

## Cara Menjalankan Server

### Production

```bash
npm start
```

### Development (port 3001)

```bash
npm run start:dev
```

### Akses

| URL | Fungsi |
|---|---|
| `http://localhost:3000` | Redirect ke Web UI |
| `http://localhost:3000/ui` | Web UI (Training, List, Search) |
| `http://localhost:3000/api/api-docs` | Swagger UI dokumentasi API |

---

## API Endpoints

### **1. POST /api/training**

Upload file, URL, atau text untuk di-embedding dan di-index.

#### Content-Type: `multipart/form-data`

| Field | Tipe | Required | Deskripsi |
|---|---|---|---|
| `files` | File(s) | No | File PDF/TXT/MD/DOCX/XLSX/XLS/PPTX/CSV (bisa multiple) |
| `urls` | String (JSON array) | No | URL untuk di-fetch, contoh: `["https://example.com"]` |
| `url` | String | No | Single URL (alternatif `urls`) |
| `text` | String | No | Teks langsung |
| `customNames` | String (JSON array) | No | Nama display untuk setiap item |
| `sourceUrls` | String (JSON array) | No | URL sumber untuk setiap file |

**Contoh — Upload file:**

```bash
curl -X POST http://localhost:3000/api/training \
  -F "files=@dokumen.pdf" \
  -F "files=@catatan.txt"
```

**Contoh — Upload file dengan nama kustom & source URL:**

```bash
curl -X POST http://localhost:3000/api/training \
  -F "files=@sop.pdf" \
  -F 'customNames=["SOP_Perusahaan"]' \
  -F 'sourceUrls=["https://internal.company.com/sop"]'
```

**Contoh — Fetch dari URL:**

```bash
curl -X POST http://localhost:3000/api/training \
  -H "Content-Type: application/json" \
  -d '{"urls": ["https://example.com/article"]}'
```

**Contoh — Upload file + URL + text sekaligus:**

```bash
curl -X POST http://localhost:3000/api/training \
  -F "files=@doc1.pdf" \
  -F 'urls=["https://example.com"]' \
  -F "text=Ini teks langsung yang ingin di-index" \
  -F 'customNames=["Doc1", "WebPage", "CatatanSaya"]'
```

**Contoh — Training text dengan multiple source URLs:**

```bash
curl -X POST http://localhost:3000/api/training \
  -F "text=Ini adalah knowledge base tentang kebijakan perusahaan" \
  -F 'sourceUrls=["https://company.com/kebijakan1", "https://company.com/kebijakan2"]'
```

**Response:**

```json
{
  "success": true,
  "processed": [
    { "fileName": "dokumen.pdf", "chunks": 24, "sourceUrl": null },
    { "fileName": "catatan.txt", "chunks": 5, "sourceUrl": null }
  ],
  "failed": [],
  "totalChunksInDB": 56
}
```

---

### **2. POST /api/retrain**

Retrain ulang dokumen tertentu dengan model embedding terbaru.  
Berguna ketika mengganti model embedding (misal upgrade dari nomic-embed ke BGE-M3).

**Request:**

```bash
curl -X POST http://localhost:3000/api/retrain \
  -H "Content-Type: application/json" \
  -d '{"fileName": "dokumen.pdf"}'
```

**Response:**

```json
{
  "success": true,
  "message": "Retrain \"dokumen.pdf\" berhasil",
  "chunks": 24,
  "modelName": "./models/bge-m3-Q8_0.gguf"
}
```

**Cara kerja retrain:**
1. Hapus data lama dari vector index
2. Baca ulang file dari disk / fetch ulang URL
3. Generate ulang embedding dengan model saat ini
4. Update metadata `lastRetrainedAt` dan `modelName`

---

### **3. POST /api/retrain-all**

Retrain SEMUA dokumen sekaligus. Cocok setelah mengganti model embedding.

```bash
curl -X POST http://localhost:3000/api/retrain-all
```

**Response:**

```json
{
  "success": true,
  "message": "Retrain semua dokumen berhasil",
  "totalDocuments": 5,
  "totalChunks": 120,
  "failed": 0,
  "modelName": "./models/bge-m3-Q8_0.gguf"
}
```

> ⚠️ **Peringatan:** Endpoint ini akan menghapus semua data lama, lalu memproses ulang dari awal. Pastikan file asli masih ada di folder `documents/`.

---

### **4. GET /api/get-list**

Lihat semua dokumen yang sudah di-training beserta metadatanya.

```bash
curl http://localhost:3000/api/get-list
```

**Response:**

```json
{
  "totalChunks": 120,
  "totalDocuments": 5,
  "documents": [
    {
      "fileName": "dokumen.pdf",
      "chunks": 24,
      "sourceUrl": null,
      "createdDate": "2024-01-01T00:00:00.000Z",
      "modelName": "./models/bge-m3-Q8_0.gguf",
      "lastRetrainedAt": "2024-01-02T00:00:00.000Z",
      "fileExists": true,
      "filePath": "D:\\project\\local-rag\\documents\\dokumen.pdf",
      "isUrl": false
    },
    {
      "fileName": "example.com",
      "chunks": 8,
      "sourceUrl": "https://example.com/article",
      "createdDate": "2024-01-01T00:00:00.000Z",
      "modelName": "./models/bge-m3-Q8_0.gguf",
      "lastRetrainedAt": null,
      "fileExists": false,
      "filePath": null,
      "isUrl": true
    }
  ],
  "lastTraining": "2024-01-02T00:00:00.000Z",
  "isTrainingRunning": false,
  "embeddingModel": "./models/bge-m3-Q8_0.gguf"
}
```

**Field metadata per dokumen:**

| Field | Deskripsi |
|---|---|
| `fileName` | Nama/tampilan dokumen |
| `chunks` | Jumlah chunk yang dihasilkan |
| `sourceUrl` | URL sumber (untuk URL fetch) atau array of URLs |
| `createdDate` | Tanggal pertama kali di-training |
| `modelName` | Model embedding yang digunakan saat training |
| `lastRetrainedAt` | Tanggal terakhir di-retrain |
| `fileExists` | Apakah file fisik masih ada di disk |
| `filePath` | Path file fisik (null untuk URL source) |
| `isUrl` | Apakah dari URL fetch |

---

### **5. POST /api/search**

Cari chunk paling relevan berdasarkan query. Mendukung 3 mode pencarian.

**Request:**

```json
{
  "query": "apa itu machine learning?",
  "topK": 5,
  "searchType": "hybrid",
  "alpha": 0.7,
  "minScore": 0.7
}
```

| Field | Tipe | Default | Deskripsi |
|---|---|---|---|
| `query` | String | **wajib** | Pertanyaan atau teks yang dicari |
| `topK` | Integer | dari `.env` | Jumlah hasil yang dikembalikan |
| `searchType` | String | `"hybrid"` | Mode: `"vector"`, `"keyword"`, atau `"hybrid"` |
| `alpha` | Float (0-1) | `0.7` | Bobot vector search di mode hybrid (0=keyword penuh, 1=vector penuh) |
| `minScore` | Float (0-1) | dari `.env` | Threshold skor minimum |

**Contoh:**

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "apa itu RAG?", "topK": 3}'
```

**Response:**

```json
{
  "query": "apa itu RAG?",
  "topK": 3,
  "minScore": 0.7,
  "searchType": "hybrid",
  "alpha": 0.7,
  "bestScore": 0.921,
  "matched": true,
  "filteredOut": 2,
  "results": [
    {
      "rank": 1,
      "score": 0.921,
      "vectorScore": 0.846,
      "keywordScore": 1.234,
      "hybridScore": 0.921,
      "fileName": "intro-ml.pdf",
      "fileUrl": "/api/file/intro-ml.pdf",
      "sourceUrl": null,
      "chunkIndex": 4,
      "text": "Retrieval-Augmented Generation (RAG) adalah..."
    }
  ]
}
```

**Metrik di response:**

| Field | Deskripsi |
|---|---|
| `score` | Skor akhir (untuk hybrid = `hybridScore`) |
| `vectorScore` | Skor dari semantic/vector search (cosine similarity, 0-1) |
| `keywordScore` | Skor dari BM25 keyword search (unbounded) |
| `hybridScore` | Kombinasi terbobot: `alpha * vectorScore + (1-alpha) * keywordScore` |
| `matched` | Apakah ada hasil yang melewati threshold `minScore` |
| `filteredOut` | Jumlah hasil yang di-filter karena di bawah threshold |

---

### **6. GET /api/health**

Cek status server dan database.

```bash
curl http://localhost:3000/api/health
```

**Response:**

```json
{
  "status": "ok",
  "totalChunks": 120,
  "isTrainingRunning": false,
  "embeddingModel": "./models/bge-m3-Q8_0.gguf"
}
```

---

### **7. DELETE /api/reset**

Hapus data dari vector database.

**Hapus semua data:**

```bash
curl -X DELETE http://localhost:3000/api/reset
```

**Hapus data dari file tertentu:**

```bash
curl -X DELETE "http://localhost:3000/api/reset?filesOnly=true&fileName=dokumen.pdf"
```

**Hapus URL source:**

```bash
curl -X DELETE "http://localhost:3000/api/reset?filesOnly=true&fileName=example.com"
```

**Response:**

```json
{
  "success": true,
  "message": "Data dari file \"dokumen.pdf\" dihapus",
  "deletedChunks": 24,
  "remainingChunks": 96
}
```

**Response (semua):**

```json
{
  "success": true,
  "message": "Semua data dihapus",
  "deletedChunks": 120
}
```

---

### **8. GET /api/file/:fileName**

Download/akses file dokumen langsung.

```bash
# Buka di browser automatis
curl http://localhost:3000/api/file/dokumen.pdf

# Untuk text input tanpa ekstensi, otomatis cari .txt
curl http://localhost:3000/api/file/NamaDokumen
```

Response: File binary dengan `Content-Type` sesuai ekstensi (PDF, TXT, atau MD).

---

### **9. GET /api/text/:fileName**

Ambil konten teks dari database untuk text input atau URL fetch.

```bash
curl http://localhost:3000/api/text/CatatanSaya
```

**Response:**

```json
{
  "success": true,
  "fileName": "CatatanSaya",
  "chunks": [
    { "chunkIndex": 0, "text": "Ini adalah... " },
    { "chunkIndex": 1, "text": "Lanjutan dari..." }
  ],
  "fullText": "Ini adalah... Lanjutan dari...",
  "totalChunks": 2
}
```

---

## Web UI

Akses di `http://localhost:3000/ui` — Single Page Application dengan 4 tab:

### Tab 1: Training

3 metode input:

1. **Text Input** — Paste teks langsung, tambahkan Source URL (optional)
2. **File Upload** — Upload file PDF/TXT/MD/DOCX/XLSX/XLS/PPTX/CSV (bisa multiple)
3. **URL Fetch** — Masukkan URL website untuk di-fetch dan di-index

### Tab 2: List (Documents)

Menampilkan semua dokumen yang sudah di-training dengan informasi:
- Nama dokumen (dengan icon 🌐 untuk URL, 📄 untuk file)
- Jumlah chunks
- Tanggal created & retrained
- Model embedding yang digunakan
- Tombol **View** (lihat file / konten teks)
- Tombol **Retrain** (ulang proses embedding)
- Tombol **Delete** (hapus dari database)
- Tombol **Retrain All** (proses ulang semua dokumen)

### Tab 3: Search

Form search dengan input query + konfigurasi:
- Mode pencarian: **Hybrid**, **Vector**, atau **Keyword**
- Alpha slider (khusus hybrid, 0=keyword murni, 1=vector murni)
- Jumlah hasil (topK: 3/5/10/20)
- Min score threshold slider

Menampilkan hasil:
- Similarity score dalam persen
- Nama file sumber
- Potongan teks relevan
- Source URL links (jika ada)
- Link download file (jika dari file lokal)

### Tab 4: API

Dokumentasi API lengkap yang bisa di-copy (satu klik) untuk diberikan ke AI agent lain.
Berisi semua endpoint, contoh curl, response JSON, dan tips integrasi.

---

## CLI Usage

### Batch Indexing

Proses semua file di folder `documents/` sekaligus:

```bash
npm run ingest
```

**Dengan reset index dulu:**

```bash
npm run ingest:reset
```

### Semantic Search via Terminal

```bash
npm run search
```

Interactive mode — ketik query, dapatkan JSON output.

**Pipe mode (untuk integrasi):**

```bash
echo "apa itu RAG?" | node src/search.js
```

### Test Hybrid Search

```bash
node test-search.js
```

Menampilkan perbandingan vector search vs keyword search vs hybrid.

---

## 3 Mode Pencarian

### 1. Vector Search (Semantic)

Menggunakan embedding model untuk mencari makna/konteks, bukan kata persis.

- **Cocok untuk:** Pertanyaan konseptual, paraphrase, sinonim
- **Parameter:** `searchType: "vector"`
- **Skor:** Cosine similarity (0–1, normal ke hasil terbaik)

### 2. Keyword Search (BM25)

Mencocokkan kata persis menggunakan algoritma BM25.

- **Cocok untuk:** Istilah teknis, kode, nama produk
- **Parameter:** `searchType: "keyword"`
- **Skor:** BM25 score (unbounded, dinormalisasi dalam hybrid)

Parameter BM25:
- `k1 = 1.2` — mengontrol saturation term frequency
- `b = 0.75` — mengontrol pengaruh panjang dokumen

### 3. Hybrid Search (Default)

Menggabungkan vector + keyword dengan bobot `alpha`.

- **Parameter:** `searchType: "hybrid"`, `alpha: 0.7` (default)
- **Rumus:** `score = alpha * norm(vectorScore) + (1-alpha) * norm(keywordScore)`
- Normalisasi min-max dilakukan terpisah sebelum fusion

---

## FAQ

### Bagaimana cara mengganti model embedding?

1. Download model GGUF baru ke folder `models/`
2. Update `EMBEDDING_MODEL_PATH` di `.env`
3. RESTART server
4. Lakukan **Retrain All** dari Web UI atau API:

```bash
curl -X POST http://localhost:3000/api/retrain-all
```

### Dokumen tidak muncul di List?

Pastikan server sudah selesai memproses (cek `isTrainingRunning: false` di health check).  
Coba refresh halaman List.

### Error "Training sedang berjalan"?

Training berjalan sequential — tunggu sampai selesai.  
Cek status:

```bash
curl http://localhost:3000/api/health
```

### File upload gagal?

Format yang didukung: **.pdf**, **.txt**, **.md**, **.docx**, **.xlsx**, **.xls**, **.pptx**, **.csv**.  
Cek folder `documents/` apakah masih ada ruang.

### Bagaimana cara reset total?

Hapus folder `db/` dan `documents/`, atau:

```bash
curl -X DELETE http://localhost:3000/api/reset
```

### Apakah bisa integrasi dengan LLM lain?

Ya! API response adalah JSON murni — bisa di-pipe ke LLM mana pun (ChatGPT, Claude, Ollama, LLM lokal, dll).

Contoh pipeline:

```bash
# Search → kasih ke LLM sebagai context
curl -s -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"query":"kebijakan cuti","topK":3}' \
  | jq '.results[].text'
```

### Port 3000 sudah dipakai?

Server otomatis mencari port berikutnya (3001, 3002, ...).  
Cek log di terminal untuk URL yang benar.

---

## Quick Reference — Semua Endpoints

| Method | Endpoint | Deskripsi |
|---|---|---|
| `POST` | `/api/training` | Upload file / URL / text untuk di-index |
| `POST` | `/api/retrain` | Retrain dokumen tertentu |
| `POST` | `/api/retrain-all` | Retrain semua dokumen |
| `GET` | `/api/get-list` | Lihat daftar dokumen |
| `POST` | `/api/search` | Semantic / keyword / hybrid search |
| `GET` | `/api/health` | Status server |
| `DELETE` | `/api/reset` | Hapus data |
| `GET` | `/api/file/:name` | Download file |
| `GET` | `/api/text/:name` | Lihat konten teks |
| `GET` | `/api/api-docs` | Swagger UI |
| `GET` | `/ui` atau `/` | Web UI |
