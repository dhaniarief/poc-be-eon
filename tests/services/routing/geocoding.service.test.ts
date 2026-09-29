import { afterEach, describe, expect, it, vi } from "vitest";

import { geocodeWithFallback } from "../../../src/services/routing/geocoding.service.js";

describe("geocoding service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a Jakarta result when the expected address is in Bengkalis Riau", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,

      json: async () => [
        {
          lat: "-6.1552764",

          lon: "106.8012968",

          display_name:
            "Tambora, Jakarta, Daerah Khusus Ibukota Jakarta 11260, Indonesia",

          address: {
            city: "Jakarta",

            suburb: "Tambora",

            state: "Daerah Khusus Ibukota Jakarta",

            postcode: "11260",

            country: "Indonesia",

            country_code: "id",
          },
        },

        {
          lat: "1.280000",

          lon: "101.200000",

          display_name:
            "Pematang Obo, Bathin Solapan, Kabupaten Bengkalis, Riau 28784, Indonesia",

          address: {
            village: "Pematang Obo",

            municipality: "Bathin Solapan",

            county: "Kabupaten Bengkalis",

            state: "Riau",

            postcode: "28784",

            country: "Indonesia",

            country_code: "id",
          },
        },
      ],
    });

    vi.stubGlobal("fetch", fetchMock);

    const address =
      "Gudang Duri, Jl. Tegalsari KM.4 Kulim-Duri, " +
      "Gang Siaga 1, Kelurahan Pematang Obo, " +
      "Kecamatan Bathin Solapan, Kabupaten Bengkalis, " +
      "Riau 28784";

    const result = await geocodeWithFallback(
      address,

      ["Bathin Solapan", "Bengkalis", "Riau", "28784", "Indonesia"],

      {
        expectedText: address,

        district: "Bathin Solapan",

        city: "Bengkalis",

        province: "Riau",

        postalCode: "28784",

        country: "Indonesia",
      },
    );

    expect(result).not.toBeNull();

    expect(result?.province).toBe("Riau");

    expect(result?.postalCode).toBe("28784");

    expect(result?.latitude).toBe(1.28);

    expect(result?.longitude).toBe(101.2);
  });
});
