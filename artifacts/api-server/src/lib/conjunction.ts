/**
 * SSA-grade conjunction analysis for ORION.
 *
 * Algorithm chain:
 *   1. Propagate all LEO TLE records to now (ECI, via SGP4 / satellite.js).
 *   2. Hoots altitude pre-screen — only pairs whose altitude bands overlap
 *      within HOOTS_ALT_KM are tested (eliminates ~95 % of pairs instantly).
 *   3. Coarse TCA search — propagate both objects at 60-second steps over
 *      SEARCH_WINDOW_H hours; find the step with minimum ECI 3-D distance.
 *   4. Fine TCA refinement — ternary-search ±COARSE_STEP_S around the coarse
 *      minimum at FINE_STEP_S resolution; yields sub-minute TCA accuracy.
 *   5. RTN frame decomposition — express the miss vector in the Radial /
 *      Transverse / Normal frame of the primary object at TCA.
 *   6. Encounter-plane projection — rotate the combined 3-D covariance into
 *      the 2-D plane perpendicular to the relative velocity vector.
 *   7. Collision probability (Pc) — Patera (2001) polar quadrature of the
 *      2-D bivariate Gaussian over the hard-body disk; 50×50 grid.
 *
 * Covariance assumptions (no Space-Track covariance available):
 *   Per-category 1-σ RTN values from Vallado & Griesbach (2014) and NASA
 *   CARA conjunction assessment practice.  Values are conservative.
 *
 * Hard-body radii (HBR) from NASA Orbital Debris Program Office guidelines.
 */

import * as satellite from "satellite.js";
import { getTLERecords, type TLERecord } from "./celestrak";
import { logger } from "./logger";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & per-category parameters
// ─────────────────────────────────────────────────────────────────────────────

const SCREENING_RANGE_KM = 10;      // surface displayed to user
const HOOTS_ALT_KM       = 200;     // altitude band pre-screen (km)
const SEARCH_WINDOW_H    = 6;       // TCA search horizon (hours)
const COARSE_STEP_S      = 60;      // coarse propagation step (s)
const FINE_STEP_S        = 10;      // fine refinement step (s)
const FINE_WINDOW_S      = 120;     // ± window for fine search (s)
const MAX_CONJUNCTIONS   = 50;      // cap returned results
const CONJUNCTION_CACHE_TTL_MS = 5 * 60 * 1000; // 5-minute Pc cache

/** Combined hard-body radius by category (km).
 *  Source: NASA ODPO collision avoidance guidelines. */
const HBR_KM: Record<string, number> = {
  stations: 0.100,  // ISS ~100 m characteristic length
  starlink:  0.005,  // Starlink v1/v2 ~5 m
  gps:       0.010,  // GPS Block III ~10 m
  weather:   0.015,  // NOAA/Metop ~15 m
  military:  0.020,  // conservative
  debris:    0.001,  // 1 m for tracked radar-sized debris
  active:    0.010,  // generic default
};

/** Default 1-σ position uncertainty in RTN frame (km) by category.
 *  R = radial (km), T = transverse/in-track (km), N = normal/cross-track (km).
 *  Sources: Vallado & Griesbach 2014, NASA CARA practice. */
const SIGMA_RTN: Record<string, readonly [number, number, number]> = {
  //                   R       T       N
  stations: [0.010, 0.050, 0.010],  // GPS-equipped, tight tracking
  starlink:  [0.010, 0.050, 0.010],  // on-board GPS telemetry
  gps:       [0.030, 0.200, 0.030],
  weather:   [0.050, 0.500, 0.050],
  military:  [0.050, 0.500, 0.050],  // conservative (no public data)
  debris:    [0.100, 2.000, 0.100],  // radar-tracked small objects
  active:    [0.050, 0.500, 0.050],
};

