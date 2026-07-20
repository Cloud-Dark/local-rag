# Architecture — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Diagram Komponen

```mermaid
graph TB
    subgraph User["User Layer"]
        UI["Web UI<br/>(Vanilla HTML/JS)"]
        CLI["CLI Tools<br/>(ingest / search)"]
        API_Client["API Client<br/>(curl / apps)"]
    end

    subgraph Server["Server Layer"]
        EXPRESS["Express Server<br/>src/server.js"]
        MULTER["Multer<br/>File Upload"]
        SWAGGER["Swagger UI<br/>OpenAPI 3.0"]
        STATIC["Static Files<br/>public/"]
    end

    subgraph Core["Core Engine"]
        LOADER["Loader<br/>src/loader.js"]
        EMBEDDER["Embedder<br/>src/embedder.js"]
        VECTOR["Vector Store<br/>src/vectorStore.js"]
        KEYWORD["Keyword Search<br/>src/keywordSearch.js"]
    end

    subgraph Storage["Storage Layer"]
        DOCUMENTS["documents/<br/>(PDF, DOCX, etc)"]
        VECTRA["Vectra Index<br/>db/vectra/"]
        METADATA["Metadata<br/>documents/.metadata.json"]
        MODELS["models/<br/>(GGUF file)"]
    end

    subgraph Parsers["Document Parsers"]
        PDF["pdf-parse"]
        MAMMOTH["mammoth (DOCX)"]
        XLSX["xlsx (XLSX/XLS/CSV)"]
        JSZIP["jszip (PPTX)"]
    end

    UI --> EXPRESS
    CLI -->|"process.argv"| LOADER
    CLI -->|"stdin"| EMBEDDER
    API_Client --> EXPRESS
    EXPRESS --> MULTER
    EXPRESS --> SWAGGER
    EXPRESS --> STATIC

    MULTER --> DOCUMENTS
    EXPRESS --> LOADER
    EXPRESS --> EMBEDDER
    EXPRESS --> VECTOR
    EXPRESS --> KEYWORD

    LOADER --> PDF
    LOADER --> MAMMOTH
    LOADER --> XLSX
    LOADER --> JSZIP
    LOADER --> DOCUMENTS

    EMBEDDER --> MODELS
    VECTOR --> VECTRA
    VECTOR --> METADATA
    
    KEYWORD --> VECTRA
```

## Alur Data — Upload & Indexing

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant Loader
    participant Embedder
    participant VectorStore

    User->>Server: POST /api/training (file/URL/text)
    Server->>Server: Multer save file to documents/
    Server->>Loader: processFile(filePath, fileName)
    Loader->>Loader: Detect extension
    Loader->>PDF: Parse PDF
    Loader->>MAMMOTH: Parse DOCX
    Loader->>XLSX: Parse XLSX/XLS/CSV
    Loader->>JSZIP: Parse PPTX
    Loader->>Loader: chunkText() — smart/fixed mode
    Loader-->>Server: chunks[]
    loop For each chunk
        Server->>Embedder: embedText(chunk.text)
        Embedder->>MODELS: node-llama-cpp inference
        MODELS-->>Embedder: vector[]
        Embedder-->>Server: vector[]
        Server->>VectorStore: upsertChunk(chunk, vector)
        VectorStore->>VECTRA: Save to Vectra index
    end
    Server->>VectorStore: Update metadata
    VectorStore-->>Server: metadata saved
    Server-->>User: Response JSON
