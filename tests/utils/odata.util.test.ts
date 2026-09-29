import { describe, expect, it } from "vitest";
import { escapeODataString } from "../../src/utils/odata.util.js";

describe("escapeODataString", () => {
  it("escapes apostrophes for OData string literals", () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
  });
});
