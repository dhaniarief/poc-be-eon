import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import { writeBusinessEvent } from "../../logging/operation-logger.js";
import {
  downloadProductKnowledgeFile,
  getProductKnowledgeDocumentByItemId,
  getProductKnowledgeSiteContext,
  readProductKnowledgeDelta,
  type ProductKnowledgeDocument,
} from "../microsoft/sharepoint/product-knowledge-rag.service.js";
import { GraphApiError } from "../microsoft/sharepoint/sharepoint-client.js";
import { chunkKnowledgeText } from "./chunker.js";
import { createEmbeddings } from "./embedding.service.js";
import { extractPdfText } from "./pdf-text-extractor.service.js";
import {
  deleteRagDocumentBySource,
  deleteRagDocumentsNotInSourceIds,
  disableRagDocument,
  findRagDocument,
  getRagSyncState,
  replaceRagDocumentChunks,
  saveRagSyncState,
  upsertRagDocument,
} from "./rag.repository.js";

export type ProductKnowledgeSyncResult = {
  mode: "full" | "delta";
  sourceKey: string;
  siteId: string;
  listId: string;
  totalChanges: number;
  indexed: number;
  unchanged: number;
  disabled: number;
  deleted: number;
  ignored: number;
  reconciledDeleted: number;
};

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPdf(document: ProductKnowledgeDocument) {
  if (document.fileName?.toLowerCase().endsWith(".pdf")) return true;
  return document.mimeType?.toLowerCase() === "application/pdf";
}

function buildSourceUrl(document: ProductKnowledgeDocument) {
  if (document.webUrl) return document.webUrl;

  if (document.fileRef?.startsWith("/")) {
    return new URL(
      document.fileRef,
      `https://${env.SHAREPOINT_PRODUCT_HOSTNAME}`,
    ).toString();
  }

  return null;
}