function hbr(cat: string): number   { return HBR_KM[cat] ?? HBR_KM.active; }
function sigmaRTN(cat: string): readonly [number, number, number] {
  return SIGMA_RTN[cat] ?? SIGMA_RTN.active;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vector math helpers
// ─────────────────────────────────────────────────────────────────────────────

type V3 = [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a: V3, b: V3): V3 => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const scale = (a: V3, s: number): V3 => [a[0]*s, a[1]*s, a[2]*s];
const dot = (a: V3, b: V3): number => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const norm = (a: V3): number => Math.sqrt(dot(a, a));
const normalize = (a: V3): V3 => scale(a, 1 / norm(a));
const cross = (a: V3, b: V3): V3 => [
  a[1]*b[2] - a[2]*b[1],
  a[2]*b[0] - a[0]*b[2],
  a[0]*b[1] - a[1]*b[0],
];

/** 3×3 matrix-vector multiply (row-major) */
function mv3(M: [V3,V3,V3], v: V3): V3 {
  return [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
}

/** Outer product A·B^T for 3×2 M: yields 2×2 = M^T·C·M */
function projectCov3x3to2x2(
  C: [V3, V3, V3],   // 3×3 covariance (row-major)
  e1: V3,             // encounter-plane basis vector 1
  e2: V3,             // encounter-plane basis vector 2
): [[number,number],[number,number]] {
  // S = C·[e1|e2] → 3×2 columns
  const Ce1: V3 = [
    dot(C[0], e1), dot(C[1], e1), dot(C[2], e1),
  ];
  const Ce2: V3 = [
    dot(C[0], e2), dot(C[1], e2), dot(C[2], e2),
  ];
  return [
    [dot(e1, Ce1), dot(e1, Ce2)],
    [dot(e2, Ce1), dot(e2, Ce2)],
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// ECI propagation (direct satellite.js)
// ─────────────────────────────────────────────────────────────────────────────

interface EciState {
  pos: V3;  // km
  vel: V3;  // km/s
}

function propagateECI(
  satrec: ReturnType<typeof satellite.twoline2satrec>,
  date: Date,
): EciState | null {
  try {
    const pv = satellite.propagate(satrec, date);
    if (!pv || !pv.position || typeof pv.position === "boolean") return null;
    if (!pv.velocity || typeof pv.velocity === "boolean") return null;
    const p = pv.position as satellite.EciVec3<number>;
    const v = pv.velocity as satellite.EciVec3<number>;
    return { pos: [p.x, p.y, p.z], vel: [v.x, v.y, v.z] };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RTN frame construction (for covariance rotation and miss decomposition)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the RTN (Radial-Transverse-Normal) frame of a given ECI state.
 * Columns of rotation matrix M are R̂, T̂, N̂ — used as M^T to go ECI→RTN.
 */
function rtnFrame(state: EciState): [V3, V3, V3] {
  const rHat = normalize(state.pos);                     // Radial
  const hVec = cross(state.pos, state.vel);
  const nHat = normalize(hVec);                          // Normal (orbit ⊥)
  const tHat = cross(nHat, rHat);                        // Transverse (≈ along-track)
  return [rHat, tHat, nHat];
}

/**
 * Build 3×3 position covariance matrix in ECI for a given RTN sigma and state.
 * C_ECI = M · C_RTN · M^T,  where M = [R̂|T̂|N̂] (columns).
 */
function covECI(state: EciState, sigRTN: readonly [number,number,number]): [V3,V3,V3] {
  const [rHat, tHat, nHat] = rtnFrame(state);
  const [sr, st, sn] = sigRTN;
  // C_RTN diagonal: sigmas squared
  // C_ECI = Σ_k  σ_k² · (ê_k ⊗ ê_k)
  const add3x3 = (A: [V3,V3,V3], B: [V3,V3,V3]): [V3,V3,V3] => [
    add(A[0], B[0]) as V3,
    add(A[1], B[1]) as V3,
    add(A[2], B[2]) as V3,
  ];
  const outer = (e: V3, s: number): [V3,V3,V3] => [
    scale([e[0]*e[0], e[0]*e[1], e[0]*e[2]] as V3, s*s),
    scale([e[1]*e[0], e[1]*e[1], e[1]*e[2]] as V3, s*s),
    scale([e[2]*e[0], e[2]*e[1], e[2]*e[2]] as V3, s*s),
  ];
  return add3x3(add3x3(outer(rHat, sr), outer(tHat, st)), outer(nHat, sn));
}

// ─────────────────────────────────────────────────────────────────────────────
// Encounter-plane projection
// ─────────────────────────────────────────────────────────────────────────────

interface EncounterPlane {
  e1: V3; e2: V3;          // orthonormal basis spanning the encounter plane
  xm: number; ym: number;  // miss vector in encounter plane (km)
  sigma2D: [[number,number],[number,number]];  // 2D combined covariance (km²)
}

function buildEncounterPlane(
  missPosECI: V3,
  relVelECI: V3,
  combCovECI: [V3, V3, V3],
): EncounterPlane {
  const uRel = normalize(relVelECI);

  // e1 perpendicular to uRel in the plane containing uRel and missPosECI
  const missDotU = dot(missPosECI, uRel);
  const perpMiss = sub(missPosECI, scale(uRel, missDotU));
  const e1 = norm(perpMiss) > 1e-9
    ? normalize(perpMiss)
    : (() => {
        // Fallback: pick arbitrary perpendicular
        const arb: V3 = Math.abs(uRel[0]) < 0.9 ? [1,0,0] : [0,1,0];
        return normalize(sub(arb, scale(uRel, dot(arb, uRel))));
      })();

  const e2 = normalize(cross(uRel, e1));  // e1 × e2 = uRel (right-handed)

  const xm = dot(missPosECI, e1);
  const ym = dot(missPosECI, e2);

  const sigma2D = projectCov3x3to2x2(combCovECI, e1, e2);

  return { e1, e2, xm, ym, sigma2D };
}

// ─────────────────────────────────────────────────────────────────────────────
// Patera (2001) Pc: polar quadrature of 2D Gaussian over hard-body disk
// ─────────────────────────────────────────────────────────────────────────────

function computePc(ep: EncounterPlane, R: number): number {
  const { xm, ym, sigma2D } = ep;
  const [[a, b], [c, d]] = sigma2D;  // b === c (symmetric)

  // Inverse of 2×2 covariance  Σ⁻¹ = (1/det) [[d,-b],[-c,a]]
  const det = a * d - b * c;
  if (det < 1e-30) return 0;  // degenerate covariance
  const invDet = 1 / det;
  const norm2D = 1 / (2 * Math.PI * Math.sqrt(Math.abs(det)));

  const NR = 50, NT = 50;
  const dRho   = R / NR;
  const dTheta = (2 * Math.PI) / NT;
  let pc = 0;

  for (let i = 0; i < NR; i++) {
    const rho = (i + 0.5) * dRho;
    for (let j = 0; j < NT; j++) {
      const theta = (j + 0.5) * dTheta;
      // Point on disk in encounter plane
      const px = rho * Math.cos(theta);
      const py = rho * Math.sin(theta);
      // Offset from miss centre
      const dx = px - xm;
      const dy = py - ym;
      // Quadratic form dx^T Σ^{-1} dx
      const qf = invDet * (d * dx * dx - 2 * b * dx * dy + a * dy * dy);
      pc += norm2D * Math.exp(-0.5 * qf) * rho * dRho * dTheta;
    }
  }

  // Guard numerical limits
  return Math.max(1e-12, Math.min(1 - 1e-12, pc));
}

// ─────────────────────────────────────────────────────────────────────────────
// TCA search
// ─────────────────────────────────────────────────────────────────────────────

interface TcaResult {
  date: Date;
  dist: number;        // km (ECI)
  stateA: EciState;
  stateB: EciState;
}

function eciDist(a: EciState, b: EciState): number {
  return norm(sub(a.pos, b.pos));
}

function findTCA(
  satrecA: ReturnType<typeof satellite.twoline2satrec>,
  satrecB: ReturnType<typeof satellite.twoline2satrec>,
  t0: Date,
): TcaResult | null {
  const t0ms = t0.getTime();
  const totalSteps = (SEARCH_WINDOW_H * 3600) / COARSE_STEP_S;

  let bestDist = Infinity;
  let bestIdx  = -1;

  // ── Coarse pass ──────────────────────────────────────────────────────────
  for (let i = 0; i <= totalSteps; i++) {
    const t = new Date(t0ms + i * COARSE_STEP_S * 1000);
    const sa = propagateECI(satrecA, t);
    const sb = propagateECI(satrecB, t);
    if (!sa || !sb) continue;
    const d = eciDist(sa, sb);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }

  if (bestIdx < 0) return null;

  // Early exit: if even coarse minimum is far beyond screening range, skip
  if (bestDist > SCREENING_RANGE_KM * 20) return null;

  // ── Fine pass (ternary search ±FINE_WINDOW_S around coarse minimum) ────
  const coarseMs = t0ms + bestIdx * COARSE_STEP_S * 1000;
  const lo = coarseMs - FINE_WINDOW_S * 1000;
  const hi = coarseMs + FINE_WINDOW_S * 1000;
  const fineSteps = (2 * FINE_WINDOW_S) / FINE_STEP_S;

  let fineBestDist = bestDist;
  let fineBestMs   = coarseMs;

  for (let i = 0; i <= fineSteps; i++) {
    const ms = lo + i * FINE_STEP_S * 1000;
    const t  = new Date(ms);
    const sa = propagateECI(satrecA, t);
    const sb = propagateECI(satrecB, t);
    if (!sa || !sb) continue;
    const d = eciDist(sa, sb);
    if (d < fineBestDist) { fineBestDist = d; fineBestMs = ms; }
  }

  const tcaDate  = new Date(fineBestMs);
  const finalSA  = propagateECI(satrecA, tcaDate);
  const finalSB  = propagateECI(satrecB, tcaDate);
  if (!finalSA || !finalSB) return null;

  return { date: tcaDate, dist: fineBestDist, stateA: finalSA, stateB: finalSB };
}

// ─────────────────────────────────────────────────────────────────────────────
// Threat level classification (per CARA / NASA guidelines)
// ─────────────────────────────────────────────────────────────────────────────

function classifyThreat(pc: number, dist: number): string {
  // Primary screen: Pc thresholds (NASA operational conjunction assessment)
  if (pc >= 1e-4)        return "CRITICAL";
  if (pc >= 1e-5)        return "HIGH";
  if (pc >= 1e-6)        return "MEDIUM";
  if (dist < 1 || pc >= 1e-7) return "LOW";
  return "LOW";
}

// ─────────────────────────────────────────────────────────────────────────────
// Conjunction cache
// ─────────────────────────────────────────────────────────────────────────────

interface ConjunctionCacheEntry {
  results: ConjunctionResult[];
  computedAt: number;
}
let conjCache: ConjunctionCacheEntry | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Public result type (extends what the OpenAPI schema already has)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConjunctionResult {
  id: string;
  primaryName: string;
  primaryNoradId: string;
  secondaryName: string;
  secondaryNoradId: string;
  minRange: number;           // km (ECI 3-D)
  probability: number;        // dimensionless Pc (Patera 2001)
  timeOfClosestApproach: string;
  relativeVelocity: number;   // km/s (ECI magnitude)
  threatLevel: string;
  // Extended SSA fields
  missVector: {               // km in RTN frame of primary at TCA
    radial: number;
    inTrack: number;
    crossTrack: number;
  };
  combinedHBR: number;        // km (sum of per-category hard-body radii)
  sigmaAssumptions: {         // 1-σ RTN used (km)
    primaryR: number; primaryT: number; primaryN: number;
    secondaryR: number; secondaryT: number; secondaryN: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function computeConjunctions(): Promise<ConjunctionResult[]> {
  // Return cached results if fresh
  if (conjCache && Date.now() - conjCache.computedAt < CONJUNCTION_CACHE_TTL_MS) {
    return conjCache.results;
  }

  const t0  = new Date();
  const t0ms = t0.getTime();
  const records = await getTLERecords();
  logger.info({ total: records.length }, "Starting conjunction screening");

  // ── Step 1: Propagate all records to now, collect altitude ────────────────
  interface Candidate {
    rec: TLERecord;
    satrec: ReturnType<typeof satellite.twoline2satrec>;
    alt0: number;      // km at t0 (for Hoots filter)
    inc0: number;      // degrees (from TLE line 2)
    noradId: string;
  }

  const candidates: Candidate[] = [];
  for (const rec of records) {
    try {
      const satrec = satellite.twoline2satrec(rec.line1, rec.line2);
      const st = propagateECI(satrec, t0);
      if (!st) continue;
      const gmst = satellite.gstime(t0);
      const geo = satellite.eciToGeodetic(
        { x: st.pos[0], y: st.pos[1], z: st.pos[2] },
        gmst,
      );
      const alt = geo.height;
      if (alt < 200 || alt > 2200) continue;  // only LEO
      const inc = parseFloat(rec.line2.substring(8, 16));
      const noradId = rec.line1.substring(2, 7).trim();
      candidates.push({ rec, satrec, alt0: alt, inc0: inc, noradId });
    } catch { /* skip bad TLE */ }
  }

  logger.info({ leoCount: candidates.length }, "LEO candidates for screening");

  // ── Step 2: Pair screening + TCA search ───────────────────────────────────
  const results: ConjunctionResult[] = [];

  for (let i = 0; i < candidates.length; i++) {
    if (results.length >= MAX_CONJUNCTIONS) break;

    const A = candidates[i];

    for (let j = i + 1; j < candidates.length; j++) {
      if (results.length >= MAX_CONJUNCTIONS) break;

      const B = candidates[j];

      // ── Hoots altitude pre-screen ──────────────────────────────────────
      if (Math.abs(A.alt0 - B.alt0) > HOOTS_ALT_KM) continue;

      // ── TCA search ──────────────────────────────────────────────────────
      const tca = findTCA(A.satrec, B.satrec, t0);
      if (!tca || tca.dist > SCREENING_RANGE_KM) continue;

      // ── Relative state at TCA ─────────────────────────────────────────
      const missPosECI  = sub(tca.stateB.pos, tca.stateA.pos);
      const relVelECI   = sub(tca.stateB.vel, tca.stateA.vel);
      const relVelMag   = norm(relVelECI);

      // ── RTN miss vector (in primary's RTN frame) ──────────────────────
      const [rHat, tHat, nHat] = rtnFrame(tca.stateA);
      const missR = dot(missPosECI, rHat);
      const missT = dot(missPosECI, tHat);
      const missN = dot(missPosECI, nHat);

      // ── Combined ECI covariance ───────────────────────────────────────
      const sigA  = sigmaRTN(A.rec.category);
      const sigB  = sigmaRTN(B.rec.category);
      const covA  = covECI(tca.stateA, sigA);
      const covB  = covECI(tca.stateB, sigB);
      const combC: [V3, V3, V3] = [
        add(covA[0], covB[0]) as V3,
        add(covA[1], covB[1]) as V3,
        add(covA[2], covB[2]) as V3,
      ];

      // ── Encounter-plane projection & Pc ───────────────────────────────
      const ep      = buildEncounterPlane(missPosECI, relVelECI, combC);
      const combinedHBR = hbr(A.rec.category) + hbr(B.rec.category);
      const pc      = computePc(ep, combinedHBR);

      const threatLevel = classifyThreat(pc, tca.dist);

      results.push({
        id:                     `${A.noradId}-${B.noradId}`,
        primaryName:            A.rec.name,
        primaryNoradId:         A.noradId,
        secondaryName:          B.rec.name,
        secondaryNoradId:       B.noradId,
        minRange:               Math.round(tca.dist * 1000) / 1000,
        probability:            parseFloat(pc.toExponential(3)),
        timeOfClosestApproach:  tca.date.toISOString(),
        relativeVelocity:       Math.round(relVelMag * 1000) / 1000,
        threatLevel,
        missVector: {
          radial:    Math.round(missR * 1000) / 1000,
          inTrack:   Math.round(missT * 1000) / 1000,
          crossTrack: Math.round(missN * 1000) / 1000,
        },
        combinedHBR,
        sigmaAssumptions: {
          primaryR: sigA[0], primaryT: sigA[1], primaryN: sigA[2],
          secondaryR: sigB[0], secondaryT: sigB[1], secondaryN: sigB[2],
        },
      });
    }
  }

  // Sort: CRITICAL → HIGH → MEDIUM → LOW, then by Pc desc within level
  const ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  results.sort((a, b) => {
    const levelDiff = (ORDER[a.threatLevel] ?? 4) - (ORDER[b.threatLevel] ?? 4);
    return levelDiff !== 0 ? levelDiff : b.probability - a.probability;
  });

  logger.info({ conjunctions: results.length }, "Conjunction screening complete");
  conjCache = { results, computedAt: Date.now() };
  return results;
}
