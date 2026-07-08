import { useEffect, useRef, Component, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// WebGL detection
// ─────────────────────────────────────────────────────────────────────────────
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error boundary — catches Three.js / R3F crashes
// ─────────────────────────────────────────────────────────────────────────────
interface Props {
  fallback: ReactNode;
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export class WebGLErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    logger.warn("WebGL error caught by boundary:", err);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const logger = { warn: (...a: unknown[]) => console.warn(...a) };

// ─────────────────────────────────────────────────────────────────────────────
// 2-D canvas globe fallback — draws Earth + satellite dots
// ─────────────────────────────────────────────────────────────────────────────
interface Sat {
  lat: number;
  lon: number;
  alt: number;
  category: string;
  name: string;
  noradId: string;
}

interface CatMeta {
  color: string;
}

interface FallbackGlobeProps {
  satellites: Sat[];
  categories: CatMeta[];
  onSelect: (id: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  stations: "#00ff88",
  starlink: "#4fc3f7",
  gps: "#ffd700",
  weather: "#ce93d8",
  military: "#ef5350",
  debris: "#ff6b35",
  active: "#80cbc4",
};

export function FallbackGlobe({ satellites, onSelect }: FallbackGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const satsRef = useRef(satellites);
  satsRef.current = satellites;

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Click handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const r = Math.min(cx, cy) * 0.72;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const rotation = (Date.now() / 30000) * Math.PI * 2;

      // Find nearest satellite to click
      let best: Sat | null = null;
      let bestDist = 12;
      for (const sat of satsRef.current) {
        const lonRad = (sat.lon * Math.PI) / 180 + rotation;
        const latRad = (sat.lat * Math.PI) / 180;
        const scale = 1 + sat.alt / 20000;
        const sr = r * scale;
        const x = cx + sr * Math.cos(latRad) * Math.cos(lonRad);
        const y = cy - sr * Math.sin(latRad);
        const d = Math.hypot(mx - x, my - y);
        if (d < bestDist) { bestDist = d; best = sat; }
      }
      if (best) onSelectRef.current(best.noradId);
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, []);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId: number;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.width = canvas.offsetWidth;
      const H = canvas.height = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const r = Math.min(cx, cy) * 0.72;
      const rotation = (Date.now() / 30000) * Math.PI * 2;

      // Stars
      ctx.fillStyle = "#02040a";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      // Use a seeded pseudo-random for deterministic stars
      for (let i = 0; i < 300; i++) {
        const sx = ((Math.sin(i * 127.1) * 0.5 + 0.5) * W);
        const sy = ((Math.sin(i * 311.7) * 0.5 + 0.5) * H);
        const ss = Math.sin(i * 74.3) * 0.5 + 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fill();
      }

      // Atmosphere glow
      const grad = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.08);
      grad.addColorStop(0, "rgba(0,200,255,0.08)");
      grad.addColorStop(1, "rgba(0,200,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();

      // Earth body
      const earthGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      earthGrad.addColorStop(0, "#0a1628");
      earthGrad.addColorStop(0.5, "#051020");
      earthGrad.addColorStop(1, "#020810");
      ctx.fillStyle = earthGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Grid lines
      ctx.strokeStyle = "rgba(0,240,255,0.06)";
      ctx.lineWidth = 0.5;
      for (let lat = -60; lat <= 60; lat += 30) {
        const latR = (lat * Math.PI) / 180;
        const yr = cy - r * Math.sin(latR);
        const xr = r * Math.cos(latR);
        ctx.beginPath();
        ctx.arc(cx, yr, xr, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let lon = 0; lon < 360; lon += 30) {
        const lonR = (lon * Math.PI) / 180 + rotation;
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 5) {
          const latR = (lat * Math.PI) / 180;
          const x = cx + r * Math.cos(latR) * Math.cos(lonR);
          const y = cy - r * Math.sin(latR);
          lat === -90 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Earth edge glow
      ctx.strokeStyle = "rgba(0,180,255,0.15)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Clip to globe (so sats behind Earth appear dimmed)
      ctx.save();

      // Draw satellites
      for (const sat of satsRef.current) {
        const lonRad = (sat.lon * Math.PI) / 180 + rotation;
        const latRad = (sat.lat * Math.PI) / 180;
        const altScale = 1 + sat.alt / 20000;
        const sr = r * altScale;
        const x = cx + sr * Math.cos(latRad) * Math.cos(lonRad);
        const y = cy - sr * Math.sin(latRad);
        const color = CATEGORY_COLORS[sat.category] ?? "#ffffff";

        // Only draw front hemisphere (cos(lon - rotation) > 0 roughly)
        const cosLon = Math.cos(lonRad);
        const alpha = cosLon > 0 ? 0.9 : 0.15;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = cosLon > 0 ? 4 : 0;
        ctx.beginPath();
        ctx.arc(x, y, sat.alt > 5000 ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();

      // HUD overlay corners
      ctx.strokeStyle = "rgba(0,240,255,0.3)";
      ctx.lineWidth = 1;
      const cs = 16;
      [[cx - r - 8, cy - r - 8], [cx + r + 8, cy - r - 8],
       [cx - r - 8, cy + r + 8], [cx + r + 8, cy + r + 8]].forEach(([bx, by], i) => {
        const dx = i % 2 === 0 ? 1 : -1;
        const dy = i < 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(bx, by + dy * cs);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + dx * cs, by);
        ctx.stroke();
      });

      rafId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }}
    />
  );
}