function metadataHeader(document: ProductKnowledgeDocument) {
  return [
    `Dokumen: ${document.title}`,
    document.category ? `Kategori: ${document.category}` : null,
    document.productName ? `Produk: ${document.productName}` : null,
    document.industryTypes.length > 0
      ? `Industri: ${document.industryTypes.join(", ")}`
      : null,
    document.applications.length > 0
      ? `Aplikasi: ${document.applications.join(", ")}`
      : null,
    document.equipment.length > 0
      ? `Equipment: ${document.equipment.join(", ")}`
      : null,
    "Sumber: SharePoint Product Knowledge",
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function buildDocumentText(
  document: ProductKnowledgeDocument,
  extractedText: string,
) {
  return normalizeText(
    `${metadataHeader(document)}\n\n${extractedText}`,
  );
}

function buildChunkText(
  document: ProductKnowledgeDocument,
  bodyChunk: string,
) {
  return `${metadataHeader(document)}\n\n${bodyChunk}`.trim();
}

function estimateTokenHint(content: string) {
  return Math.max(1, Math.ceil(content.length / 4));
}

async function indexDocument(document: ProductKnowledgeDocument) {
  const sourceKey = env.RAG_PRODUCT_SOURCE_KEY;

  if (!isPdf(document)) {
    const removed = await deleteRagDocumentBySource(sourceKey, document.id);
    return { status: "ignored" as const, removed };
  }

  const pdfBuffer = await downloadProductKnowledgeFile(document);
  const extractedText = normalizeText(await extractPdfText(pdfBuffer));
  const documentText = buildDocumentText(document, extractedText);
  const contentHash = documentText ? sha256(documentText) : null;

  // Current repository only exposes documents with status = active.
  // Product Knowledge has no Status column, so active is the correct
  // synthetic status for every successfully indexed library document.
  const searchable = extractedText.length >= 40;

  const existing = await findRagDocument(sourceKey, document.id);

  const stored = await upsertRagDocument({
    sourceKey,
    sourceItemId: document.id,
    sourceType: "sharepoint_document_library",
    title: document.title,
    fileName: document.fileName,
    docNumber: null,
    docType: document.category,
    process:
      document.industryTypes.length > 0
        ? document.industryTypes.join(", ")
        : null,
    status: "active",
    docVersion: null,
    effectiveFrom: null,
    validTo: null,
    reminderToUpdate: null,
    managerApprovalStatus: null,
    qaApprovalStatus: null,
    sourceUrl: buildSourceUrl(document),
    sourceEtag: document.eTag,
    sourceModifiedAt: document.modifiedAt,
    contentHash,
    contentText: documentText || null,
    isSearchable: searchable,
    metadata: {
      category: document.category,
      productName: document.productName,
      industryTypes: document.industryTypes,
      applications: document.applications,
      equipment: document.equipment,
      fileRef: document.fileRef,
      webUrl: document.webUrl,
      driveId: document.driveId,
      driveItemId: document.driveItemId,
      mimeType: document.mimeType,
      size: document.size,
      sourceSitePath: env.SHAREPOINT_PRODUCT_SITE_PATH,
      sourceLibrary: "Product Knowledge",
    },
  });

  if (!searchable || !contentHash) {
    await disableRagDocument(stored.id);

    writeBusinessEvent("warn", "RAG_PRODUCT_DOCUMENT_DISABLED", {
      sourceKey,
      itemId: document.id,
      fileName: document.fileName,
      reason: "PDF_TEXT_EMPTY_OR_TOO_SHORT",
      extractedChars: extractedText.length,
    });

    return { status: "disabled" as const };
  }

  const canReuseExistingChunks =
    existing?.indexedContentHash === contentHash &&
    existing?.embeddingModel === env.RAG_EMBEDDING_MODEL &&
    existing?.isSearchable === true;

  if (canReuseExistingChunks) {
    return { status: "unchanged" as const };
  }

  const bodyChunks = chunkKnowledgeText({
    text: extractedText,
    maxChars: env.RAG_CHUNK_SIZE_CHARS,
    overlapChars: env.RAG_CHUNK_OVERLAP_CHARS,
  });

  if (bodyChunks.length === 0) {
    await disableRagDocument(stored.id);
    return { status: "disabled" as const };
  }

  const chunkTexts = bodyChunks.map((chunk) =>
    buildChunkText(document, chunk),
  );

  const embeddings = await createEmbeddings(chunkTexts);

  await replaceRagDocumentChunks({
    documentId: stored.id,
    indexedContentHash: contentHash,
    embeddingModel: env.RAG_EMBEDDING_MODEL,
    chunks: chunkTexts.map((content, index) => ({
      chunkIndex: index,
      content,
      embedding: embeddings[index] ?? [],
      tokenHint: estimateTokenHint(content),
    })),
  });

  return { status: "indexed" as const };
}

async function runProductKnowledgeSyncAttempt(input: {
  forceFull: boolean;
  siteId: string;
  listId: string;
}) {
  const sourceKey = env.RAG_PRODUCT_SOURCE_KEY;
  const state = await getRagSyncState(sourceKey);
  const useDeltaLink = input.forceFull ? null : state?.deltaLink ?? null;

  const delta = await readProductKnowledgeDelta({
    siteId: input.siteId,
    listId: input.listId,
    deltaLink: useDeltaLink,
  });

  const result: ProductKnowledgeSyncResult = {
    mode: useDeltaLink ? "delta" : "full",
    sourceKey,
    siteId: input.siteId,
    listId: input.listId,
    totalChanges: delta.changes.length,
    indexed: 0,
    unchanged: 0,
    disabled: 0,
    deleted: 0,
    ignored: 0,
    reconciledDeleted: 0,
  };

  const currentIds = new Set<string>();

  for (const change of delta.changes) {
    if (change.deleted) {
      const removed = await deleteRagDocumentBySource(sourceKey, change.id);
      result.deleted += removed > 0 ? 1 : 0;
      continue;
    }

    currentIds.add(change.id);

    const document = await getProductKnowledgeDocumentByItemId({
      siteId: input.siteId,
      listId: input.listId,
      itemId: change.id,
    });

    const indexed = await indexDocument(document);

    switch (indexed.status) {
      case "indexed":
        result.indexed += 1;
        break;
      case "unchanged":
        result.unchanged += 1;
        break;
      case "disabled":
        result.disabled += 1;
        break;
      case "ignored":
        result.ignored += 1;
        break;
    }
  }

  if (!useDeltaLink) {
    result.reconciledDeleted = await deleteRagDocumentsNotInSourceIds(
      sourceKey,
      Array.from(currentIds),
    );
  }

  await saveRagSyncState({
    sourceKey,
    siteId: input.siteId,
    listId: input.listId,
    deltaLink: delta.deltaLink,
    status: "success",
    error: null,
  });

  return result;
}

export async function syncProductKnowledge(input?: { full?: boolean }) {
  const context = await getProductKnowledgeSiteContext();
  const sourceKey = env.RAG_PRODUCT_SOURCE_KEY;

  writeBusinessEvent("info", "RAG_PRODUCT_SYNC_START", {
    source: "sharepoint",
    sourceKey,
    full: Boolean(input?.full),
  });

  try {
    const result = await runProductKnowledgeSyncAttempt({
      forceFull: Boolean(input?.full),
      siteId: context.site.id,
      listId: context.listId,
    });

    writeBusinessEvent("info", "RAG_PRODUCT_SYNC_COMPLETE", result);
    return result;
  } catch (error) {
    if (!input?.full && error instanceof GraphApiError && error.status === 410) {
      writeBusinessEvent("warn", "RAG_PRODUCT_DELTA_RESET", {
        sourceKey,
        statusCode: error.status,
      });

      const result = await runProductKnowledgeSyncAttempt({
        forceFull: true,
        siteId: context.site.id,
        listId: context.listId,
      });

      writeBusinessEvent("info", "RAG_PRODUCT_SYNC_COMPLETE", result);
      return result;
    }

    const message = error instanceof Error ? error.message : String(error);

    await saveRagSyncState({
      sourceKey,
      siteId: context.site.id,
      listId: context.listId,
      deltaLink: (await getRagSyncState(sourceKey))?.deltaLink ?? null,
      status: "failed",
      error: message.slice(0, 2000),
    }).catch(() => undefined);

    writeBusinessEvent("error", "RAG_PRODUCT_SYNC_FAILED", {
      sourceKey,
      error: message,
    });

    throw error;
  }
}
