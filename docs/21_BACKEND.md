# Backend Module Documentation — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Module Overview

```
src/
├── config.js          ← Configuration loader (dotenv)
├── server.js          ← Express API server (entry point)
├── embedder.js        ← GGUF embedding via node-llama-cpp
├── vectorStore.js     ← Vectra wrapper (CRUD)
├── loader.js          ← Document parsing & chunking
├── ingest.js          ← CLI batch indexing
├── search.js          ← CLI semantic search
└── keywordSearch.js   ← BM25 algorithm
```

---

## config.js

**Path:** `src/config.js`
**Fungsi:** Load konfigurasi dari environment variables dengan fallback default.

**Exports:**
- `CONFIG` — Object konfigurasi: EMBEDDING_MODEL_PATH, EMBEDDING_CONTEXT_SIZE, CHUNK_SIZE, CHUNK_OVERLAP, TOP_K, SEARCH_MIN_SCORE, DOCUMENTS_DIR, DB_PATH.

**Detail:**
- Menggunakan `dotenv/config` untuk load file .env.
- `numberFromEnv()` helper: parse number dari env var, return fallback jika NaN.
- Semua config path relatif terhadap working directory.

---

## server.js

**Path:** `src/server.js`
**Fungsi:** Entry point utama. REST API server menggunakan Express.

**Endpoints:**

| Method | Path | Handler | Deskripsi |
|---|---|---|---|
| POST | /api/training | upload.array("files") + handler | Upload file/URL/text untuk di-index |
| GET | /api/get-list | async handler | Daftar dokumen + metadata |
| POST | /api/search | async handler | Semantic/keyword/hybrid search |
| GET | /api/health | async handler | Status server dan DB |
| DELETE | /api/reset | async handler | Hapus data (all atau specific file) |
| POST | /api/retrain | async handler | Retrain satu dokumen |
| POST | /api/retrain-all | async handler | Retrain semua dokumen |
| GET | /api/file/:fileName | async handler | Download file |
| GET | /api/text/:fileName | async handler | Lihat konten teks |
| GET | /api/api-docs | swagger-ui | Swagger UI interaktif |

**Static Routes:**
- `/ui` — redirect ke index.html
- `/` — redirect ke /ui
- `public/` — serve static files

**Key Internal State:**
- `trainingStatus` — { isRunning, lastRun, lastResult } untuk mencegah concurrent training.
- `documentMetadata` — in-memory cache dari `.metadata.json`.

**Internal Functions:**

| Function | Deskripsi |
|---|---|
| `processFile(filePath, fileName, customName, sourceUrl, isRetrain)` | Parse file, chunk, embed, save ke Vectra |
| `processUrl(url, customName, isRetrain)` | Fetch URL, HTML→text, chunk, embed, save |
| `processText(text, customName, sourceUrl, isRetrain)` | Text langsung, simpan sebagai .txt, chunk, embed, save |
| `fetchUrlContent(url)` | HTTP fetch + HTML→text conversion |
| `normalizeScores(results, scoreField)` | Min-max normalization |
| `fuseSearchResults(vectorResults, keywordResults, alpha, topK)` | Hybrid fusion |
| `formatScore(value)` | Float rounding ke 4 desimal |
| `findAvailablePort(startPort)` | Auto-find port yang available |
| `loadMetadata()` / `saveMetadata()` | Load/save .metadata.json |

**File Upload:**
- Multer disk storage ke CONFIG.DOCUMENTS_DIR.
- unique filename dengan timestamp suffix.
- Allowed extensions: .pdf, .txt, .md, .docx, .xlsx, .xls, .pptx, .csv.
- Filter file by extension.

---

## embedder.js

**Path:** `src/embedder.js`
**Fungsi:** Load dan inference model embedding GGUF menggunakan node-llama-cpp.

**Exports:**

| Function | Parameters | Return | Deskripsi |
|---|---|---|---|
| `initEmbedder()` | none | EmbeddingContext | Init model (singleton), load dari disk |
| `embedText(text)` | text: string | number[] | Embed satu teks → vector |
| `embedBatch(texts, onProgress)` | texts: string[], onProgress: function | number[][] | Embed batch dengan callback progress |
| `disposeEmbedder()` | none | void | Cleanup context |

**Detail:**
- Singleton pattern — model di-load sekali.
- `getLlama()` → `model.loadModel()` → `model.createEmbeddingContext()`.
- `CONFIG.EMBEDDING_CONTEXT_SIZE` sebagai contextSize.
- Throws error jika model file tidak ditemukan.
- Vector output: `Array.from(result.vector)` — array of floats.

---

## vectorStore.js

**Path:** `src/vectorStore.js`
**Fungsi:** Wrapper untuk Vectra LocalIndex.

**Exports:**

| Function | Parameters | Return | Deskripsi |
|---|---|---|---|
| `getIndex()` | none | LocalIndex | Dapatkan/index Vectra (singleton) |
| `upsertChunk(chunk, vector, sourceUrl)` | chunk: object, vector: number[], sourceUrl: string|null | void | Simpan chunk + vector |
| `searchSimilar(queryVector, topK)` | queryVector: number[], topK: number | Result[] | Cari chunks paling mirip |
| `getStats()` | none | { totalChunks, dbPath } | Statistik index |
| `clearIndex()` | none | void | Hapus & buat ulang index |

