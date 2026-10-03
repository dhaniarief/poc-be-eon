export type LocationCoordinateSource = "FINOPS" | "CRM" | "GEOCODED" | "NONE";

export type ResolvedLocation = {
  found: boolean;
  source: string;
  name: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateSource: LocationCoordinateSource;
  routeText: string | null;
};
