import { useEffect, useRef } from "react";
import { NODE_H, NODE_W, type Layout } from "@/lib/layout";
import type { TreeRenderer } from "./renderer";
import { COLORS } from "./theme";

const W = 200;
const H = 130;

/** Bản đồ thu nhỏ để định vị trên cây lớn (FR-09). */
export function Minimap({ layout, renderer, tick }: { layout: Layout | null; renderer: TreeRenderer | null; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const scaleRef = useRef({ s: 1, ox: 0, oy: 0 });

  // vẽ nền (các nút) một lần mỗi khi layout đổi
  useEffect(() => {
    if (!layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement("canvas");
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const b = layout.bounds;
    const s = Math.min((W - 8) / (b.maxX - b.minX), (H - 8) / (b.maxY - b.minY));
    const ox = (W - (b.maxX - b.minX) * s) / 2 - b.minX * s;
    const oy = (H - (b.maxY - b.minY) * s) / 2 - b.minY * s;
    scaleRef.current = { s, ox, oy };
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, W, H);
    for (const n of layout.nodes) {
      ctx.fillStyle = n.gender === "M" ? COLORS.M.stroke : COLORS.F.stroke;
      ctx.fillRect(n.x * s + ox, n.y * s + oy, Math.max(1, NODE_W * s), Math.max(1, NODE_H * s));
    }
    base.current = c;
  }, [layout]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !base.current || !renderer) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base.current, 0, 0);
    ctx.scale(dpr, dpr);
    const { s, ox, oy } = scaleRef.current;
    const tl = renderer.toWorld(0, 0);
    const br = renderer.toWorld(renderer.width, renderer.height);
    ctx.strokeStyle = COLORS.badge;
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(127,29,29,0.08)";
    const rx = tl.x * s + ox;
    const ry = tl.y * s + oy;
    ctx.fillRect(rx, ry, (br.x - tl.x) * s, (br.y - tl.y) * s);
    ctx.strokeRect(rx, ry, (br.x - tl.x) * s, (br.y - tl.y) * s);
  }, [tick, layout, renderer]);

  const navigate = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!renderer || (e.type === "pointermove" && e.buttons !== 1)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { s, ox, oy } = scaleRef.current;
    const wx = (e.clientX - rect.left - ox) / s;
    const wy = (e.clientY - rect.top - oy) / s;
    const k = renderer.t.k;
    renderer.setTransform({ k, x: renderer.width / 2 - wx * k, y: renderer.height / 2 - wy * k });
  };

  return (
    <canvas
      ref={ref}
      style={{ width: W, height: H }}
      className="cursor-crosshair rounded-lg border border-stone-300 bg-white shadow-md touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        navigate(e);
      }}
      onPointerMove={navigate}
      aria-label="Bản đồ thu nhỏ"
    />
  );
}
