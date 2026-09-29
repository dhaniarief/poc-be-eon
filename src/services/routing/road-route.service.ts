type OSRMResponse = {
  code: string;
  routes?: Array<{
    distance: number;
    duration: number;
  }>;
};

export async function calculateRoadRoute(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origin.longitude},${origin.latitude};` +
    `${destination.longitude},${destination.latitude}` +
    `?overview=false`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Routing failed: ${response.status}`);
  }

  const data = (await response.json()) as OSRMResponse;
  const route = data.routes?.[0];

  if (!route) {
    return null;
  }

  return {
    distanceKm: Number((route.distance / 1000).toFixed(1)),
    drivingHours: Number((route.duration / 3600).toFixed(1)),
  };
}
