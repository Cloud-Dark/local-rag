import { embedText } from './src/embedder.js';
import { searchKeyword } from './src/keywordSearch.js';
import { getIndex, searchSimilar } from './src/vectorStore.js';

const query = process.argv.slice(2).join(' ') || 'laptop hang';
const topK = 5;
const alpha = 0.7;

function normalize(results, scoreField) {
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

function fuse(vectorResults, keywordResults) {
  const vectorNorm = normalize(vectorResults, 'score');
  const keywordNorm = normalize(keywordResults, 'keywordScore');
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
    .map((result) => ({
      ...result,
      hybridScore: alpha * (vectorNorm.get(result.id) || 0) + (1 - alpha) * (keywordNorm.get(result.id) || 0),
    }))
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, topK);
}

function printResults(title, results, scoreField) {
  console.log(`\n${title}`);
  if (results.length === 0) {
    console.log('  Tidak ada hasil.');
    return;
  }

  results.forEach((r, i) => {
    console.log(`[${i + 1}] ${scoreField}: ${(r[scoreField] || 0).toFixed(4)}`);
    console.log(`    File: ${r.fileName}`);
    console.log(`    Text: ${(r.text || '').substring(0, 200).replace(/\n/g, ' ')}...\n`);
  });
}

console.log('🔍 Query:', query);
console.log('\n⏳ Searching...');

const queryVector = await embedText(query);
const index = await getIndex();
const items = await index.listItems();
const vectorResults = await searchSimilar(queryVector, topK * 3);
const keywordResults = searchKeyword(items, query, topK * 3);
const hybridResults = fuse(vectorResults, keywordResults);

printResults('Vector results', vectorResults.slice(0, topK), 'score');
printResults('Keyword/BM25 results', keywordResults.slice(0, topK), 'keywordScore');
printResults('Hybrid results', hybridResults, 'hybridScore');
