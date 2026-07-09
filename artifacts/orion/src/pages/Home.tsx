import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import * as satellite from "satellite.js";
import {
  useListSatellites,
  useGetStats,
  useListCategories,
  useGetSatellite,
  getListSatellitesQueryKey,
  getGetStatsQueryKey,
  getGetSatelliteQueryKey,
} from "@workspace/api-client-react";
import { Activity, Layers, Crosshair, Target, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { isWebGLAvailable, WebGLErrorBoundary, FallbackGlobe } from "@/components/WebGLFallback";

// ─── coordinate helper ────────────────────────────────────────────────────────

function getPosition(lat: number, lon: number, altKm: number): [number, number, number] {
  const R_EARTH = 6371;
  const SCALE   = 10 / R_EARTH;
  const r       = (R_EARTH + altKm) * SCALE;
  const latRad  = lat * (Math.PI / 180);
  const lonRad  = -lon * (Math.PI / 180);
  return [
    r * Math.cos(latRad) * Math.cos(lonRad),
    r * Math.sin(latRad),
    r * Math.cos(latRad) * Math.sin(lonRad),
  ];
}

// ─── types ────────────────────────────────────────────────────────────────────

interface SatItem {
  lat: number; lon: number; alt: number;
  category: string; noradId: string; name: string;
}
interface CatItem { id: string; color: string; label: string; count: number; }

// ─── Earth (no self-rotation — parent group handles it) ───────────────────────

function EarthMesh() {
  return (
    <mesh>
      <sphereGeometry args={[10, 64, 64]} />
      <meshStandardMaterial
        color="#050914" emissive="#020815"
        roughness={0.9} metalness={0.1}
        wireframe wireframeLinewidth={0.2}
        transparent opacity={0.15}
      />
      <mesh>
        <sphereGeometry args={[9.95, 64, 64]} />
        <meshBasicMaterial color="#020408" />
      </mesh>
    </mesh>
  );
}

function Atmosphere() {
  return (
    <mesh>
      <sphereGeometry args={[10.2, 64, 64]} />
      <meshBasicMaterial
        color="#00f0ff" transparent opacity={0.03}
        side={THREE.BackSide} blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ─── Satellites instanced mesh (no self-rotation — parent group handles it) ───

function SatelliteDots({
  satellites, categories, selectedNoradId, onSelect,
}: {
  satellites: SatItem[];
  categories: CatItem[];
  selectedNoradId: string | null;
  onSelect: (id: string) => void;
}) {
  const meshRef  = useRef<THREE.InstancedMesh>(null);
  const dummy    = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach(c => { m[c.id] = c.color; });
    return m;
  }, [categories]);

  useEffect(() => {
    if (!meshRef.current) return;
    satellites.forEach((sat, i) => {
      const [x, y, z] = getPosition(sat.lat, sat.lon, sat.alt);
      dummy.position.set(x, y, z);
      dummy.lookAt(0, 0, 0);
      // Hide selected instance — SelectionMarker renders it instead
      dummy.scale.setScalar(sat.noradId === selectedNoradId ? 0 : 1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
      colorObj.set(colorMap[sat.category] ?? "#ffffff");
      meshRef.current!.setColorAt(i, colorObj);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [satellites, colorMap, selectedNoradId, dummy, colorObj]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, satellites.length || 1]}
      onClick={e => {
        e.stopPropagation();
        if (e.instanceId !== undefined && satellites[e.instanceId]) {
          onSelect(satellites[e.instanceId].noradId);
        }
      }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = "crosshair"; }}
      onPointerOut={e  => { e.stopPropagation(); document.body.style.cursor = "default";   }}
    >
      <tetrahedronGeometry args={[0.08]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ─── SelectionMarker (lives inside the same rotating group — always in sync) ──

function SelectionMarker({ sat, catColor }: { sat: SatItem; catColor: string }) {
  const ringRef  = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const glowRef  = useRef<THREE.Mesh>(null);

  const pos   = getPosition(sat.lat, sat.lon, sat.alt);
  const color = useMemo(() => new THREE.Color(catColor), [catColor]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + 0.4 * Math.sin(t * 3));
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.9 - 0.3 * Math.sin(t * 3);
    }
    if (ring2Ref.current) {
      ring2Ref.current.scale.setScalar(1.6 + 0.6 * Math.sin(t * 2 + 1));
      (ring2Ref.current.material as THREE.MeshBasicMaterial).opacity = 0.35 - 0.2 * Math.sin(t * 2 + 1);
    }
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.15 * Math.sin(t * 4);
    }
  });

  return (
    <group position={pos}>
      {/* Solid bright core */}
      <mesh>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* Coloured glow halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.55, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.28}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Pulsing inner torus ring */}
      <mesh ref={ringRef}>
        <torusGeometry args={[0.45, 0.025, 8, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.9}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Slower, wider outer torus ring */}
      <mesh ref={ring2Ref}>
        <torusGeometry args={[0.45, 0.015, 8, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.3}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Local point light — illuminates nearby dots */}
      <pointLight color={catColor} intensity={3} distance={4} decay={2} />
    </group>
  );
}

