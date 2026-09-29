function splitLongParagraph(paragraph: string, maxChars: number) {
  if (paragraph.length <= maxChars) return [paragraph];

  const sentences = paragraph
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    const pieces: string[] = [];
    for (let start = 0; start < paragraph.length; start += maxChars) {
      pieces.push(paragraph.slice(start, start + maxChars).trim());
    }
    return pieces.filter(Boolean);
  }

  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;

    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) pieces.push(current.trim());

    if (sentence.length > maxChars) {
      for (let start = 0; start < sentence.length; start += maxChars) {
        pieces.push(sentence.slice(start, start + maxChars).trim());
      }
      current = "";
    } else {
      current = sentence;
    }
  }

  if (current) pieces.push(current.trim());
  return pieces.filter(Boolean);
}

function tail(value: string, size: number) {
  if (size <= 0) return "";
  if (value.length <= size) return value;
  return value.slice(value.length - size).trim();
}

export function chunkKnowledgeText(input: {
  text: string;
  maxChars: number;
  overlapChars: number;
}) {
  const maxChars = Math.max(500, input.maxChars);
  const overlapChars = Math.max(0, Math.min(input.overlapChars, maxChars / 2));

  const paragraphs = input.text
    .split(/\n{2,}/)
    .flatMap((paragraph) => splitLongParagraph(paragraph.trim(), maxChars))
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    const overlap = tail(current, overlapChars);
    const withOverlap = overlap ? `${overlap}\n\n${paragraph}` : paragraph;

    current =
      withOverlap.length <= maxChars
        ? withOverlap
        : paragraph.slice(0, maxChars);
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
