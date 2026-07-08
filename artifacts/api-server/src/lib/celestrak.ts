import * as satellite from "satellite.js";
import { logger } from "./logger";
import { EMBEDDED_TLE_TEXT } from "./tleData";

export interface TLERecord {
  name: string;
  line1: string;
  line2: string;
  category: string;
}

export interface PropagatedObject {
  noradId: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  alt: number;
  velocity: number;
  inclination: number;
  period: number;
  rcs: string | null;
  launchYear: number | null;
  isDebris: boolean;
  isActive: boolean;
  tleLine1: string;
  tleLine2: string;
}

// ---------------------------------------------------------------------------
// TLE cache
// ---------------------------------------------------------------------------
interface CacheEntry {
  records: TLERecord[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PROPAGATED_TTL_MS = 30 * 1000; // 30 seconds (fresh enough for 30s poll)
let cache: CacheEntry | null = null;

interface PropagatedCacheEntry {
  objects: PropagatedObject[];
  computedAt: number;
}
let propagatedCache: PropagatedCacheEntry | null = null;

// ---------------------------------------------------------------------------
// CelesTrak group definitions
// ---------------------------------------------------------------------------
const CELESTRAK_GROUPS: Array<{ id: string; url: string; isDebris: boolean }> = [
  {
    id: "stations",
    url: "https://celestrak.org/pub/TLE/stations.txt",
    isDebris: false,
  },
  {
    id: "starlink",
    url: "https://celestrak.org/pub/TLE/starlink.txt",
    isDebris: false,
  },
  {
    id: "gps",
    url: "https://celestrak.org/pub/TLE/gps-ops.txt",
    isDebris: false,
  },
  {
    id: "weather",
    url: "https://celestrak.org/pub/TLE/weather.txt",
    isDebris: false,
  },
  {
    id: "military",
    url: "https://celestrak.org/pub/TLE/military.txt",
    isDebris: false,
  },
  {
    id: "debris",
    url: "https://celestrak.org/pub/TLE/debris.txt",
    isDebris: true,
  },
];

// Fallback group using "active" with a limit applied later
const ACTIVE_GROUP = {
  id: "active",
  url: "https://celestrak.org/pub/TLE/active.txt",
  isDebris: false,
};

// ---------------------------------------------------------------------------
// TLE fetchers
// ---------------------------------------------------------------------------
async function fetchTLEGroup(
  url: string,
  category: string,
  isDebris: boolean,
  limit = 500,
): Promise<TLERecord[]> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "ORION-STC/1.0" },
    });
    if (!res.ok) {
      logger.warn({ url, status: res.status }, "CelesTrak fetch non-OK");
      return [];
    }
    const text = await res.text();
    return parseTLE(text, category, isDebris, limit);
  } catch (err) {
    logger.warn({ url, err }, "CelesTrak fetch failed");
    return [];
  }
}

function parseTLE(
  text: string,
  category: string,
  isDebris: boolean,
  limit: number,
): TLERecord[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const records: TLERecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    if (records.length >= limit) break;
    const name = lines[i].replace(/^0 /, "").trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;
    records.push({ name, line1, line2, category });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Parse embedded fallback TLE data
// ---------------------------------------------------------------------------
function parseEmbeddedTLE(): TLERecord[] {
  const lines = EMBEDDED_TLE_TEXT.split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const records: TLERecord[] = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i].replace(/^0 /, "").trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) continue;

    // Determine category from name
    const n = name.toUpperCase();
    let category = "active";
    if (n.includes("ISS") || n.includes("CSS") || n.includes("ZARYA") || n.includes("TIANHE")) {
      category = "stations";
    } else if (n.includes("STARLINK")) {
      category = "starlink";
    } else if (n.includes("GPS") || n.includes("GLONASS") || n.includes("GALILEO") || n.includes("BEIDOU")) {
      category = "gps";
    } else if (n.includes("NOAA") || n.includes("METOP") || n.includes("GOES") || n.includes("FENGYUN") || n.includes("HAIYANG")) {
      category = "weather";
    } else if (n.includes("DEB") || n.includes("DEBRIS") || n.includes("R/B")) {
      category = "debris";
    } else if (n.includes("USA ") || n.includes("COSMOS 2") || n.includes("YAOGAN") || n.includes("MUOS") || n.includes("LACROSSE")) {
      category = "military";
    } else if (n.includes("ONEWEB") || n.includes("IRIDIUM")) {
      category = "active";
    }

    records.push({ name, line1, line2, category });
  }

  logger.info({ count: records.length }, "Loaded embedded TLE dataset");
  return records;
}

