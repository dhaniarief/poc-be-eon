import { describe, expect, it } from "vitest";
import { normalizeText, uniqueParts } from "../../src/utils/text.util.js";

describe("text utilities", () => {
  it("normalizes whitespace and nullish values", () => {
    expect(normalizeText("  EON   Chemical  ")).toBe("EON Chemical");
    expect(normalizeText(null)).toBe("");
  });

  it("returns unique non-empty normalized parts", () => {
    expect(uniqueParts([" Jakarta ", "", "Jakarta", "Indonesia"])).toEqual([
      "Jakarta",
      "Indonesia",
    ]);
  });
});