```

## Alur Data — Search

```mermaid
sequenceDiagram
    participant User
    participant Server
    participant Embedder
    participant VectorStore
    participant KeywordSearch

    User->>Server: POST /api/search (query, searchType, alpha)
    Server->>Server: Parse searchType
    
    alt searchType = "vector"
        Server->>Embedder: embedText(query)
        Embedder-->>Server: queryVector
        Server->>VectorStore: searchSimilar(queryVector, k)
        VectorStore-->>Server: vectorResults
    else searchType = "keyword"
        Server->>VectorStore: getIndex().listItems()
        VectorStore-->>Server: allItems
        Server->>KeywordSearch: searchKeyword(items, query, k)
        KeywordSearch-->>Server: keywordResults
    else searchType = "hybrid" (default)
        Server->>Embedder: embedText(query)
        Embedder-->>Server: queryVector
        Server->>VectorStore: searchSimilar(queryVector, candidateK)
        VectorStore-->>Server: vectorResults
        Server->>VectorStore: getIndex().listItems()
        VectorStore-->>Server: allItems
        Server->>KeywordSearch: searchKeyword(items, query, candidateK)
        KeywordSearch-->>Server: keywordResults
        Server->>Server: fuseSearchResults(vector, keyword, alpha, k)
    end
    
    Server->>Server: Filter by minScore threshold
    Server->>Server: Format results with scores
    Server-->>User: Response JSON
```

## Alur Data — Chunking

```mermaid
flowchart LR
    A["Raw Text"] --> B{Detect CSV<br/>QA Format?}
    B -->|"Yes"| C["Chunk per Q&A Row"]
    B -->|"No"| D{Chunk Mode}
    D -->|"Auto (default)"| E["Split by paragraphs<br/>Respect sentence boundaries"]
    D -->|"Fixed"| F["Split by character count<br/>With overlap"]
    E --> G[Chunks with metadata]
    F --> G
    C --> G
```

## Format Dokumen: Pipeline Parsing

| Format | Parser | Ekstraksi | Keterangan |
|---|---|---|---|
| PDF | `pdf-parse` | Full text per halaman | Buffer-based |
| DOCX | `mammoth` | Paragraf via extractRawText | Buffer-based |
| XLSX/XLS | `xlsx` (SheetJS) | Semua sheet, baris jadi pipe-separated | readFile |
| CSV | `xlsx` | Sama seperti Excel | read(string) |
| PPTX | `jszip` | XML tiap slide, extract text | Buffer-based |
| TXT/MD | fs.readFileSync | UTF-8 langsung | File-based |

## Hybrid Search: Fusion Algorithm

```mermaid
flowchart LR
    A["Vector Results"] --> B["Min-Max Normalize"]
    C["Keyword Results"] --> D["Min-Max Normalize"]
    B --> E["Fusion: alpha * norm_vec + (1-alpha) * norm_kw"]
    D --> E
    E --> F["Sort by hybridScore desc"]
    F --> G["TopK results"]
```

Parameter default: alpha = 0.7, candidateK = max(k * 3, k), normalization = min-max.

## Struktur File

```
D:\project\local-rag\
├── .env                       ← Environment config
├── .gitignore
├── package.json
├── swagger.yaml               ← OpenAPI 3.0 spec
├── README.md
├── agent.md
├── test-search.js             ← Hybrid search test
│
├── documents/                 ← Upload & storage
│   └── .metadata.json         ← Document metadata (auto)
├── models/                    ← GGUF model files
│   └── *.gguf
├── db/vectra/                 ← Vectra index (auto)
│   └── index.json
│
├── public/
│   └── index.html             ← Web UI SPA
│
└── src/
    ├── config.js              ← Config from env
    ├── server.js              ← Express API entry point
    ├── loader.js              ← Parsing & chunking
    ├── embedder.js            ← GGUF embedding
    ├── vectorStore.js         ← Vectra wrapper
    ├── ingest.js              ← CLI batch indexing
    ├── search.js              ← CLI semantic search
    └── keywordSearch.js       ← BM25 algorithm
```

## Keputusan Arsitektur Kunci

1. **node-llama-cpp** untuk embedding lokal — zero API call, privasi penuh.
2. **Vectra** sebagai vector store — JSON-based, zero infrastructure.
3. **Hybrid search** sebagai default — kombinasi semantic + keyword.
4. **Smart chunking** — paragraph-aware, bukan fixed-size saja.
5. **Metadata JSON** — lightweight persistence tanpa DB terpisah.
6. **ES Modules** — `"type": "module"`, import/export syntax modern.

Lihat [11_DECISIONS.md](11_DECISIONS.md) untuk ADR detail.
