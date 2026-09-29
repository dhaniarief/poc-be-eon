import { describe, expect, it } from "vitest";

import {
  buildLocationRouteText,
  cleanLocationText,
  extractIndonesiaAddressHints,
  hasCoordinates,
  normalizeCoordinate,
} from "../../src/utils/location.util.js";

describe("location utilities", () => {
  it("validates latitude and longitude ranges", () => {
    expect(normalizeCoordinate(-6.2, "latitude")).toBe(-6.2);

    expect(normalizeCoordinate(106.8, "longitude")).toBe(106.8);

    expect(normalizeCoordinate(999, "latitude")).toBeNull();
  });

  it("rejects null island coordinates 0,0", () => {
    expect(
      hasCoordinates({
        latitude: 0,
        longitude: 0,
      }),
    ).toBe(false);
  });

  it("still allows valid coordinates containing one zero axis", () => {
    expect(
      hasCoordinates({
        latitude: 0,
        longitude: 106.8,
      }),
    ).toBe(true);

    expect(
      hasCoordinates({
        latitude: -6.2,
        longitude: 0,
      }),
    ).toBe(true);
  });

  it("detects complete coordinates", () => {
    expect(
      hasCoordinates({
        latitude: -6.2,
        longitude: 106.8,
      }),
    ).toBe(true);

    expect(
      hasCoordinates({
        latitude: null,
        longitude: 106.8,
      }),
    ).toBe(false);
  });

  it("removes FinOps address placeholders", () => {
    expect(cleanLocationText("Kampar , Riau ,%1")).toBe("Kampar, Riau");
  });

  it("extracts Indonesian administrative address hints", () => {
    const result = extractIndonesiaAddressHints(
      "Gudang Duri, Jl. Tegalsari KM.4 Kulim-Duri, Gang Siaga 1, " +
        "Kelurahan Pematang Obo, Kecamatan Bathin Solapan, " +
        "Kabupaten Bengkalis, Riau 28784",
    );

    expect(result.district).toBe("Bathin Solapan");

    expect(result.city).toBe("Bengkalis");

    expect(result.province).toBe("Riau");

    expect(result.postalCode).toBe("28784");
  });

  it("builds a readable route string", () => {
    expect(
      buildLocationRouteText({
        formattedAddress: null,
        street: "Jl. Industri",
        district: "Cikarang",
        city: "Bekasi",
        province: "Jawa Barat",
        country: "Indonesia",
      }),
    ).toBe("Jl. Industri, Cikarang, Bekasi, Jawa Barat, Indonesia");
  });
});
