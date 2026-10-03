import { describe, expect, it } from "vitest";
import { buildFinopsProductName } from "../../../../src/services/microsoft/dynamics-finops/item-resolver.service.js";

describe("buildFinopsProductName", () => {
  it("builds the exact Product Name + UOM lookup used by FinOps", () => {
    expect(buildFinopsProductName("EONCOR NA 1523", "Drum @ 200 Liter")).toBe(
      "EONCOR NA 1523 Drum @ 200 Ltr",
    );
  });
});
