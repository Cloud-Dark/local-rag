# Contribution Standard — RAG Lokal Node.js

> Status: Draft
> Terakhir diperbarui: 2026-07-20
> Pemilik: Cloud Dark

## Prinsip Dasar

1. **Local-first** — Semua fitur harus berjalan 100% lokal tanpa ketergantungan API eksternal.
2. **Sederhana** — Hindari over-engineering. Pilih solusi paling sederhana yang memenuhi kebutuhan.
3. **ES Modules** — Gunakan `import`/`export`, bukan `require`.
4. **Privasi** — Data pengguna tidak boleh dikirim ke server pihak ketiga.

## Panduan Kontribusi

### Branching

- `main` — branch stabil, siap production.
- Buat branch fitur dari `main` untuk pengembangan.

### Commit Messages

Gunakan semantic commit format:

```
feat: tambah fitur baru
fix: perbaiki bug
docs: update dokumentasi
refactor: refaktor kode
test: tambah test
chore: tugas maintenance
```

### Code Style

- JavaScript dengan ES Modules (`import`/`export`).
- Gunakan `const` dan `let`, hindari `var`.
- Nama fungsi: camelCase.
- Nama file: camelCase.js.
- Nama class: PascalCase (jika ada).
- Error messages: Bahasa Indonesia (project ini).
- Console logs: gunakan emoji prefix untuk visual separation.

### Struktur File

```
src/
├── config.js       ← Konfigurasi
├── server.js       ← Entry point
├── loader.js       ← Parser & chunking
├── embedder.js     ← Embedding
├── vectorStore.js  ← Vector store
├── keywordSearch.js ← BM25 search
├── ingest.js       ← CLI ingest
└── search.js       ← CLI search
```

### Dependency

- Hindari menambah dependency jika bisa ditangani dengan built-in Node.js.
- Library baru harus dijustifikasi dan disetujui.
- Jaga `package.json` tetap minimal.

### Dokumentasi

- Setiap fungsi utama harus memiliki JSDoc comment.
- Update docs/ jika menambah fitur baru.
- Update CHANGELOG.md untuk setiap perubahan signifikan.

### Testing

- Test manual via curl dan web UI.
- Pastikan tidak ada error di console log server.

### Pull Request

1. Deskripsikan perubahan dengan jelas.
2. Sertakan screenshot/gif untuk perubahan UI.
3. Pastikan update dokumentasi jika diperlukan.
4. Link ke issue terkait (jika ada).
