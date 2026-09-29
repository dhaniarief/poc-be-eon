import { env } from "../../config/env.js";

type OpenAIEmbeddingResponse = {
  data?: Array<{
    index: number;
    embedding: number[];
  }>;
  model?: string;
  error?: {
    message?: string;
  };
};

function requireOpenAIKey() {
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY is required for RAG embeddings.");
  }

  return env.OPENAI_API_KEY.trim();
}

async function embedBatch(texts: string[]) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireOpenAIKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.RAG_EMBEDDING_MODEL,
      input: texts,
      encoding_format: "float",
    }),
  });

  const payload = (await response.json()) as OpenAIEmbeddingResponse;

  if (!response.ok) {
    throw new Error(
      `OpenAI embeddings failed (${response.status}): ${
        payload.error?.message ?? response.statusText
      }`,
    );
  }

  const ordered = [...(payload.data ?? [])].sort((a, b) => a.index - b.index);

  if (ordered.length !== texts.length) {
    throw new Error(
      `OpenAI embeddings returned ${ordered.length} vectors for ${texts.length} inputs.`,
    );
  }

  return ordered.map((item) => {
    if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
      throw new Error("OpenAI returned an empty embedding vector.");
    }

    return item.embedding.map(Number);
  });
}

export async function createEmbeddings(texts: string[]) {
  const normalized = texts.map((text) => text.trim()).filter(Boolean);
  if (normalized.length !== texts.length) {
    throw new Error("Embedding input cannot be empty.");
  }

  const result: number[][] = [];

  for (
    let start = 0;
    start < normalized.length;
    start += env.RAG_EMBED_BATCH_SIZE
  ) {
    const batch = normalized.slice(start, start + env.RAG_EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch);
    result.push(...vectors);
  }

  return result;
}

export async function createEmbedding(text: string) {
  const [embedding] = await createEmbeddings([text]);
  if (!embedding) throw new Error("Embedding generation returned no result.");
  return embedding;
}
