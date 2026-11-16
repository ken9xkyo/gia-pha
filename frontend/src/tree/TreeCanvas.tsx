import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { LNode } from "@/lib/layout";
import { TreeRenderer, type RenderState } from "./renderer";

export interface TreeCanvasHandle {
  renderer: TreeRenderer | null;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  focus: (id: number, flash?: boolean) => boolean;
}

export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  state: Partial<RenderState>;
  onNodeClick: (node: LNode, rect: ScreenRect) => void;
  onToggle: (node: LNode) => void;
  onBackground: () => void;
  onNameDoubleClick?: (node: LNode, rect: ScreenRect) => void;
  onViewChange?: () => void;
  onReady?: (r: TreeRenderer) => void;
}

/** Khung vẽ cây: kéo để di chuyển, cuộn/chụm hai ngón để phóng to thu nhỏ (FR-06). */
export const TreeCanvas = forwardRef<TreeCanvasHandle, Props>(function TreeCanvas(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TreeRenderer | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useImperativeHandle(ref, () => ({
    get renderer() {
      return rendererRef.current;
    },
    fit: () => rendererRef.current?.fit(),
    zoomIn: () => rendererRef.current?.zoomAt(1.25),
    zoomOut: () => rendererRef.current?.zoomAt(0.8),
    focus: (id, flash = true) => rendererRef.current?.focus(id, { flash }) ?? false,
  }));

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const r = new TreeRenderer(canvas);
    rendererRef.current = r;
    const off = r.onChange(() => propsRef.current.onViewChange?.());
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      r.resize(rect.width, rect.height);
    });
    ro.observe(wrap);
    propsRef.current.onReady?.(r);

    // ---- con trỏ: kéo, chụm, bấm -------------------------------------
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt: { x: number; y: number; t: number } | null = null;
    let moved = false;
    let pinch: { dist: number; cx: number; cy: number } | null = null;
    const local = (e: PointerEvent | MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        downAt = { ...p, t: performance.now() };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        moved = true;
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (!pointers.has(e.pointerId)) {
        const hit = r.hitTest(p.x, p.y);
        canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      const prev = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, p);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        r.panBy(cx - pinch.cx, cy - pinch.cy);
        if (pinch.dist > 0) r.zoomAt(dist / pinch.dist, cx, cy);
        pinch = { dist, cx, cy };
        return;
      }
      if (downAt && !moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 5) moved = true;
      if (moved) {
        canvas.style.cursor = "grabbing";
        r.panBy(p.x - prev.x, p.y - prev.y);
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = local(e);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) {
        canvas.style.cursor = "grab";
        if (!moved && downAt) click(p.x, p.y);
        downAt = null;
      }
    };
    const click = (x: number, y: number) => {
      const hit = r.hitTest(x, y);
      const cb = propsRef.current;
      if (!hit) return cb.onBackground();
      if (hit.type === "toggle") return cb.onToggle(hit.node);
      cb.onNodeClick(hit.node, r.nodeScreenRect(hit.node));
    };
    const onDbl = (e: MouseEvent) => {
      const p = local(e);
      const hit = r.hitTest(p.x, p.y);
      if (hit?.type === "name" && propsRef.current.onNameDoubleClick) {
        propsRef.current.onNameDoubleClick(hit.node, r.nodeScreenRect(hit.node));
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e);
      if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.5 && e.deltaMode === 0 && Math.abs(e.deltaX) > 0) {
        r.panBy(-e.deltaX, -e.deltaY);
        return;
      }
      const delta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
      r.zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,[contenteditable=true]")) return;
      if (e.key === "+" || e.key === "=") r.zoomAt(1.2);
      else if (e.key === "-") r.zoomAt(0.83);
      else if (e.key === "0") r.fit();
      else if (e.key === "ArrowLeft") r.panBy(80, 0);
      else if (e.key === "ArrowRight") r.panBy(-80, 0);
      else if (e.key === "ArrowUp") r.panBy(0, 80);
      else if (e.key === "ArrowDown") r.panBy(0, -80);
      else return;
      e.preventDefault();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("dblclick", onDbl);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("keydown", onKey);
    return () => {
      off();
      ro.disconnect();
      r.destroy();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("dblclick", onDbl);
      canvas.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("keydown", onKey);
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setState(props.state);
  });

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      aria-label="Sơ đồ cây gia phả. Dùng phím mũi tên để di chuyển, + và - để phóng to thu nhỏ, 0 để vừa màn hình."
      className="absolute inset-0 touch-none select-none outline-none"
    >
      <canvas ref={canvasRef} className="block cursor-grab" />
    </div>
  );
});