// ---------------------------------------------------------------------------
// Refresh cache
// ---------------------------------------------------------------------------
export async function refreshCache(): Promise<void> {
  logger.info("Refreshing CelesTrak TLE cache...");

  const fetchPromises = CELESTRAK_GROUPS.map((g) =>
    fetchTLEGroup(g.url, g.id, g.isDebris, g.id === "starlink" ? 300 : 200),
  );

  const results = await Promise.all(fetchPromises);

  // If all specialty groups failed, fall back to active.txt
  const total = results.reduce((s, r) => s + r.length, 0);
  let records: TLERecord[] = results.flat();

  if (total < 20) {
    logger.warn("Specialty groups returned < 20 objects, trying active.txt");
    const fallback = await fetchTLEGroup(
      ACTIVE_GROUP.url,
      ACTIVE_GROUP.id,
      false,
      500,
    );
    if (fallback.length > 0) {
      records = fallback;
    } else {
      // Fall back to embedded TLE data
      logger.warn("All live sources failed, using embedded TLE dataset");
      records = parseEmbeddedTLE();
    }
  }

  // Deduplicate by NORAD ID
  const seen = new Set<string>();
  const unique: TLERecord[] = [];
  for (const r of records) {
    const noradId = r.line1.substring(2, 7).trim();
    if (!seen.has(noradId)) {
      seen.add(noradId);
      unique.push(r);
    }
  }

  cache = { records: unique, fetchedAt: Date.now() };
  logger.info({ count: unique.length }, "CelesTrak cache refreshed");
}

// ---------------------------------------------------------------------------
// Get (possibly cached) TLE records
// ---------------------------------------------------------------------------
export async function getTLERecords(): Promise<TLERecord[]> {
  if (!cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS) {
    await refreshCache();
  }
  return cache?.records ?? [];
}

// ---------------------------------------------------------------------------
// Propagate a TLE record to current position
// ---------------------------------------------------------------------------
function propagateOne(rec: TLERecord): PropagatedObject | null {
  try {
    const satrec = satellite.twoline2satrec(rec.line1, rec.line2);
    const now = new Date();
    const posVel = satellite.propagate(satrec, now);
    if (
      !posVel ||
      !posVel.position ||
      typeof posVel.position === "boolean"
    )
      return null;

    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(
      posVel.position as satellite.EciVec3<number>,
      gmst,
    );

    const latDeg = satellite.degreesLat(geo.latitude);
    const lonDeg = satellite.degreesLong(geo.longitude);
    const altKm = geo.height;

    // Velocity magnitude in km/s
    let vel = 0;
    if (posVel.velocity && typeof posVel.velocity !== "boolean") {
      const v = posVel.velocity as satellite.EciVec3<number>;
      vel = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }

    const noradId = rec.line1.substring(2, 7).trim();

    // Parse TLE fields
    const inclination = parseFloat(rec.line2.substring(8, 16));
    const meanMotion = parseFloat(rec.line2.substring(52, 63)); // rev/day
    const period = meanMotion > 0 ? 1440 / meanMotion : 0; // minutes

    // Launch year from NORAD ID approximate heuristic or TLE epoch
    const epochYear = parseInt(rec.line1.substring(18, 20));
    const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;

    // RCS from name heuristics (placeholder; real data requires SATCAT query)
    const rcs = guessRCS(rec.name);
    const isDebris =
      rec.category === "debris" ||
      rec.name.includes("DEB") ||
      rec.name.includes("DEBRIS") ||
      rec.name.includes("R/B");

    const isActive = !isDebris && rec.category !== "debris";

    if (
      isNaN(latDeg) ||
      isNaN(lonDeg) ||
      isNaN(altKm) ||
      altKm < -100 ||
      altKm > 50000
    )
      return null;

    return {
      noradId,
      name: rec.name,
      category: rec.category,
      lat: Math.round(latDeg * 1000) / 1000,
      lon: Math.round(lonDeg * 1000) / 1000,
      alt: Math.round(altKm * 10) / 10,
      velocity: Math.round(vel * 100) / 100,
      inclination: Math.round(inclination * 100) / 100,
      period: Math.round(period * 10) / 10,
      rcs,
      launchYear: fullYear > 1957 && fullYear <= new Date().getFullYear() ? fullYear : null,
      isDebris,
      isActive,
      tleLine1: rec.line1,
      tleLine2: rec.line2,
    };
  } catch {
    return null;
  }
}

