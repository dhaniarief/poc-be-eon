import { readFile } from "node:fs/promises";
import path from "node:path";

import { postgresPool } from "../services/database/postgres.js";

const sqlPath = path.join(
  process.cwd(),
  "db",
  "001_rag_sharepoint_array.sql",
);

const sql = await readFile(sqlPath, "utf8");

try {
  await postgresPool.query(sql);
  console.log(`RAG migration completed: ${sqlPath}`);
} finally {
  await postgresPool.end();
}
