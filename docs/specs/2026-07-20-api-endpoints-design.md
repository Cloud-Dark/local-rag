# API Endpoints Design — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Base URL

```
http://localhost:3000/api
```

Server auto-find port jika default terpakai. Semua endpoints di-prefix dengan `/api`.

## Authentication

Tidak ada autentikasi. Server berjalan di localhost.

---

## POST /api/training

Upload dan index dokumen (file, URL, atau text langsung).

### Request

**Content-Type:** `multipart/form-data`

| Field | Tipe | Required | Deskripsi |
|---|---|---|---|
| `files` | File(s) | No | File dokumen (PDF, TXT, MD, DOCX, XLSX, XLS, PPTX, CSV) — multiple |
| `urls` | String (JSON array) | No | URL untuk di-fetch: `["https://example.com"]` |
| `url` | String | No | Single URL (alternatif `urls`) |
| `text` | String | No | Teks langsung |
| `customNames` | String (JSON array / comma-separated) | No | Nama display: `["Doc1","Doc2"]` atau `"Doc1,Doc2"` |
| `sourceUrls` | String (JSON array / comma-separated) | No | URL sumber: `["https://src1"]` |

**Content-Type:** `application/json`

```json
{
  "urls": ["https://example.com/article"],
  "customNames": ["Article 1"]
}
```

### Response

**200 OK:**
```json
{
  "success": true,
  "processed": [
    {
      "fileName": "dokumen.pdf",
      "chunks": 24,
      "sourceUrl": null
    }
  ],
  "failed": [],
  "totalChunksInDB": 56
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Tidak ada file, URL, atau text yang diupload."
}
```

**409 Conflict:**
```json
{
  "success": false,
  "error": "Training sedang berjalan, tunggu sampai selesai."
}
```

### Edge Cases

- File dengan nama duplikat → timestamp suffix ditambahkan (`file_1234567890.pdf`).
- Format tidak didukung → error per file, file lain tetap diproses.
- Tidak ada file/URL/text → 400 error.
- Training concurrent → 409 error.

---

## GET /api/get-list

Lihat daftar dokumen yang sudah di-training.

### Request

No parameters.

### Response

**200 OK:**
```json
{
  "totalChunks": 56,
  "totalDocuments": 3,
  "documents": [
    {
      "fileName": "dokumen.pdf",
      "chunks": 24,
      "sourceUrl": null,
      "createdDate": "2024-01-01T00:00:00.000Z",
      "modelName": "./models/bge-m3-Q8_0.gguf",
      "lastRetrainedAt": "2024-01-02T00:00:00.000Z",
      "fileExists": true,
      "filePath": "./documents/dokumen.pdf",
      "isUrl": false
    }
  ],
  "lastTraining": "2024-01-01T00:00:00.000Z",
  "isTrainingRunning": false,
  "embeddingModel": "./models/bge-m3-Q8_0.gguf"
}
```

---

## POST /api/search

Cari chunk paling relevan.

### Request

```json
{
  "query": "apa itu machine learning?",
  "topK": 5,
  "searchType": "hybrid",
  "alpha": 0.7,
  "minScore": 0.7
}
```

| Field | Tipe | Default | Required | Deskripsi |
|---|---|---|---|---|
| `query` | String | — | Yes | Teks query pencarian |
| `topK` | Number | CONFIG.TOP_K (5) | No | Jumlah hasil |
| `searchType` | String | "hybrid" | No | "vector", "keyword", atau "hybrid" |
| `alpha` | Number (0-1) | 0.7 | No | Bobot vector di hybrid mode |
| `minScore` | Number (0-1) | CONFIG.SEARCH_MIN_SCORE (0.7) | No | Threshold minimum score |

### Response

**200 OK:**
```json
{
  "query": "apa itu machine learning?",
  "topK": 5,
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
      "sourceUrl": ["https://example.com/source1"],
      "chunkIndex": 4,
      "text": "Machine learning adalah..."
    }
  ]
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Field 'query' wajib diisi dan harus berupa string."
}
```

### Search Types

| Type | Behavior |
|---|---|
| `vector` | Embed query → cosine similarity search → filter by minScore |
| `keyword` | BM25 tokenize query → score all items → sort by score → filter |
| `hybrid` | Both vector + keyword → min-max normalize → alpha fusion → sort → filter |

