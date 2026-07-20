# Database Structure — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Vectra Index (Vector Store)

### Lokasi

`db/vectra/` (dapat dikonfigurasi via `DB_PATH` di .env).

### File

```
db/vectra/
└── index.json    ← File JSON tunggal berisi semua metadata dan vectors
```

### Struktur Internal Vectra

Vectra menyimpan data dalam format JSON dengan struktur:

```json
{
  "version": 1,
  "items": [
    {
      "id": "nama_file.pdf::chunk_0",
      "vector": [0.123, -0.456, ...],
      "metadata": {
        "text": "Isi chunk...",
        "fileName": "nama_file.pdf",
        "chunkIndex": 0,
        "charStart": 0,
        "charEnd": 800,
        "sourceUrl": "https://example.com/source"
      }
    }
  ]
}
```

### Operation yang Didukung

| Method | Deskripsi | Source |
|---|---|---|
| `createIndex()` | Buat index baru | vectorStore.js |
| `upsertItem({ id, vector, metadata })` | Tambah/update item | vectorStore.js |
| `queryItems(vector, topK)` | Cari items paling mirip | vectorStore.js |
| `deleteItem(id)` | Hapus item by ID | server.js |
| `deleteIndex()` | Hapus seluruh index | vectorStore.js |
| `listItems()` | List semua items | vectorStore.js |

### Metadata per Item (Chunk)

| Field | Tipe | Deskripsi |
|---|---|---|
| `text` | String | Teks chunk |
| `fileName` | String | Nama/tampilan dokumen sumber |
| `chunkIndex` | Number | Index chunk (0-based) |
| `charStart` | Number | Posisi karakter start di dokumen asli |
| `charEnd` | Number | Posisi karakter end di dokumen asli |
| `sourceUrl` | String|null | URL sumber (untuk URL fetch) |

## Document Metadata File

### Lokasi

`documents/.metadata.json`.

### Struktur

```json
{
  "dokumen.pdf": {
    "createdDate": "2024-01-01T00:00:00.000Z",
    "lastRetrainedAt": "2024-01-02T00:00:00.000Z",
    "modelName": "./models/bge-m3-Q8_0.gguf",
    "chunks": 24,
    "sourceUrl": "https://example.com/doc",
    "isUrl": false,
    "filePath": "D:\\project\\local-rag\\documents\\dokumen.pdf"
  },
  "example.com": {
    "createdDate": "2024-01-01T00:00:00.000Z",
    "lastRetrainedAt": "2024-01-01T00:00:00.000Z",
    "modelName": "./models/bge-m3-Q8_0.gguf",
    "chunks": 8,
    "sourceUrl": "https://example.com/article",
    "isUrl": true
  }
}
```

### Fields

| Field | Tipe | Deskripsi |
|---|---|---|
| `createdDate` | String (ISO 8601) | Tanggal pertama kali di-training |
| `lastRetrainedAt` | String (ISO 8601)\|null | Tanggal terakhir di-retrain |
| `modelName` | String | Path model embedding yang digunakan |
| `chunks` | Number | Jumlah chunk yang dihasilkan |
| `sourceUrl` | String\|String[]\|null | URL sumber (array untuk multiple URLs) |
| `isUrl` | Boolean | Apakah dari URL fetch |
| `filePath` | String\|null | Path file fisik di disk (null untuk URL) |

### Lifecycle

- **Load**: Dibaca di `server.js` saat startup (`loadMetadata()`).
- **Save**: Ditulis setiap kali proses file/URL/text selesai (`saveMetadata()`).
- **Delete**: Metadata dihapus saat DELETE /api/reset dengan fileName.
- **Update**: Field `lastRetrainedAt` dan `modelName` di-update saat retrain.