function guessRCS(name: string): string | null {
  const n = name.toUpperCase();
  if (n.includes("STARLINK") || n.includes("ONEWEB")) return "SMALL";
  if (n.includes("ISS") || n.includes("STATION") || n.includes("CSS"))
    return "LARGE";
  if (n.includes("R/B") || n.includes("ROCKET")) return "LARGE";
  if (n.includes("DEB") || n.includes("DEBRIS")) return "SMALL";
  if (n.includes("GPS") || n.includes("GLONASS") || n.includes("GALILEO"))
    return "MEDIUM";
  return "MEDIUM";
}

// ---------------------------------------------------------------------------
// Export cache metadata for /stats endpoint
// ---------------------------------------------------------------------------
export function getCacheInfo(): { fetchedAt: number | null } {
  return { fetchedAt: cache?.fetchedAt ?? null };
}

// ---------------------------------------------------------------------------
// Propagate all records (with short-lived result cache)
// ---------------------------------------------------------------------------
export async function getPropagatedObjects(): Promise<PropagatedObject[]> {
  if (
    propagatedCache &&
    Date.now() - propagatedCache.computedAt < PROPAGATED_TTL_MS
  ) {
    return propagatedCache.objects;
  }

  const records = await getTLERecords();
  const results: PropagatedObject[] = [];
  for (const rec of records) {
    const obj = propagateOne(rec);
    if (obj) results.push(obj);
  }

  propagatedCache = { objects: results, computedAt: Date.now() };
  return results;
}

// ---------------------------------------------------------------------------
// Get detail for a single object
// ---------------------------------------------------------------------------
export async function getObjectDetail(
  noradId: string,
): Promise<
  | (PropagatedObject & {
      apogee: number;
      perigee: number;
      eccentricity: number;
      epoch: string;
      rightAscension: number;
      argOfPerigee: number;
      meanAnomaly: number;
      dragTerm: number;
    })
  | null
> {
  const records = await getTLERecords();
  const rec = records.find(
    (r) => r.line1.substring(2, 7).trim() === noradId,
  );
  if (!rec) return null;

  const base = propagateOne(rec);
  if (!base) return null;

  // Parse additional orbital elements from TLE
  const eccentricity = parseFloat("0." + rec.line2.substring(26, 33));
  const rightAscension = parseFloat(rec.line2.substring(17, 25));
  const argOfPerigee = parseFloat(rec.line2.substring(34, 42));
  const meanAnomaly = parseFloat(rec.line2.substring(43, 51));
  const meanMotion = parseFloat(rec.line2.substring(52, 63));
  const dragTerm = parseDrag(rec.line1.substring(53, 61));

  // Earth radius + altitude = semi-major axis approx
  const mu = 398600.4418; // km^3/s^2
  const n = (meanMotion * 2 * Math.PI) / 86400; // rad/s
  const a = Math.pow(mu / (n * n), 1 / 3); // km semi-major axis
  const Re = 6378.137; // km Earth radius
  const apogee = Math.round(a * (1 + eccentricity) - Re);
  const perigee = Math.round(a * (1 - eccentricity) - Re);

  // Epoch
  const epochYear = parseInt(rec.line1.substring(18, 20));
  const epochDay = parseFloat(rec.line1.substring(20, 32));
  const fullYear = epochYear >= 57 ? 1900 + epochYear : 2000 + epochYear;
  const epochDate = new Date(Date.UTC(fullYear, 0, 1));
  epochDate.setUTCDate(epochDate.getUTCDate() + Math.floor(epochDay) - 1);
  epochDate.setUTCMilliseconds(
    (epochDay % 1) * 86400000,
  );

  return {
    ...base,
    apogee,
    perigee,
    eccentricity: Math.round(eccentricity * 1e6) / 1e6,
    epoch: epochDate.toISOString(),
    rightAscension: Math.round(rightAscension * 1000) / 1000,
    argOfPerigee: Math.round(argOfPerigee * 1000) / 1000,
    meanAnomaly: Math.round(meanAnomaly * 1000) / 1000,
    dragTerm: Math.round(dragTerm * 1e8) / 1e8,
  };
}

function parseDrag(s: string): number {
  // TLE BSTAR format: ±.NNNNN±N  e.g. " 00000+0" or "-11606-4"
  s = s.trim();
  if (!s || s === "00000+0" || s === "00000-0") return 0;
  try {
    // Insert decimal: first char is sign, rest is mantissa+exp
    const sign = s[0] === "-" ? -1 : 1;
    const body = s.replace(/^[+-]/, "");
    const expSign = body.slice(-2, -1);
    const exp = parseInt(expSign + body.slice(-1));
    const mantissa = parseFloat("0." + body.slice(0, -2));
    return sign * mantissa * Math.pow(10, exp);
  } catch {
    return 0;
  }
}
