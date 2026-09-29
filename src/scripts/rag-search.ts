import { postgresPool } from "../services/database/postgres.js";
import { searchKnowledge } from "../services/rag/knowledge-search.service.js";

const query = process.argv.slice(2).join(" ").trim();

if (!query) {
  console.error('Usage: npm run rag:search -- "pertanyaan SOP/IK"');
  process.exitCode = 1;
} else {
  try {
    const result = await searchKnowledge({ query });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await postgresPool.end();
  }
}
