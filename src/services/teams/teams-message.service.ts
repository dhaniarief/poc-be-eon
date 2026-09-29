export type NormalizedTeamsMessage = {
  rawText: string;
  normalizedText: string;
  isCopilotContext: boolean;
};

const THREAD_CONTEXT_MARKERS = [
  "[Thread context — messages in this thread before you joined]",
];

const COPILOT_STATUS_PATTERNS = [
  /^Taking a look…?$/i,
  /^Working on it…?$/i,
  /^Looking into it…?$/i,
];

function isCopilotStatusLine(line: string) {
  const clean = line.trim();

  return COPILOT_STATUS_PATTERNS.some((pattern) => pattern.test(clean));
}

export function normalizeTeamsMessage(
  input: string | null | undefined,
): NormalizedTeamsMessage {
  const rawText = String(input ?? "").trim();

  if (!rawText) {
    return {
      rawText: "",
      normalizedText: "",
      isCopilotContext: false,
    };
  }

  const isCopilotContext =
    THREAD_CONTEXT_MARKERS.some((marker) => rawText.includes(marker)) ||
    rawText.includes("Microsoft Copilot");

  if (!isCopilotContext) {
    return {
      rawText,
      normalizedText: rawText,
      isCopilotContext: false,
    };
  }

  const blocks = rawText
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const userBlocks = blocks.filter((block) => {
    if (THREAD_CONTEXT_MARKERS.some((marker) => block.includes(marker))) {
      return false;
    }

    if (block.includes("Microsoft Copilot")) {
      return false;
    }

    if (isCopilotStatusLine(block)) {
      return false;
    }

    return true;
  });

  let normalizedText =
    userBlocks.length > 0 ? userBlocks[userBlocks.length - 1] : rawText;

  normalizedText = normalizedText
    .split("\n")
    .filter((line) => {
      const clean = line.trim();

      if (!clean) {
        return true;
      }

      if (THREAD_CONTEXT_MARKERS.some((marker) => clean.includes(marker))) {
        return false;
      }

      if (clean.includes("Microsoft Copilot")) {
        return false;
      }

      if (isCopilotStatusLine(clean)) {
        return false;
      }

      return true;
    })
    .join("\n")
    .trim();

  console.log("[TEAMS MESSAGE NORMALIZED]", {
    isCopilotContext,
    rawText,
    normalizedText,
  });

  return {
    rawText,
    normalizedText,
    isCopilotContext,
  };
}
