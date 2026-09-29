import { postgresPool } from "../services/database/postgres.js";
import { syncSharePointKnowledge } from "../services/rag/sharepoint-rag-sync.service.js";

const full = process.argv.includes("--full");

try {
  const result = await syncSharePointKnowledge({ full });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await postgresPool.end();
}
