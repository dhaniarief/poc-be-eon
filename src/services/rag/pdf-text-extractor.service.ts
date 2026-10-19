type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

function normalizePdfText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Extract text from a PDF buffer using pdfjs-dist.
 *
 * Notes:
 * - Works for PDFs that contain a text layer.
 * - Scanned/image-only PDFs can legitimately return little/no text.
 * - OCR is intentionally not performed here.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  if (!buffer.length) {
    return "";
  }

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);

      const textContent = await page.getTextContent();

      let pageText = "";

      for (const rawItem of textContent.items) {
        const item = rawItem as PdfTextItem;

        const text = typeof item.str === "string" ? item.str : "";

        if (!text) continue;

        pageText += text;
        pageText += item.hasEOL ? "\n" : " ";
      }

      const normalized = normalizePdfText(pageText);

      if (normalized) {
        pages.push(`Page ${pageNumber}\n${normalized}`);
      }
    }
  } finally {
    await pdf.destroy();
  }

  return normalizePdfText(pages.join("\n\n"));
}