// ─── OrbitalArc — SGP4-propagated trajectory + ground track ──────────────────

interface TleData { line1: string; line2: string; }

function OrbitalArc({ tleData, catColor }: { tleData: TleData; catColor: string }) {
  const { arcLine, groundLine } = useMemo(() => {
    try {
      const satrec = satellite.twoline2satrec(tleData.line1, tleData.line2);
      const now    = Date.now();
      const STEPS  = 96;   // 96 × 1-min = 96 min ≈ one full LEO orbit
      const R      = 6371; // Earth radius km
      const SCALE  = 10 / R;
      const c      = new THREE.Color(catColor);

      const arcPos: number[] = [], arcCol: number[] = [];
      const gndPos: number[] = [], gndCol: number[] = [];

      for (let i = 0; i <= STEPS; i++) {
        const t  = new Date(now + i * 60_000);
        const pv = satellite.propagate(satrec, t);
        if (!pv || typeof pv.position === "boolean" || !pv.position) continue;

        const p    = pv.position as satellite.EciVec3<number>;
        const gmst = satellite.gstime(t);
        const geo  = satellite.eciToGeodetic({ x: p.x, y: p.y, z: p.z }, gmst);
        const lat  = satellite.degreesLat(geo.latitude);
        const lon  = satellite.degreesLong(geo.longitude);
        const alt  = geo.height;

        // Scene position (orbit altitude)
        const r      = (R + alt) * SCALE;
        const latRad = (lat * Math.PI) / 180;
        const lonRad = (-lon * Math.PI) / 180;
        const x = r * Math.cos(latRad) * Math.cos(lonRad);
        const y = r * Math.sin(latRad);
        const z = r * Math.cos(latRad) * Math.sin(lonRad);
        arcPos.push(x, y, z);

        // Fade: full at i=0 (current pos), transparent at i=STEPS
        const a = Math.pow(1 - i / STEPS, 0.6);
        arcCol.push(c.r * a, c.g * a, c.b * a);

        // Ground track — project to just above Earth surface
        const gr = 10.05;
        gndPos.push(
          gr * Math.cos(latRad) * Math.cos(lonRad),
          gr * Math.sin(latRad),
          gr * Math.cos(latRad) * Math.sin(lonRad),
        );
        const ga = a * 0.2;
        gndCol.push(c.r * ga, c.g * ga, c.b * ga);
      }

      const count = arcPos.length / 3;
      if (count < 2) return { arcLine: null, groundLine: null };

      const makeLine = (pos: number[], col: number[]) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute("color",    new THREE.Float32BufferAttribute(col, 3));
        return new THREE.Line(
          g,
          new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true,
            blending: THREE.AdditiveBlending, depthWrite: false,
          }),
        );
      };

      return { arcLine: makeLine(arcPos, arcCol), groundLine: makeLine(gndPos, gndCol) };
    } catch {
      return { arcLine: null, groundLine: null };
    }
  }, [tleData.line1, tleData.line2, catColor]);

  // Dispose Three.js objects when deps change or component unmounts
  useEffect(() => {
    return () => {
      arcLine?.geometry.dispose();
      (arcLine?.material as THREE.Material | undefined)?.dispose();
      groundLine?.geometry.dispose();
      (groundLine?.material as THREE.Material | undefined)?.dispose();
    };
  }, [arcLine, groundLine]);

  return (
    <>
      {arcLine    && <primitive object={arcLine} />}
      {groundLine && <primitive object={groundLine} />}
    </>
  );
}

