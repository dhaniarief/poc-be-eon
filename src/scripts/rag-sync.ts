import { postgresPool } from "../services/database/postgres.js";
import { syncProductKnowledge } from "../services/rag/product-knowledge-rag-sync.service.js";
import { syncSharePointKnowledge } from "../services/rag/sharepoint-rag-sync.service.js";

const full = process.argv.includes("--full");

const sourceArg = process.argv
  .find((arg) => arg.startsWith("--source="))
  ?.slice("--source=".length)
  .trim()
  .toLowerCase();

try {
  if (sourceArg === "sop") {
    const result = await syncSharePointKnowledge({ full });
    console.log(JSON.stringify({ sop: result }, null, 2));
  } else if (sourceArg === "product") {
    const result = await syncProductKnowledge({ full });
    console.log(JSON.stringify({ productKnowledge: result }, null, 2));
  } else {
    const sop = await syncSharePointKnowledge({ full });
    const productKnowledge = await syncProductKnowledge({ full });

    console.log(
      JSON.stringify(
        {
          sop,
          productKnowledge,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await postgresPool.end();
}
