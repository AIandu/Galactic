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

const _logger = { warn: (...a: unknown[]) => console.warn(...a) };

export class WebGLErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(err: unknown) { _logger.warn("WebGL error caught:", err); }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-D canvas globe fallback
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
  id?: string;
  color: string;
}

interface FallbackGlobeProps {
  satellites: Sat[];
  categories: CatMeta[];
  selectedNoradId?: string | null;
  onSelect: (id: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  stations: "#00ff88",
  starlink:  "#4fc3f7",
  gps:       "#ffd700",
  weather:   "#ce93d8",
  military:  "#ef5350",
  debris:    "#ff6b35",
  active:    "#80cbc4",
};

/** Project a lat/lon/alt satellite to 2-D canvas coords */
function satToXY(
  sat: { lat: number; lon: number; alt: number },
  cx: number, cy: number, r: number, rotation: number,
): { x: number; y: number; cosLon: number } {
  const lonRad = (sat.lon * Math.PI) / 180 + rotation;
  const latRad = (sat.lat * Math.PI) / 180;
  const altScale = 1 + sat.alt / 20000;
  const sr = r * altScale;
  return {
    x: cx + sr * Math.cos(latRad) * Math.cos(lonRad),
    y: cy - sr * Math.sin(latRad),
    cosLon: Math.cos(lonRad),
  };
}

export function FallbackGlobe({ satellites, onSelect, selectedNoradId }: FallbackGlobeProps) {
  const canvasRef         = useRef<HTMLCanvasElement>(null);
  const satsRef           = useRef(satellites);
  const selectedIdRef     = useRef(selectedNoradId);
  const onSelectRef       = useRef(onSelect);
  const animOffsetRef     = useRef(0); // for glow ring animation

  satsRef.current     = satellites;
  selectedIdRef.current = selectedNoradId ?? null;
  onSelectRef.current = onSelect;

  // ── Click handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const r  = Math.min(cx, cy) * 0.72;
      const rotation = (Date.now() / 30000) * Math.PI * 2;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let best: Sat | null = null;
      let bestDist = 16; // px hit-radius

      for (const sat of satsRef.current) {
        const { x, y, cosLon } = satToXY(sat, cx, cy, r, rotation);
        if (cosLon < -0.2) continue; // back hemisphere — skip
        const d = Math.hypot(mx - x, my - y);
        if (d < bestDist) { bestDist = d; best = sat; }
      }

      if (best) onSelectRef.current(best.noradId);
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, []);

  // ── Draw loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId: number;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const W = canvas.width  = canvas.offsetWidth;
      const H = canvas.height = canvas.offsetHeight;
      const cx = W / 2;
      const cy = H / 2;
      const r  = Math.min(cx, cy) * 0.72;

      const now      = Date.now();
      const rotation = (now / 30000) * Math.PI * 2;
      animOffsetRef.current = (now / 1000); // seconds for sin/cos animation

      // ── Background ────────────────────────────────────────────────────────
      ctx.fillStyle = "#02040a";
      ctx.fillRect(0, 0, W, H);

