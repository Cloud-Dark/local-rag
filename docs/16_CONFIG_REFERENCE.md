# Configuration Reference — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Environment Variables

Semua konfigurasi diatur melalui file `.env` di root project. Dibaca menggunakan `dotenv` di `src/config.js`.

| Variable | Tipe | Default | Deskripsi |
|---|---|---|---|
| `EMBEDDING_MODEL_PATH` | String | `./models/bge-m3-Q8_0.gguf` | Path absolut/relatif ke file model GGUF embedding |
| `EMBEDDING_CONTEXT_SIZE` | Number | `8192` | Context window model embedding dalam token |
| `CHUNK_SIZE` | Number | `800` | Ukuran maksimum chunk dalam karakter |
| `CHUNK_OVERLAP` | Number | `100` | Jumlah karakter overlap antar chunk |
| `TOP_K` | Number | `5` | Jumlah hasil search default |
| `SEARCH_MIN_SCORE` | Number (0-1) | `0.7` | Threshold minimum similarity score |
| `DOCUMENTS_DIR` | String | `./documents` | Folder penyimpanan dokumen upload |
| `DB_PATH` | String | `./db/vectra` | Path vector database Vectra |
| `PORT` | Number | `3000` | Port server (opsional, fallback auto-find) |

## Source: src/config.js

```javascript
import "dotenv/config";

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const CONFIG = {
  EMBEDDING_MODEL_PATH: process.env.EMBEDDING_MODEL_PATH || "./models/bge-m3-Q8_0.gguf",
  EMBEDDING_CONTEXT_SIZE: numberFromEnv("EMBEDDING_CONTEXT_SIZE", 8192),
  CHUNK_SIZE: numberFromEnv("CHUNK_SIZE", 800),
  CHUNK_OVERLAP: numberFromEnv("CHUNK_OVERLAP", 100),
  TOP_K: numberFromEnv("TOP_K", 5),
  SEARCH_MIN_SCORE: numberFromEnv("SEARCH_MIN_SCORE", 0.7),
  DOCUMENTS_DIR: process.env.DOCUMENTS_DIR || "./documents",
  DB_PATH: process.env.DB_PATH || "./db/vectra",
};
```

## Default .env

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

## Catatan Konfigurasi

1. `EMBEDDING_MODEL_PATH`: Path relatif dihitung dari working directory (root project). Pastikan file .gguf ada.
2. `EMBEDDING_CONTEXT_SIZE`: Jika melebihi kemampuan model, sebagian input akan terpotong. Sesuaikan dengan spesifikasi model.
3. `CHUNK_SIZE` dan `CHUNK_OVERLAP`: Hanya untuk fixed-size mode. Auto mode bersifat dinamis.
4. `SEARCH_MIN_SCORE`: Hasil di bawah threshold ini tidak dikembalikan. Set 0 untuk menonaktifkan filtering.
5. `PORT`: Jika port tidak tersedia, server auto-find port berikutnya (3001, 3002, ...).