// ─── Single rotating parent — Earth, dots, marker, and arc share one transform

function RotatingScene({
  satellites, categories, selectedNoradId, selectedSatItem, selectedCatColor,
  tleData, onSelect,
}: {
  satellites: SatItem[];
  categories: CatItem[];
  selectedNoradId: string | null;
  selectedSatItem: SatItem | null;
  selectedCatColor: string;
  tleData: TleData | null;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => { if (groupRef.current) groupRef.current.rotation.y += 0.0002; });

  return (
    <group ref={groupRef}>
      <EarthMesh />
      <SatelliteDots
        satellites={satellites}
        categories={categories}
        selectedNoradId={selectedNoradId}
        onSelect={onSelect}
      />
      {tleData && (
        <OrbitalArc tleData={tleData} catColor={selectedCatColor} />
      )}
      {selectedSatItem && (
        <SelectionMarker sat={selectedSatItem} catColor={selectedCatColor} />
      )}
    </group>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeCategory, setActiveCategory]   = useState<string | null>(null);
  const [selectedNoradId, setSelectedNoradId] = useState<string | null>(null);

  const { data: stats      } = useGetStats({ query: { refetchInterval: 10000, queryKey: getGetStatsQueryKey() } });
  const { data: categories } = useListCategories();

  const listParams = { category: activeCategory || undefined, limit: 2000 };
  const { data: satellites } = useListSatellites(listParams, {
    query: { staleTime: 30000, refetchInterval: 30000, queryKey: getListSatellitesQueryKey(listParams) },
  });

  const { data: selectedSat, isLoading: selectedSatLoading } = useGetSatellite(
    selectedNoradId || "",
    { query: { enabled: !!selectedNoradId, queryKey: getGetSatelliteQueryKey(selectedNoradId || "") } },
  );

  const webglOk = isWebGLAvailable();

  const selectedSatItem  = selectedNoradId
    ? (satellites?.find(s => s.noradId === selectedNoradId) ?? null)
    : null;
  const selectedCatColor = categories?.find(c => c.id === selectedSatItem?.category)?.color ?? "#00f0ff";
  const tleData: TleData | null = selectedSat?.tleLine1 && selectedSat?.tleLine2
    ? { line1: selectedSat.tleLine1, line2: selectedSat.tleLine2 }
    : null;

  return (
    <Shell>
      <div className="absolute inset-0 z-0 bg-[#02040a]">
        {webglOk ? (
          <WebGLErrorBoundary
            fallback={
              <FallbackGlobe
                satellites={satellites ?? []}
                categories={categories ?? []}
                selectedNoradId={selectedNoradId}
                selectedSatTle={tleData}
                onSelect={setSelectedNoradId}
              />
            }
          >
            <Canvas camera={{ position: [0, 15, 30], fov: 45 }}>
              <color attach="background" args={["#02040a"]} />
              <ambientLight intensity={0.2} />
              <directionalLight position={[50, 20, 10]} intensity={1.5} />
              <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
              <OrbitControls enablePan={false} minDistance={12} maxDistance={60} />
              <Atmosphere />
              {satellites && categories && (
                <RotatingScene
                  satellites={satellites}
                  categories={categories}
                  selectedNoradId={selectedNoradId}
                  selectedSatItem={selectedSatItem}
                  selectedCatColor={selectedCatColor}
                  tleData={tleData}
                  onSelect={setSelectedNoradId}
                />
              )}
            </Canvas>
          </WebGLErrorBoundary>
        ) : (
          <FallbackGlobe
            satellites={satellites ?? []}
            categories={categories ?? []}
            selectedNoradId={selectedNoradId}
            selectedSatTle={tleData}
            onSelect={setSelectedNoradId}
          />
        )}

        {/* HUD crosshairs overlay */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20">
          <div className="w-[800px] h-[800px] border border-primary rounded-full" />
          <div className="absolute w-[820px] h-[1px] bg-primary" />
          <div className="absolute h-[820px] w-[1px] bg-primary" />
          <div className="absolute w-4 h-4 border border-primary rounded-full" />
        </div>
      </div>

      {/* Stats HUD — top-left */}
      <div className="absolute top-6 left-6 z-10 w-72 flex flex-col gap-6 pointer-events-none">
        <div className="bg-card/80 border border-primary/30 p-5 backdrop-blur-md shadow-[0_0_20px_rgba(0,240,255,0.05)] pointer-events-auto">
          <div className="text-xs text-primary font-mono mb-2 tracking-widest flex items-center gap-2">
            <Activity className="w-4 h-4" /> FLEET TELEMETRY
          </div>
          <div className="text-4xl font-bold font-mono tracking-tighter text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
            {stats?.totalTracked.toLocaleString() || "---"}
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Total Objects Tracked</div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="border-l-2 border-primary/50 pl-2">
              <div className="text-xl font-mono text-white">{stats?.activeCount.toLocaleString() || "-"}</div>
              <div className="text-[9px] text-primary/70 uppercase tracking-widest">Active Payloads</div>
            </div>
            <div className="border-l-2 border-destructive/50 pl-2">
              <div className="text-xl font-mono text-white">{stats?.debrisCount.toLocaleString() || "-"}</div>
              <div className="text-[9px] text-destructive/70 uppercase tracking-widest">Tracked Debris</div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-primary/20">
            <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-widest">System Threat Level</div>
            <div className={`text-sm font-bold tracking-[0.2em] px-3 py-1.5 inline-flex items-center gap-2 border ${
              stats?.threatLevel === "NOMINAL"  ? "text-green-400 border-green-400/30 bg-green-400/10 shadow-[0_0_10px_rgba(74,222,128,0.2)]" :
              stats?.threatLevel === "ELEVATED" ? "text-amber-400 border-amber-400/30 bg-amber-400/10 shadow-[0_0_10px_rgba(251,191,36,0.2)]" :
              stats?.threatLevel === "CRITICAL" ? "text-destructive border-destructive/30 bg-destructive/10 shadow-[0_0_10px_rgba(255,0,0,0.2)] animate-pulse" :
              "text-muted-foreground border-border bg-muted/20"
            }`}>
              {stats?.threatLevel === "CRITICAL" && <AlertCircle className="w-4 h-4" />}
              {stats?.threatLevel || "ANALYZING"}
            </div>
          </div>
        </div>

        <div className="bg-card/80 border border-primary/30 p-5 backdrop-blur-md pointer-events-auto">
          <div className="text-xs text-primary font-mono mb-4 tracking-widest flex items-center gap-2">
            <Layers className="w-4 h-4" /> CATEGORY FILTERS
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              onClick={() => setActiveCategory(null)}
              className={`flex items-center justify-between text-xs font-mono p-1.5 border hover:bg-white/5 transition-colors ${
                !activeCategory ? "border-primary/50 bg-primary/10" : "border-transparent opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 bg-white/50" />
                <span className="uppercase tracking-widest">ALL OBJECTS</span>
              </div>
            </button>
            {categories?.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`flex items-center justify-between text-xs font-mono p-1.5 border hover:bg-white/5 transition-colors ${
                  activeCategory === c.id ? "bg-white/5" : "border-transparent opacity-60 hover:opacity-100"
                }`}
                style={activeCategory === c.id ? { borderColor: c.color } : {}}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5" style={{ backgroundColor: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                  <span className="uppercase tracking-widest">{c.label}</span>
                </div>
                <span className="text-muted-foreground">{c.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel — slides in from right */}
      <div className={`absolute top-0 right-0 h-full w-96 bg-card/95 backdrop-blur-xl border-l border-primary/30 transition-transform duration-500 transform ${
        selectedNoradId ? "translate-x-0" : "translate-x-full"
      } pointer-events-auto flex flex-col z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)]`}>
        {selectedSatLoading ? (
          <div className="p-8 flex flex-col items-center justify-center h-full gap-4 text-primary">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="text-xs font-mono tracking-widest animate-pulse">ACQUIRING TELEMETRY...</div>
          </div>
        ) : selectedSat ? (
          <>
            <div className="p-6 border-b border-primary/20 flex items-start justify-between bg-primary/5">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 font-mono border border-primary/50 tracking-widest shadow-[inset_0_0_5px_rgba(0,240,255,0.2)]">
                    NORAD: {selectedSat.noradId}
                  </span>
                  {selectedSat.isDebris && (
                    <span className="text-[10px] bg-destructive/20 text-destructive px-2 py-0.5 font-mono border border-destructive/50 tracking-widest">
                      DEBRIS
                    </span>
                  )}
                  {selectedSat.isActive && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 font-mono border border-green-500/50 tracking-widest">
                      ACTIVE
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold tracking-[0.1em] text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]">
                  {selectedSat.name}
                </h2>
                <div className="text-xs text-primary/70 font-mono mt-1 uppercase tracking-widest">
                  {categories?.find(c => c.id === selectedSat.category)?.label || selectedSat.category} CLASS
                </div>
              </div>
              <button
                onClick={() => setSelectedNoradId(null)}
                className="text-muted-foreground hover:text-primary p-2 border border-transparent hover:border-primary/30 transition-colors bg-black/20 shrink-0"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-8 font-mono overflow-y-auto">
              <div>
                <div className="text-[10px] text-primary mb-3 tracking-[0.2em] flex items-center gap-2 border-b border-primary/20 pb-2">
                  <Crosshair className="w-3.5 h-3.5" /> ORBITAL KINEMATICS
                </div>
                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                  {([
                    ["Altitude",    `${selectedSat.alt.toFixed(2)} km`],
                    ["Velocity",    `${selectedSat.velocity.toFixed(3)} km/s`],
                    ["Inclination", `${selectedSat.inclination.toFixed(2)}°`],
                    ["Period",      `${selectedSat.period.toFixed(1)} min`],
                    ["Apogee",      `${selectedSat.apogee.toFixed(1)} km`],
                    ["Perigee",     `${selectedSat.perigee.toFixed(1)} km`],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="bg-black/40 p-2 border border-white/5">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">{label}</div>
                      <div className="text-lg text-white">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-primary mb-3 tracking-[0.2em] flex items-center gap-2 border-b border-primary/20 pb-2">
                  <Target className="w-3.5 h-3.5" /> TRACKING DATA
                </div>
                <div className="grid grid-cols-2 gap-y-4 gap-x-4">
                  {([
                    ["Latitude",    `${selectedSat.lat.toFixed(4)}°`],
                    ["Longitude",   `${selectedSat.lon.toFixed(4)}°`],
                    ["RCS Class",   selectedSat.rcs || "UNKNOWN"],
                    ["Launch Year", selectedSat.launchYear || "UNKNOWN"],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label}>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-widest">{label}</div>
                      <div className="text-sm text-white mt-0.5">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-auto pt-6 border-t border-primary/20">
                <div className="text-[10px] text-primary mb-3 tracking-[0.2em]">TWO-LINE ELEMENT SET (RAW)</div>
                <div className="bg-black/80 p-3 border border-primary/30 text-[10px] leading-loose text-primary/80 whitespace-pre overflow-x-auto shadow-[inset_0_0_10px_rgba(0,0,0,1)]">
                  {selectedSat.tleLine1}{"\n"}{selectedSat.tleLine2}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Shell>
  );
}
