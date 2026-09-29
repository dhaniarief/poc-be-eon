import { describe, expect, it } from "vitest";
import { normalizeSearxngResults } from "../../../src/services/web/searxng.service.js";

describe("normalizeSearxngResults", () => {
  it("deduplicates urls, normalizes whitespace, and caps snippets", () => {
    const results = normalizeSearxngResults(
      [
        {
          title: "A",
          url: "https://example.com/a",
          content: "x".repeat(900),
          engine: "google",
        },
        {
          title: "A duplicate",
          url: "https://example.com/a#fragment",
          content: "duplicate",
          engine: "bing",
        },
        {
          title: "B",
          url: "https://example.com/b",
          content: "  hello   world  ",
          engine: "bing",
        },
        { title: "No URL", url: "", content: "skip" },
      ],
      { maxResults: 5, maxSnippetChars: 700 },
    );

    expect(results).toHaveLength(2);
    expect(results[0].snippet.length).toBeLessThanOrEqual(700);
    expect(results[1].snippet).toBe("hello world");
  });
});
