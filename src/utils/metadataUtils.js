import fs from "fs";
import path from "path";
import { CONFIG } from "../config.js";

export const METADATA_FILE = path.join(CONFIG.DOCUMENTS_DIR, '.metadata.json');

export async function loadMetadata() {
  try {
    if (await fs.promises.access(METADATA_FILE).then(() => true).catch(() => false)) {
      const data = await fs.promises.readFile(METADATA_FILE, 'utf-8');
      const metadata = JSON.parse(data);
      console.log(`📦 Metadata loaded: ${Object.keys(metadata).length} documents`);
      return metadata;
    }
  } catch (err) {
    console.error('⚠️  Failed to load metadata:', err.message);
  }
  return {};
}

export async function saveMetadata(metadata) {
  try {
    await fs.promises.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`💾 Metadata saved: ${Object.keys(metadata).length} documents`);
  } catch (err) {
    console.error('⚠️  Failed to save metadata:', err.message);
  }
}

export async function updateDocumentMetadata(metadata, displayName, data, isRetrain) {
  const now = new Date().toISOString();
  const existing = metadata[displayName] || {};
  metadata[displayName] = {
    createdDate: isRetrain ? (existing.createdDate || now) : now,
    lastRetrainedAt: now,
    modelName: CONFIG.EMBEDDING_MODEL_PATH,
    chunks: data.chunks,
    sourceUrl: data.sourceUrl || null,
    isUrl: data.isUrl || false,
    ...(data.filePath ? { filePath: data.filePath } : {}),
  };
  await saveMetadata(metadata);
}