**Detail:**
- LocalIndex dari Vectra library.
- Path index: CONFIG.DB_PATH (default `./db/vectra`).
- Chunk metadata: text, fileName, chunkIndex, charStart, charEnd, sourceUrl.
- searchSimilar mengembalikan array of { id, text, fileName, chunkIndex, sourceUrl, score }.

---

## loader.js

**Path:** `src/loader.js`
**Fungsi:** Load dokumen dari disk, ekstrak teks, dan pecah menjadi chunks.

**Exports:**

| Function | Parameters | Return | Deskripsi |
|---|---|---|---|
| `loadDocuments(dir)` | dir: string | { fileName, filePath, text }[] | Baca semua file di folder |
| `chunkText(text, fileName, options)` | text, fileName, options | Chunk[] | Pecah teks menjadi chunks |
| `loadAndChunkAll(dir, options)` | dir, options | Chunk[] | Load + chunk semua dokumen |

**Supported Formats:**

| Extension | Parser | Method |
|---|---|---|
| .pdf | pdf-parse | `pdfParse(buffer)` |
| .txt, .md | fs | `readFileSync(filePath, "utf-8")` |
| .docx | mammoth | `extractRawText({ buffer })` |
| .xlsx, .xls | xlsx (SheetJS) | `readFile()` + `sheet_to_json` |
| .csv | xlsx | `read(raw, { type: "string" })` |
| .pptx | jszip | `loadAsync(buffer)` + XML parsing |

**Chunking Modes:**

1. **Q&A CSV Mode** — jika format CSV dengan kolom "question" dan "answer", buat chunk per baris: `Pertanyaan: ...\nJawaban: ...`.

2. **Auto Mode (default)** — paragraph-aware:
   - Split by `\n\n` (paragraphs).
   - Gabung paragraf sampai mendekati CHUNK_SIZE.
   - Jika satu paragraf > CHUNK_SIZE, split by sentence.
   - Overlap dari chunk sebelumnya.

3. **Fixed Mode** — character-based:
   - Sliding window dengan ukuran CHUNK_SIZE.
   - Overlap CHUNK_OVERLAP antar chunk.
   - Whitespace di-collapse.

**Chunk ID Format:**
```
{fileName}::chunk_{index}
```

**Chunk Metadata:**
```javascript
{
  id: "file.pdf::chunk_0",
  text: "content...",
  metadata: {
    fileName: "file.pdf",
    chunkIndex: 0,
    charStart: 0,
    charEnd: 800
  }
}
```

**Helper Functions (internal):**
- `parseExcel(workbook)` — extract all sheets → pipe-separated text.
- `parsePptx(filePath)` — extract text from PPTX XML slides.
- `chunkQuestionAnswerCsv(text, fileName)` — detect Q&A CSV → per-row chunks.
- `parseCsv(text)` — manual CSV parser (handle quotes).
- `splitBySentences(text)` — split by . ! ? dengan exception.
- `chunkTextFixed(text, fileName, CHUNK_SIZE, CHUNK_OVERLAP)` — fixed-size mode.

---

## keywordSearch.js

**Path:** `src/keywordSearch.js`
**Fungsi:** BM25 keyword search engine.

**Exports:**

| Function | Parameters | Return | Deskripsi |
|---|---|---|---|
| `tokenize(text)` | text: string | string[] | Tokenisasi teks |
| `searchKeyword(items, query, topK, options)` | items, query, topK, options | Result[] | BM25 search |

**Tokenization:**
- Case folding (lowercase).
- NFKD normalization + diacritical mark removal.
- Split by non-letter/non-number characters.
- Filter tokens length > 1.

**BM25 Parameters:**
- `k1`: 1.2 (configurable via options.k1).
- `b`: 0.75 (configurable via options.b).

**BM25 Formula:**
```
IDF = ln(1 + (N - n + 0.5) / (n + 0.5))
score = IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / avgDocLen))
```

**Detail:**
- Query di-tokenize dan di-unique.
- Document frequency dihitung dari seluruh items.
- Average document length untuk normalisasi.
- Result: { id, text, fileName, chunkIndex, sourceUrl, keywordScore }.

---

## ingest.js

**Path:** `src/ingest.js`
**Fungsi:** CLI script untuk batch indexing dokumen.

**Usage:**
```bash
npm run ingest          # Index semua dokumen
npm run ingest:reset    # Reset index dulu, lalu index
```

**Flow:**
1. (Optional) Reset index jika `--reset` flag ada.
2. `loadAndChunkAll()` — baca semua file di documents/.
3. Loop chunks: embedText() → upsertChunk().
4. Tampilkan statistik.

---

## search.js

**Path:** `src/search.js`
**Fungsi:** CLI semantic search dengan interactive dan pipe mode.

**Exports:**
- `semanticSearch(query, topK)` — fungsi search yang bisa di-import.

**Usage:**
```bash
npm run search              # Interactive mode
echo "query" | node src/search.js   # Pipe mode
```

**Interactive Mode:**
- Loop query → output JSON + ringkasan ke stderr.
- `"exit"` untuk keluar.

**Pipe Mode:**
- Baca stdin sampai EOF.
- Satu query JSON ke stdout.

**semanticSearch Function:**
- `embedText(query)` → `searchSimilar(queryVector, topK)` → filter by SEARCH_MIN_SCORE → format.
