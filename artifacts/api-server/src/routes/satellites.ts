import { Router, type IRouter } from "express";
import {
  GetSatelliteParams,
  ListSatellitesQueryParams,
} from "@workspace/api-zod";
import {
  getPropagatedObjects,
  getObjectDetail,
  getTLERecords,
  getCacheInfo,
} from "../lib/celestrak";

const router: IRouter = Router();

// GET /satellites
router.get("/satellites", async (req, res): Promise<void> => {
  const query = ListSatellitesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { category, limit = 200, search } = query.data;

  let objects = await getPropagatedObjects();

  if (category) {
    objects = objects.filter((o) => o.category === category);
  }

  if (search) {
    const q = search.toLowerCase();
    objects = objects.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.noradId.includes(q),
    );
  }

  const limited = objects.slice(0, limit);

  res.json(limited);
});

// GET /satellites/categories  — must come before /:noradId
router.get("/satellites/categories", async (_req, res): Promise<void> => {
  const objects = await getPropagatedObjects();

  const counts: Record<string, number> = {};
  for (const o of objects) {
    counts[o.category] = (counts[o.category] ?? 0) + 1;
  }

  const CATEGORY_META: Record<string, { label: string; color: string }> = {
    stations: { label: "Space Stations", color: "#00ff88" },
    starlink: { label: "Starlink", color: "#4fc3f7" },
    gps: { label: "GPS / GNSS", color: "#ffd700" },
    weather: { label: "Weather", color: "#ce93d8" },
    military: { label: "Military", color: "#ef5350" },
    debris: { label: "Debris", color: "#ff6b35" },
    active: { label: "Active", color: "#80cbc4" },
  };

  const categories = Object.entries(counts).map(([id, count]) => ({
    id,
    label: CATEGORY_META[id]?.label ?? id.charAt(0).toUpperCase() + id.slice(1),
    count,
    color: CATEGORY_META[id]?.color ?? "#888888",
  }));

  // Sort by count descending
  categories.sort((a, b) => b.count - a.count);

  res.json(categories);
});

// GET /satellites/:noradId
router.get("/satellites/:noradId", async (req, res): Promise<void> => {
  const params = GetSatelliteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await getObjectDetail(params.data.noradId);
  if (!detail) {
    res.status(404).json({ error: "Satellite not found" });
    return;
  }

  res.json(detail);
});

// GET /stats
router.get("/stats", async (_req, res): Promise<void> => {
  const objects = await getPropagatedObjects();

  const categoryCounts: Record<string, number> = {};
  for (const o of objects) {
    categoryCounts[o.category] = (categoryCounts[o.category] ?? 0) + 1;
  }

  const debrisCount = objects.filter((o) => o.isDebris).length;
  const activeCount = objects.filter((o) => o.isActive).length;
  const altitudes = objects.map((o) => o.alt).filter((a) => a > 0);
  const avgAltitude =
    altitudes.length > 0
      ? Math.round(altitudes.reduce((s, a) => s + a, 0) / altitudes.length)
      : 0;

  // Threat level based on debris ratio
  const debrisRatio = objects.length > 0 ? debrisCount / objects.length : 0;
  let threatLevel = "NOMINAL";
  if (debrisRatio > 0.5) threatLevel = "CRITICAL";
  else if (debrisRatio > 0.25) threatLevel = "ELEVATED";

  // Find most concerning object (highest debris count category)
  const highestThreatObject =
    debrisCount > 0
      ? objects.find((o) => o.isDebris && o.alt < 500)?.name ?? null
      : null;

  const records = await getTLERecords();
  const { fetchedAt } = getCacheInfo();
  const lastUpdated = fetchedAt ? new Date(fetchedAt).toISOString() : new Date().toISOString();

  res.json({
    totalTracked: objects.length,
    activeCount,
    debrisCount,
    stationsCount: categoryCounts["stations"] ?? 0,
    starlinkCount: categoryCounts["starlink"] ?? 0,
    gpsCount: categoryCounts["gps"] ?? 0,
    weatherCount: categoryCounts["weather"] ?? 0,
    militaryCount: categoryCounts["military"] ?? 0,
    threatLevel,
    lastUpdated,
    avgAltitude,
    highestThreatObject,
  });
});