      // Stars (deterministic)
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      for (let i = 0; i < 300; i++) {
        const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * W;
        const sy = (Math.sin(i * 311.7) * 0.5 + 0.5) * H;
        const ss = Math.sin(i * 74.3) * 0.5 + 0.8;
        ctx.beginPath();
        ctx.arc(sx, sy, ss, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Atmosphere glow ───────────────────────────────────────────────────
      const atmoGrad = ctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r * 1.1);
      atmoGrad.addColorStop(0, "rgba(0,200,255,0.10)");
      atmoGrad.addColorStop(1, "rgba(0,200,255,0)");
      ctx.fillStyle = atmoGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // ── Earth body ────────────────────────────────────────────────────────
      const earthGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      earthGrad.addColorStop(0, "#0a1628");
      earthGrad.addColorStop(0.5, "#051020");
      earthGrad.addColorStop(1, "#020810");
      ctx.fillStyle = earthGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // ── Grid lines ────────────────────────────────────────────────────────
      ctx.strokeStyle = "rgba(0,240,255,0.06)";
      ctx.lineWidth = 0.5;
      for (let lat = -60; lat <= 60; lat += 30) {
        const latR = (lat * Math.PI) / 180;
        const yr   = cy - r * Math.sin(latR);
        const xr   = r * Math.cos(latR);
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

      // ── Earth rim glow ────────────────────────────────────────────────────
      ctx.strokeStyle = "rgba(0,180,255,0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // ── Satellites ────────────────────────────────────────────────────────
      const selectedId = selectedIdRef.current;
      const t = animOffsetRef.current;

      for (const sat of satsRef.current) {
        if (sat.noradId === selectedId) continue; // draw selected last (on top)
        const { x, y, cosLon } = satToXY(sat, cx, cy, r, rotation);
        const color = CATEGORY_COLORS[sat.category] ?? "#ffffff";
        const alpha = cosLon > 0 ? 0.9 : 0.12;
        const dotR  = sat.alt > 5000 ? 2.5 : 1.8;

        ctx.globalAlpha = alpha;
        ctx.fillStyle   = color;
        ctx.shadowColor = color;
        ctx.shadowBlur  = cosLon > 0 ? 5 : 0;
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;

      // ── Selected satellite highlight ──────────────────────────────────────
      if (selectedId) {
        const selSat = satsRef.current.find(s => s.noradId === selectedId);
        if (selSat) {
          const { x, y, cosLon } = satToXY(selSat, cx, cy, r, rotation);
          const color = CATEGORY_COLORS[selSat.category] ?? "#00f0ff";
          const isVisible = cosLon > -0.1;
          const baseAlpha = isVisible ? 1 : 0.4;

          // Pulsing outer glow rings (2 of them)
          for (let ring = 0; ring < 2; ring++) {
            const phase  = ring * Math.PI;
            const pulse  = Math.sin(t * 3 + phase);
            const ringR  = 10 + ring * 8 + pulse * 4;
            const alpha  = baseAlpha * (0.35 - ring * 0.1 + pulse * 0.1);

            ctx.globalAlpha = Math.max(0.02, alpha);
            ctx.strokeStyle = color;
            ctx.lineWidth   = ring === 0 ? 1.5 : 1;
            ctx.shadowColor = color;
            ctx.shadowBlur  = 8;
            ctx.beginPath();
            ctx.arc(x, y, ringR, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.shadowBlur = 0;

          // Crosshair tick marks
          const tick = 7 + Math.sin(t * 3) * 2;
          ctx.globalAlpha = baseAlpha * 0.7;
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1;
          const offsets = [[-tick - 4, 0, -4, 0], [tick + 4, 0, 4, 0],
                           [0, -tick - 4, 0, -4], [0, tick + 4, 0, 4]];
          for (const [x1, y1, x2, y2] of offsets) {
            ctx.beginPath();
            ctx.moveTo(x + x1, y + y1);
            ctx.lineTo(x + x2, y + y2);
            ctx.stroke();
          }

          // Bright centre dot
          ctx.globalAlpha = baseAlpha;
          ctx.fillStyle   = "#ffffff";
          ctx.shadowColor = color;
          ctx.shadowBlur  = 12;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle   = color;
          ctx.shadowBlur  = 6;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur  = 0;

          // ── Name label (edge-clamped) ────────────────────────────────────
          if (isVisible) {
            const label = selSat.name || `NORAD ${selSat.noradId}`;
            const sub   = `${selSat.noradId} · ${selSat.category.toUpperCase()}`;

            ctx.font = "bold 11px 'Courier New', monospace";
            const labelW = ctx.measureText(label).width;
            ctx.font = "9px 'Courier New', monospace";
            const subW   = ctx.measureText(sub).width;

            const boxW  = Math.max(labelW, subW) + 12;
            const boxH  = 32; // label line + sub line + padding
            const PAD   = 8;  // min distance from canvas edge

            // Prefer right of dot; flip left if it would overflow right edge
            let lx = x + 14;
            if (lx + boxW > W - PAD) lx = x - boxW - 10;
            lx = Math.max(PAD, lx);

            // Prefer above dot centre; shift down if too close to top
            let ly = y - 8;
            if (ly - 16 < PAD) ly = y + 20;
            if (ly + boxH - 14 > H - PAD) ly = H - PAD - boxH + 14;

            // Background pill
            ctx.globalAlpha = 0.88;
            ctx.fillStyle   = "#020810";
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1;
            roundRect(ctx, lx - 4, ly - 16, boxW, boxH, 3);
            ctx.fill();
            ctx.stroke();

            // Primary label
            ctx.globalAlpha = 1;
            ctx.font        = "bold 11px 'Courier New', monospace";
            ctx.fillStyle   = "#ffffff";
            ctx.fillText(label, lx, ly);

            // Sub-label: NORAD ID · category
            ctx.font        = "9px 'Courier New', monospace";
            ctx.fillStyle   = color;
            ctx.globalAlpha = 0.9;
            ctx.fillText(sub, lx, ly + 13);
          }

          ctx.globalAlpha = 1;
          ctx.shadowBlur  = 0;
        }
      }

      // ── HUD corner brackets ───────────────────────────────────────────────
      ctx.strokeStyle = "rgba(0,240,255,0.3)";
      ctx.lineWidth   = 1;
      const cs = 16;
      [[cx - r - 8, cy - r - 8], [cx + r + 8, cy - r - 8],
       [cx - r - 8, cy + r + 8], [cx + r + 8, cy + r + 8]].forEach(([bx, by], i) => {
        const dx = i % 2 === 0 ? 1 : -1;
        const dy = i < 2      ? 1 : -1;
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

// ── helper: rounded rect (Canvas 2D doesn't have native roundRect in all envs)
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
