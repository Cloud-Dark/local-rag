# Glossary — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

| Istilah | Definisi |
|---|---|
| **Alpha** | Bobot vector search dalam hybrid search. 0 = keyword penuh, 1 = vector penuh. Default 0.7. |
| **BM25** | Algoritma ranking keyword search yang menyempurnakan TF-IDF dengan saturasi term frequency dan normalisasi panjang dokumen. |
| **Chunk** | Potongan teks hasil pemecahan dokumen. Setiap chunk di-embed menjadi vector. |
| **Chunk Overlap** | Jumlah karakter yang tumpang tindih antar chunk berurutan, menjaga konteks di batas potongan. |
| **Chunk Size** | Ukuran maksimum chunk dalam karakter. Default 800. |
| **Chunking** | Proses memecah dokumen menjadi potongan-potongan kecil untuk embedding. |
| **Cosine Similarity** | Metrik kemiripan antara dua vector (0 = tidak mirip, 1 = identik). |
| **Embedding** | Proses mengubah teks menjadi vector (array angka) yang merepresentasikan makna semantik. |
| **GGUF** | Format file untuk menyimpan model AI (GGML Universal Format). Standar de facto untuk model lokal. |
| **Hybrid Search** | Teknik pencarian yang menggabungkan semantic search (vector) dan keyword search (BM25) dengan bobot alpha. |
| **IDF (Inverse Document Frequency)** | Ukuran seberapa jarang suatu term muncul di seluruh dokumen — term jarang mendapat bobot lebih tinggi. |
| **k1** | Parameter BM25 yang mengontrol saturasi term frequency. Default 1.2. |
| **Metadata** | Data tentang dokumen: fileName, createdDate, modelName, chunks, sourceUrl, lastRetrainedAt. |
| **Min-Max Normalization** | Normalisasi skor ke rentang [0,1] dengan rumus `(x - min) / (max - min)`. |
| **RAG (Retrieval-Augmented Generation)** | Teknik menggabungkan retrieval informasi dengan generation LLM. Project ini fokus pada bagian retrieval. |
| **Retrain** | Proses mengulang embedding dokumen dengan model yang mungkin berbeda. |
| **Semantic Search** | Pencarian berdasarkan makna/konteks, bukan kata persis. Menggunakan vector embedding. |
| **TF-IDF** | Algoritma klasik untuk mengukur relevansi term dalam dokumen. |
| **Vector** | Array angka floating point yang merepresentasikan makna semantik teks. |
| **Vector Store** | Database khusus untuk menyimpan dan mencari vector embedding. Project ini menggunakan Vectra. |
| **Vectra** | Library vector store berbasis JSON lokal untuk Node.js. |
