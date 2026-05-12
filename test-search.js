import { embedText } from './src/embedder.js';
import { searchSimilar } from './src/vectorStore.js';

const query = 'check hostname CMD ipconfig';
console.log('🔍 Query:', query);
console.log('\n⏳ Searching...\n');

const queryVector = await embedText(query);
const results = await searchSimilar(queryVector, 5);

results.forEach((r, i) => {
  console.log(`[${i + 1}] Score: ${(r.score * 100).toFixed(1)}%`);
  console.log(`    File: ${r.fileName}`);
  console.log(`    Text: ${r.text.substring(0, 200).replace(/\n/g, ' ')}...\n`);
});
