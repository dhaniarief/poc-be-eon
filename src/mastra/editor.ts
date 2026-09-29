import { MastraEditor } from "@mastra/editor";
import { mastraEditorStore } from "./storage.js";

/**
 * Agent Editor requires durable storage for drafts, published versions and
 * rollback history. It is therefore enabled only when DATABASE_URL exists.
 */
export const mastraEditor = mastraEditorStore ? new MastraEditor() : undefined;
