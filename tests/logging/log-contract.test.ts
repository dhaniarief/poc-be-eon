import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

describe("logging contract", () => {
  it("does not duplicate tool lifecycle logs inside integration clients", async () => {
    const crm = await source("src/services/microsoft/dynamics-crm/crm-client.ts");
    expect(crm).not.toContain("AI tool executed");
    expect(crm).not.toContain("meta?.log");
  });

  it("uses normalized INTEGRATION_ERROR events for Microsoft client failures", async () => {
    for (const path of [
      "src/services/microsoft/dynamics-crm/crm-client.ts",
      "src/services/microsoft/dynamics-finops/finops-client.ts",
      "src/services/microsoft/sharepoint/sharepoint-client.ts",
    ]) {
      const value = await source(path);
      expect(value).toContain('"INTEGRATION_ERROR"');
      expect(value).toContain("writeBusinessEvent");
    }
  });
});

it("uses normalized HTTP_ERROR event in the Express error boundary", async () => {
  const value = await source("src/middleware/error.middleware.ts");
  expect(value).toContain('"HTTP_ERROR"');
  expect(value).toContain("writeBusinessEvent");
});

it("uses a normalized APP_START event on server startup", async () => {
  const value = await source("src/server.ts");
  expect(value).toContain('"APP_START"');
  expect(value).toContain("writeBusinessEvent");
});

it("does not log or rethrow raw Microsoft response bodies", async () => {
  for (const path of [
    "src/services/microsoft/dynamics-crm/crm-client.ts",
    "src/services/microsoft/dynamics-finops/finops-client.ts",
    "src/services/microsoft/sharepoint/sharepoint-client.ts",
  ]) {
    const value = await source(path);
    expect(value).not.toContain("response.text()");
  }
});
