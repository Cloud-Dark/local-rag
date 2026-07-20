import { embedText } from "../embedder.js";
import { searchSimilar, getIndex } from "../vectorStore.js";
import { searchKeyword } from "../keywordSearch.js";
import { getDocumentMetadata } from "./documentService.js";

export function normalizeScores(results, scoreField) {
  const scores = results.map((result) => result[scoreField] || 0);
  const max = Math.max(...scores, 0);
  const min = Math.min(...scores, 0);

  if (max === min) {
    return new Map(results.map((result) => [result.id, max > 0 ? 1 : 0]));
  }

  return new Map(results.map((result) => [
    result.id,
    ((result[scoreField] || 0) - min) / (max - min),
  ]));
}

export function fuseSearchResults(vectorResults, keywordResults, alpha, topK) {
  const vectorNorm = normalizeScores(vectorResults, "score");
  const keywordNorm = normalizeScores(keywordResults, "keywordScore");
  const byId = new Map();

  for (const result of vectorResults) {
    byId.set(result.id, {
      ...result,
      vectorScore: result.score,
      keywordScore: 0,
    });
  }

  for (const result of keywordResults) {
    const existing = byId.get(result.id) || result;
    byId.set(result.id, {
      ...existing,
      ...result,
      vectorScore: existing.vectorScore || existing.score || 0,
      keywordScore: result.keywordScore,
    });
  }

  return [...byId.values()]
    .map((result) => {
      const hybridScore = alpha * (vectorNorm.get(result.id) || 0) + (1 - alpha) * (keywordNorm.get(result.id) || 0);
      return {
        ...result,
        hybridScore,
        score: hybridScore,
      };
    })
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK);
}

export function formatScore(value) {
  return parseFloat((value || 0).toFixed(4));
}

export async function performVectorSearch(query, k) {
  const queryVector = await embedText(query);
  return searchSimilar(queryVector, k);
}

export async function performKeywordSearch(query, k) {
  const index = await getIndex();
  const items = await index.listItems();
  return searchKeyword(items, query, k).map((result) => ({
    ...result,
    score: result.keywordScore,
  }));
}

const CANDIDATE_MULTIPLIER = 3;

export async function performHybridSearch(query, k, alpha, threshold) {
  const candidateK = k * CANDIDATE_MULTIPLIER;
  const queryVector = await embedText(query);
  const [vectorResults, items] = await Promise.all([
    searchSimilar(queryVector, candidateK),
    getIndex().then((index) => index.listItems()),
  ]);
  const keywordResults = searchKeyword(items, query, candidateK);
  let rawResults = fuseSearchResults(vectorResults, keywordResults, alpha, k);

  // Apply threshold filter
  const filteredResults = rawResults.filter((r) => r.score >= threshold);
  return { rawResults, filteredResults };
}

export function buildSearchResponse(rawResults, filteredResults, query, k, threshold, searchType, alpha) {
  const bestScore = rawResults.length > 0 ? rawResults[0].score : null;
  const metadata = getDocumentMetadata();

  return {
    query: query.trim(),
    topK: k,
    minScore: threshold,
    searchType,
    alpha: searchType === "hybrid" ? alpha : undefined,
    bestScore: bestScore === null ? null : formatScore(bestScore),
    matched: filteredResults.length > 0,
    filteredOut: rawResults.length - filteredResults.length,
    results: filteredResults.map((r, i) => {
      const docMeta = metadata[r.fileName];
      let allSourceUrls = docMeta?.sourceUrl || r.sourceUrl || null;

      if (allSourceUrls && !Array.isArray(allSourceUrls)) {
        allSourceUrls = [allSourceUrls];
      }

      const fileUrl = allSourceUrls && allSourceUrls.length > 0
        ? allSourceUrls[0]
        : `/api/file/${encodeURIComponent(r.fileName)}`;

      return {
        rank: i + 1,
        score: formatScore(r.score),
        vectorScore: r.vectorScore !== undefined ? formatScore(r.vectorScore) : undefined,
        keywordScore: r.keywordScore !== undefined ? formatScore(r.keywordScore) : undefined,
        hybridScore: r.hybridScore !== undefined ? formatScore(r.hybridScore) : undefined,
        fileName: r.fileName,
        fileUrl: fileUrl,
        sourceUrl: allSourceUrls || null,
        chunkIndex: r.chunkIndex,
        text: r.text,
      };
    }),
  };
}
