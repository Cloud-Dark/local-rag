const DEFAULT_K1 = 1.2;
const DEFAULT_B = 0.75;

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1);
}

function buildTermFrequency(tokens) {
  const frequencies = new Map();

  for (const token of tokens) {
    frequencies.set(token, (frequencies.get(token) || 0) + 1);
  }

  return frequencies;
}

function toSearchResult(item, keywordScore) {
  const metadata = item.metadata || {};

  return {
    id: item.id,
    text: metadata.text || "",
    fileName: metadata.fileName,
    chunkIndex: metadata.chunkIndex,
    sourceUrl: metadata.sourceUrl || null,
    keywordScore,
  };
}

export function searchKeyword(items, query, topK, options = {}) {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  const documents = items
    .filter((item) => item?.metadata?.text)
    .map((item) => {
      const tokens = tokenize(item.metadata.text);
      return {
        item,
        length: tokens.length,
        frequencies: buildTermFrequency(tokens),
      };
    })
    .filter((doc) => doc.length > 0);

  if (documents.length === 0) return [];

  const documentFrequency = new Map();
  for (const doc of documents) {
    for (const token of new Set(doc.frequencies.keys())) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }

  const k1 = Number.isFinite(options.k1) ? options.k1 : DEFAULT_K1;
  const b = Number.isFinite(options.b) ? options.b : DEFAULT_B;
  const totalDocuments = documents.length;
  const averageLength = documents.reduce((sum, doc) => sum + doc.length, 0) / totalDocuments;

  return documents
    .map((doc) => {
      let keywordScore = 0;

      for (const token of queryTokens) {
        const termFrequency = doc.frequencies.get(token) || 0;
        if (termFrequency === 0) continue;

        const docsWithTerm = documentFrequency.get(token) || 0;
        const idf = Math.log(1 + (totalDocuments - docsWithTerm + 0.5) / (docsWithTerm + 0.5));
        const denominator = termFrequency + k1 * (1 - b + b * (doc.length / averageLength));
        keywordScore += idf * ((termFrequency * (k1 + 1)) / denominator);
      }

      return toSearchResult(doc.item, keywordScore);
    })
    .filter((result) => result.keywordScore > 0)
    .sort((a, b) => b.keywordScore - a.keywordScore)
    .slice(0, topK);
}
