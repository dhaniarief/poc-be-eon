import { postgresPool } from "../services/database/postgres.js";
import { syncProductKnowledge } from "../services/rag/product-knowledge-rag-sync.service.js";

const full = process.argv.includes("--full");

try {
  const productKnowledge = await syncProductKnowledge({ full });
  console.log(JSON.stringify({ productKnowledge }, null, 2));
} finally {
  await postgresPool.end();
}
