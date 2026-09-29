const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtmlEntitiesOnce(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    });
}

export function decodeHtmlEntities(value: string) {
  let current = value;

  // SharePoint CanvasContent1 often contains nested entity encoding inside
  // web-part attributes. A few passes are enough and avoid endless loops.
  for (let index = 0; index < 4; index += 1) {
    const decoded = decodeHtmlEntitiesOnce(current);
    if (decoded === current) break;
    current = decoded;
  }

  return current;
}

function stripTagsPreservingStructure(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<\/div\s*>/gi, "\n")
    .replace(/<\/section\s*>/gi, "\n\n")
    .replace(/<\/article\s*>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/li\s*>/gi, "")
    .replace(/<\/tr\s*>/gi, "\n")
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ ]{2,}/g, " ").trim())
    .filter((line, index, all) => {
      if (line) return true;
      return index > 0 && all[index - 1] !== "";
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+\|\s+\|\s+/g, " | ")
    .replace(/^\s*\|\s*/gm, "")
    .replace(/\s*\|\s*$/gm, "")
    .trim();
}

export function cleanSharePointCanvasContent(canvasContent1: string) {
  if (!canvasContent1?.trim()) return "";

  const decoded = decodeHtmlEntities(canvasContent1);
  const text = stripTagsPreservingStructure(decoded);

  return normalizeWhitespace(decodeHtmlEntities(text));
}

export function buildKnowledgeDocumentText(input: {
  title: string;
  docNumber?: string | null;
  docType?: string | null;
  process?: string | null;
  docVersion?: number | null;
  body: string;
}) {
  const metadataLines = [
    `Judul Dokumen: ${input.title}`,
    input.docNumber ? `Nomor Dokumen: ${input.docNumber}` : null,
    input.docType ? `Jenis Dokumen: ${input.docType}` : null,
    input.process ? `Proses: ${input.process}` : null,
    input.docVersion !== null && input.docVersion !== undefined
      ? `Versi: ${input.docVersion}`
      : null,
  ].filter((line): line is string => Boolean(line));

  return [...metadataLines, "", input.body.trim()].join("\n").trim();
}