### Edge Cases

- Query kosong → 400 error.
- `topK` invalid → fallback ke CONFIG.TOP_K.
- `alpha` out of range (0-1) → clamp.
- `minScore` invalid → fallback ke CONFIG.SEARCH_MIN_SCORE.
- Tidak ada hasil di atas threshold → `matched: false`, `results: []`.
- Document dari URL → `fileUrl` pakai source URL pertama.
- Document lokal → `fileUrl` pakai `/api/file/...`.

---

## GET /api/health

Cek status server.

### Response

**200 OK:**
```json
{
  "status": "ok",
  "totalChunks": 56,
  "isTrainingRunning": false,
  "embeddingModel": "./models/bge-m3-Q8_0.gguf"
}
```

---

## DELETE /api/reset

Hapus data dari vector database.

### Query Parameters

| Parameter | Tipe | Default | Deskripsi |
|---|---|---|---|
| `filesOnly` | String (boolean) | "false" | Hapus file tertentu saja |
| `fileName` | String | — | Nama file yang akan dihapus |

### Responses

**200 OK (all):**
```json
{
  "success": true,
  "message": "Semua data dihapus",
  "deletedChunks": 56
}
```

**200 OK (specific file):**
```json
{
  "success": true,
  "message": "Data dari file \"dokumen.pdf\" dihapus",
  "deletedChunks": 24,
  "remainingChunks": 32
}
```

**404 (file not found):**
```json
{
  "success": false,
  "message": "File \"nonexistent.pdf\" tidak ditemukan",
  "availableFiles": ["dokumen.pdf"],
  "hint": "Gunakan GET /get-list untuk melihat daftar file yang tersedia"
}
```

### Edge Cases

- `filesOnly=true` tanpa `fileName` → hapus semua data (fallback).
- File fisik dihapus bersamaan dengan data index (untuk .txt files).
- Metadata dihapus dari .metadata.json.

---

## POST /api/retrain

Retrain dokumen tertentu dengan model embedding terbaru.

### Request

```json
{
  "fileName": "dokumen.pdf"
}
```

### Response

**200 OK:**
```json
{
  "success": true,
  "message": "Retrain \"dokumen.pdf\" berhasil",
  "chunks": 24,
  "modelName": "./models/bge-m3-Q8_0.gguf"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Field 'fileName' wajib diisi."
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Dokumen \"dokumen.pdf\" tidak ditemukan."
}
```

### Flow

1. Cari dokumen by fileName di Vectra index.
2. Hapus data lama.
3. Jika URL source → fetch ulang. Jika file → baca dari disk.
4. Chunk, embed, save.
5. Update metadata.

---

## POST /api/retrain-all

Retrain semua dokumen sekaligus.

### Response

**200 OK:**
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

**409 Conflict:** (jika training sedang berjalan)

Warning: Endpoint ini menghapus semua data lama, lalu memproses ulang dari awal.

---

## GET /api/file/:fileName

Download/akses file dokumen.

### Response

- File binary dengan Content-Type sesuai extension.
- PDF → `application/pdf`
- TXT → `text/plain`
- MD → `text/markdown`
- Lainnya → `application/octet-stream`

**404:**
```json
{
  "success": false,
  "error": "File \"dokumen.pdf\" tidak ditemukan."
}
```

Edge Cases: File tanpa ekstensi → otomatis cari file .txt.

---

## GET /api/text/:fileName

Ambil konten teks dari database (untuk text input / URL fetch).

### Response

**200 OK:**
```json
{
  "success": true,
  "fileName": "CatatanSaya",
  "chunks": [
    { "chunkIndex": 0, "text": "Isi chunk pertama..." }
  ],
  "fullText": "Isi chunk pertama...",
  "totalChunks": 1
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Text \"CatatanSaya\" tidak ditemukan."
}
```

## 404 Handler (Unknown Endpoint)

```json
{
  "error": "Endpoint tidak ditemukan",
  "availableEndpoints": [
    "POST /training",
    "GET /get-list",
    "POST /search",
    "GET /health",
    "DELETE /reset",
    "POST /retrain",
    "POST /retrain-all"
  ]
}
```
