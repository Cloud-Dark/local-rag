import fs from "fs";
import XLSX from "xlsx";
import JSZip from "jszip";

export function parseExcel(workbook) {
  const parts = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (json.length === 0) continue;
    parts.push(`=== Sheet: ${sheetName} ===`);
    for (const row of json) {
      const cells = row.filter((c) => c !== "").join(" | ");
      if (cells) parts.push(cells);
    }
  }
  return parts.join("\n");
}

export async function parsePptx(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const parts = [];
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort();
  for (const [index, slideFile] of slideFiles.entries()) {
    const content = await zip.files[slideFile].async("string");
    const text = content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      parts.push(`[Slide ${index + 1}]`);
      parts.push(text);
    }
  }
  return parts.join("\n\n");
}