// GET /conjunctions
router.get("/conjunctions", async (_req, res): Promise<void> => {
  const objects = await getPropagatedObjects();

  // Compute proximity-based conjunction candidates
  // Use simple 3D distance between objects in similar altitude bands
  const conjunctions: Array<{
    id: string;
    primaryName: string;
    primaryNoradId: string;
    secondaryName: string;
    secondaryNoradId: string;
    minRange: number;
    probability: number;
    timeOfClosestApproach: string;
    relativeVelocity: number;
    threatLevel: string;
  }> = [];

  // For performance, only check objects in LEO (alt 200–2000 km)
  const leo = objects.filter((o) => o.alt >= 200 && o.alt <= 2000);

  // Group by altitude band (100 km bins) to reduce search space
  const bands: Record<string, typeof leo> = {};
  for (const o of leo) {
    const band = Math.floor(o.alt / 100).toString();
    if (!bands[band]) bands[band] = [];
    bands[band].push(o);
  }

  const DEG2RAD = Math.PI / 180;
  const RE = 6371; // km

  for (const [, group] of Object.entries(bands)) {
    if (group.length < 2) continue;
    // Check pairs within band (limit to avoid O(n^2) blowup)
    const sample = group.slice(0, 50);
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const a = sample[i];
        const b = sample[j];

        // Great-circle angular distance approximation
        const dLat = (b.lat - a.lat) * DEG2RAD;
        const dLon = (b.lon - a.lon) * DEG2RAD;
        const sinDLat = Math.sin(dLat / 2);
        const sinDLon = Math.sin(dLon / 2);
        const haversine =
          sinDLat * sinDLat +
          Math.cos(a.lat * DEG2RAD) *
            Math.cos(b.lat * DEG2RAD) *
            sinDLon *
            sinDLon;
        const angularDist = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
        const surfDist = (RE + a.alt) * angularDist;
        const altDiff = Math.abs(a.alt - b.alt);
        const range = Math.sqrt(surfDist * surfDist + altDiff * altDiff);

        // Only report objects within 10 km of each other (close-approach threshold)
        if (range > 10) continue;

        const relV = Math.abs(a.velocity - b.velocity) + 0.1;
        const probability = Math.min(0.99, 0.001 / (range + 0.1));

        let threatLevel = "LOW";
        if (range < 1) threatLevel = "CRITICAL";
        else if (range < 5) threatLevel = "HIGH";
        else if (range < 20) threatLevel = "MEDIUM";

        // TCA: rough estimate based on current relative velocity
        const hoursToClosest = range / (relV * 3600);
        const tca = new Date(Date.now() + hoursToClosest * 3600000);

        conjunctions.push({
          id: `${a.noradId}-${b.noradId}`,
          primaryName: a.name,
          primaryNoradId: a.noradId,
          secondaryName: b.name,
          secondaryNoradId: b.noradId,
          minRange: Math.round(range * 100) / 100,
          probability: Math.round(probability * 1e6) / 1e6,
          timeOfClosestApproach: tca.toISOString(),
          relativeVelocity: Math.round(relV * 100) / 100,
          threatLevel,
        });

        if (conjunctions.length >= 50) break;
      }
      if (conjunctions.length >= 50) break;
    }
    if (conjunctions.length >= 50) break;
  }

  // Sort by threat: CRITICAL > HIGH > MEDIUM > LOW
  const ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  conjunctions.sort(
    (a, b) =>
      (ORDER[a.threatLevel as keyof typeof ORDER] ?? 4) -
      (ORDER[b.threatLevel as keyof typeof ORDER] ?? 4),
  );

  res.json(conjunctions);
});

export default router;
