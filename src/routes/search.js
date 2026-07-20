import { Router } from "express";
import { CONFIG } from "../config.js";
import {
  performVectorSearch,
  performKeywordSearch,
  performHybridSearch,
  buildSearchResponse,
} from "../services/searchService.js";

const router = Router();

const SEARCH_TYPES = ["vector", "keyword", "hybrid"];
const DEFAULT_ALPHA = 0.7;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

// ═══════════════════════════════════════════════════════════
//  POST /search
//  Cari chunk paling mirip dengan query
//
//  Body:
//  {
//    "query": "apa itu machine learning?",
//    "topK": 3           ← opsional, default dari config
//  }
//
//  Response:
//  {
//    "query": "apa itu machine learning?",
//    "topK": 3,
//    "results": [
//      {
//        "rank": 1,
//        "score": 0.921,
//        "fileName": "intro-ml.pdf",
//        "fileUrl": "/api/file/intro-ml.pdf",
//        "sourceUrl": "https://...",
//        "chunkIndex": 4,
//        "text": "Machine learning adalah..."
//      }
//    ]
//  }
// ═══════════════════════════════════════════════════════════
router.post("/search", async (req, res) => {
  const { query, topK, minScore } = req.body;

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(400).json({
      success: false,
      error: "Field 'query' wajib diisi dan harus berupa string.",
    });
  }

  try {
    const k = parseInt(topK) || CONFIG.TOP_K;
    const searchType = SEARCH_TYPES.includes(req.body.searchType) ? req.body.searchType : "hybrid";
    const alpha = Number.isFinite(Number(req.body.alpha))
      ? clamp01(Number(req.body.alpha))
      : DEFAULT_ALPHA;
    const threshold = minScore !== undefined && minScore !== null && Number.isFinite(Number(minScore))
      ? clamp01(Number(minScore))
      : CONFIG.SEARCH_MIN_SCORE;

    let rawResults;
    let filteredResults;

    if (searchType === "vector") {
      rawResults = await performVectorSearch(query.trim(), k);
    } else if (searchType === "keyword") {
      rawResults = await performKeywordSearch(query.trim(), k);
    } else {
      const result = await performHybridSearch(query.trim(), k, alpha, threshold);
      rawResults = result.rawResults;
      filteredResults = result.filteredResults;
    }

    if (!filteredResults) {
      filteredResults = rawResults.filter((r) => r.score >= threshold);
    }

    const response = buildSearchResponse(rawResults, filteredResults, query, k, threshold, searchType, alpha);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
