import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import { writeBusinessEvent } from "../../logging/operation-logger.js";
import { GraphApiError } from "../microsoft/sharepoint/sharepoint-client.js";
import {
  getSopIkPageByItemId,
  getSopIkSiteContext,
  readSopIkDelta,
  type SopIkPage,
} from "../microsoft/sharepoint/sop-ik-rag.service.js";
import { chunkKnowledgeText } from "./chunker.js";
import {
  buildKnowledgeDocumentText,
  cleanSharePointCanvasContent,
} from "./content-cleaner.js";
import { createEmbeddings } from "./embedding.service.js";
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

export type RagSyncResult = {
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

function normalizeUpper(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function resolveDocType(page: SopIkPage) {
  const explicit = normalizeUpper(page.docType);
  if (explicit === "SOP" || explicit === "IK") return explicit;

  const fileName = normalizeUpper(page.fileName);
  const title = normalizeUpper(page.title);

  if (fileName.startsWith("SOP ") || title.startsWith("SOP ")) return "SOP";
  if (fileName.startsWith("IK ") || title.startsWith("IK ")) return "IK";

  return null;
}

function isTemplateOrHome(page: SopIkPage) {
  const fileName = normalizeUpper(page.fileName);
  const title = normalizeUpper(page.title);

  return (
    fileName === "HOME.ASPX" ||
    fileName.startsWith("TEMPLATE ") ||
    title.startsWith("TEMPLATE ")
  );
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isCurrentlySearchable(page: SopIkPage, docType: string) {
  if (!docType) return false;
  if (normalizeUpper(page.status) !== "ACTIVE") return false;

  const now = Date.now();
  const effectiveFrom = parseDate(page.effectiveFrom);
  const validTo = parseDate(page.validTo);

  if (effectiveFrom && effectiveFrom.getTime() > now) return false;
  if (validTo && validTo.getTime() < now) return false;

  return true;
}

function buildSourceUrl(page: SopIkPage) {
  if (page.fileRef?.startsWith("/")) {
    return `https://${env.SHAREPOINT_SOP_HOSTNAME}${page.fileRef}`;
  }

  return page.webUrl;
}

function estimateTokenHint(content: string) {
  // Only a rough operational hint; actual embeddings are created by OpenAI.
  return Math.max(1, Math.ceil(content.length / 4));
}

function buildChunkText(page: SopIkPage, docType: string, bodyChunk: string) {
  const header = [
    `Dokumen: ${page.title}`,
    page.docNumber ? `Nomor: ${page.docNumber}` : null,
    `Jenis: ${docType}`,
    page.process ? `Proses: ${page.process}` : null,
    page.docVersion !== null ? `Versi: ${page.docVersion}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");

  return `${header}\n\n${bodyChunk}`.trim();
}

async function indexPage(page: SopIkPage) {
  const sourceKey = env.RAG_SOURCE_KEY;
  const docType = resolveDocType(page);

  if (!docType || isTemplateOrHome(page)) {
    const removed = await deleteRagDocumentBySource(sourceKey, page.id);
    return { status: "ignored" as const, removed };
  }

  const cleanBody = cleanSharePointCanvasContent(page.canvasContent1);
  const documentText = buildKnowledgeDocumentText({
    title: page.title,
    docNumber: page.docNumber,
    docType,
    process: page.process,
    docVersion: page.docVersion,
    body: cleanBody,
  });

  const contentHash = documentText ? sha256(documentText) : null;
  const searchable =
    isCurrentlySearchable(page, docType) && documentText.trim().length >= 40;

  const existing = await findRagDocument(sourceKey, page.id);

  const stored = await upsertRagDocument({
    sourceKey,
    sourceItemId: page.id,
    sourceType: "sharepoint_site_page",
    title: page.title,
    fileName: page.fileName,
    docNumber: page.docNumber,
    docType,
    process: page.process,
    status: page.status,
    docVersion: page.docVersion,
    effectiveFrom: page.effectiveFrom,
    validTo: page.validTo,
    reminderToUpdate: page.reminderToUpdate,
    managerApprovalStatus: page.managerApprovalStatus,
    qaApprovalStatus: page.qaApprovalStatus,
    sourceUrl: buildSourceUrl(page),
    sourceEtag: page.eTag,
    sourceModifiedAt: page.modifiedAt,
    contentHash,
    contentText: documentText || null,
    isSearchable: searchable,
    metadata: {
      fileRef: page.fileRef,
      webUrl: page.webUrl,
      sourceSitePath: env.SHAREPOINT_SOP_SITE_PATH,
    },
  });

  if (!searchable || !contentHash) {
    await disableRagDocument(stored.id);
    return { status: "disabled" as const };
  }

  const canReuseExistingChunks =
    existing?.indexedContentHash === contentHash &&
    existing.embeddingModel === env.RAG_EMBEDDING_MODEL &&
    existing.isSearchable;

  if (canReuseExistingChunks) {
    return { status: "unchanged" as const };
  }

  const bodyChunks = chunkKnowledgeText({
    text: cleanBody,
    maxChars: env.RAG_CHUNK_SIZE_CHARS,
    overlapChars: env.RAG_CHUNK_OVERLAP_CHARS,
  });

  if (bodyChunks.length === 0) {
    await disableRagDocument(stored.id);
    return { status: "disabled" as const };
  }

  const chunkTexts = bodyChunks.map((chunk) => buildChunkText(page, docType, chunk));
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

async function runSyncAttempt(input: {
  forceFull: boolean;
  siteId: string;
  listId: string;
}) {
  const state = await getRagSyncState(env.RAG_SOURCE_KEY);
  const useDeltaLink = input.forceFull ? null : state?.deltaLink ?? null;

  const delta = await readSopIkDelta({
    siteId: input.siteId,
    listId: input.listId,
    deltaLink: useDeltaLink,
  });

  const result: RagSyncResult = {
    mode: useDeltaLink ? "delta" : "full",
    sourceKey: env.RAG_SOURCE_KEY,
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
      const removed = await deleteRagDocumentBySource(
        env.RAG_SOURCE_KEY,
        change.id,
      );
      result.deleted += removed > 0 ? 1 : 0;
      continue;
    }

    currentIds.add(change.id);

    const page = await getSopIkPageByItemId({
      siteId: input.siteId,
      listId: input.listId,
      itemId: change.id,
    });

    const indexed = await indexPage(page);

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

  // A fresh delta enumeration represents the current list state. Reconcile old
  // local rows that no longer exist on SharePoint (for example after a manual
  // reset of sync_state or a very old delta token).
  if (!useDeltaLink) {
    result.reconciledDeleted = await deleteRagDocumentsNotInSourceIds(
      env.RAG_SOURCE_KEY,
      Array.from(currentIds),
    );
  }

  await saveRagSyncState({
    sourceKey: env.RAG_SOURCE_KEY,
    siteId: input.siteId,
    listId: input.listId,
    deltaLink: delta.deltaLink,
    status: "success",
    error: null,
  });

  return result;
}

export async function syncSharePointKnowledge(input?: { full?: boolean }) {
  const context = await getSopIkSiteContext();

  writeBusinessEvent("info", "RAG_SYNC_START", {
    source: "sharepoint",
    sourceKey: env.RAG_SOURCE_KEY,
    full: Boolean(input?.full),
  });

  try {
    const result = await runSyncAttempt({
      forceFull: Boolean(input?.full),
      siteId: context.site.id,
      listId: context.listId,
    });

    writeBusinessEvent("info", "RAG_SYNC_COMPLETE", result);
    return result;
  } catch (error) {
    // Microsoft Graph can return 410 when an old delta token can no longer be
    // used. In that case, perform one fresh enumeration and replace the token.
    if (!input?.full && error instanceof GraphApiError && error.status === 410) {
      writeBusinessEvent("warn", "RAG_DELTA_RESET", {
        sourceKey: env.RAG_SOURCE_KEY,
        statusCode: error.status,
      });

      const result = await runSyncAttempt({
        forceFull: true,
        siteId: context.site.id,
        listId: context.listId,
      });

      writeBusinessEvent("info", "RAG_SYNC_COMPLETE", result);
      return result;
    }

    const message = error instanceof Error ? error.message : String(error);

    await saveRagSyncState({
      sourceKey: env.RAG_SOURCE_KEY,
      siteId: context.site.id,
      listId: context.listId,
      deltaLink: (await getRagSyncState(env.RAG_SOURCE_KEY))?.deltaLink ?? null,
      status: "failed",
      error: message.slice(0, 2000),
    }).catch(() => undefined);

    writeBusinessEvent("error", "RAG_SYNC_FAILED", {
      sourceKey: env.RAG_SOURCE_KEY,
      error: message,
    });

    throw error;
  }
}
