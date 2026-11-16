/**
 * Vẽ cây bằng Canvas 2D: chỉ vẽ nút trong khung nhìn, giảm chi tiết khi thu nhỏ
 * → mượt 60 fps với cây 5.000 người (PRD mục 9).
 */
import type { FamilyGraph } from "@/lib/graph";
import { lifeSpan } from "@/lib/format";
import { NODE_H, NODE_W, ROW_H, type Layout, type LNode } from "@/lib/layout";
import { initials } from "@/lib/text";
import { COLORS, FONT } from "./theme";

export interface Badge {
  text: string;
  uncertain: boolean;
}

export interface RenderState {
  layout: Layout | null;
  graph: FamilyGraph | null;
  badges: Map<number, Badge> | null;
  meId: number | null;
  selectedId: number | null;
  path: Set<number> | null;
  lineToRoot: Set<number> | null;
  flashId: number | null;
  flashUntil: number;
  showGenLabels: boolean;
}

export interface Transform {
  x: number;
  y: number;
  k: number;
}

export type Hit =
  | { type: "node"; node: LNode }
  | { type: "name"; node: LNode }
  | { type: "toggle"; node: LNode };

export const MIN_K = 0.04;
export const MAX_K = 2.5;
const AVATAR = 46;

export class TreeRenderer {
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;
  t: Transform = { x: 40, y: 40, k: 1 };
  state: RenderState = {
    layout: null,
    graph: null,
    badges: null,
    meId: null,
    selectedId: null,
    path: null,
    lineToRoot: null,
    flashId: null,
    flashUntil: 0,
    showGenLabels: true,
  };
  private raf = 0;
  private anim: { from: Transform; to: Transform; start: number; ms: number } | null = null;
  private images = new Map<string, HTMLImageElement | null>();
  private textCache = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly interactive = true,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas không được hỗ trợ");
    this.ctx = ctx;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setState(patch: Partial<RenderState>) {
    Object.assign(this.state, patch);
    this.invalidate();
  }

  resize(w: number, h: number, dpr = window.devicePixelRatio || 1) {
    this.width = w;
    this.height = h;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.invalidate();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.listeners.clear();
  }

  // ---- camera ---------------------------------------------------------
  setTransform(t: Transform) {
    this.t = { x: t.x, y: t.y, k: Math.min(MAX_K, Math.max(MIN_K, t.k)) };
    this.invalidate();
    this.listeners.forEach((fn) => fn());
  }

  toWorld(sx: number, sy: number) {
    return { x: (sx - this.t.x) / this.t.k, y: (sy - this.t.y) / this.t.k };
  }

  toScreen(wx: number, wy: number) {
    return { x: wx * this.t.k + this.t.x, y: wy * this.t.k + this.t.y };
  }

  zoomAt(factor: number, sx = this.width / 2, sy = this.height / 2) {
    const k = Math.min(MAX_K, Math.max(MIN_K, this.t.k * factor));
    const w = this.toWorld(sx, sy);
    this.anim = null;
    this.setTransform({ k, x: sx - w.x * k, y: sy - w.y * k });
  }

  panBy(dx: number, dy: number) {
    this.anim = null;
    this.setTransform({ ...this.t, x: this.t.x + dx, y: this.t.y + dy });
  }

  fitTransform(): Transform {
    const b = this.state.layout?.bounds;
    if (!b || !this.width) return this.t;
    const padX = 72;
    const padY = 48;
    const k = Math.min(1, Math.max(MIN_K, Math.min((this.width - padX * 2) / (b.maxX - b.minX), (this.height - padY * 2) / (b.maxY - b.minY))));
    return {
      k,
      x: (this.width - (b.maxX - b.minX) * k) / 2 - b.minX * k,
      y: padY - b.minY * k,
    };
  }

  fit(animate = true) {
    this.animateTo(this.fitTransform(), animate ? 350 : 0);
  }

  focus(id: number, opts: { animate?: boolean; zoom?: number; flash?: boolean } = {}) {
    const n = this.state.layout?.byPerson.get(id);
    if (!n) return false;
    const k = Math.max(opts.zoom ?? 0.9, Math.min(this.t.k, 1.2));
    this.animateTo(
      { k, x: this.width / 2 - (n.x + NODE_W / 2) * k, y: this.height / 2.4 - (n.y + NODE_H / 2) * k },
      opts.animate === false ? 0 : 450,
    );
    if (opts.flash) this.setState({ flashId: id, flashUntil: performance.now() + 2200 });
    return true;
  }

  animateTo(to: Transform, ms: number) {
    if (ms <= 0) {
      this.anim = null;
      this.setTransform(to);
      return;
    }
    this.anim = { from: { ...this.t }, to, start: performance.now(), ms };
    this.invalidate();
  }

  nodeScreenRect(n: LNode) {
    const p = this.toScreen(n.x, n.y);
    return { x: p.x, y: p.y, w: NODE_W * this.t.k, h: NODE_H * this.t.k };
  }

  // ---- hit test -------------------------------------------------------
  hitTest(sx: number, sy: number): Hit | null {
    const layout = this.state.layout;
    if (!layout) return null;
    const w = this.toWorld(sx, sy);
    for (let i = layout.nodes.length - 1; i >= 0; i--) {
      const n = layout.nodes[i];
      if (n.toggle) {
        const cx = n.x + NODE_W / 2;
        const cy = n.y + NODE_H + 13;
        const r = Math.max(14, 14 / this.t.k);
        if (Math.abs(w.x - cx) < r * 1.6 && Math.abs(w.y - cy) < r) return { type: "toggle", node: n };
      }
      if (w.x >= n.x && w.x <= n.x + NODE_W && w.y >= n.y - 12 && w.y <= n.y + NODE_H) {
        if (n.id != null && w.x >= n.x + 66 && w.y >= n.y + 10 && w.y <= n.y + 42) return { type: "name", node: n };
        return { type: "node", node: n };
      }
    }
    return null;
  }

  // ---- vẽ -------------------------------------------------------------
  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.frame();
    });
  }

  private frame() {
    if (this.anim) {
      const { from, to, start, ms } = this.anim;
      const p = Math.min(1, (performance.now() - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      this.t = { k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      this.listeners.forEach((fn) => fn());
      if (p >= 1) this.anim = null;
      else this.invalidate();
    }
    this.draw();
    if (this.state.flashId != null && performance.now() < this.state.flashUntil) this.invalidate();
  }

  draw() {
    const { ctx, dpr, t } = this;
    const { layout, graph } = this.state;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    if (!layout || !graph) return;

    ctx.setTransform(dpr * t.k, 0, 0, dpr * t.k, dpr * t.x, dpr * t.y);
    const view = {
      x0: -t.x / t.k - NODE_W,
      y0: -t.y / t.k - NODE_H - 30,
      x1: (this.width - t.x) / t.k + NODE_W,
      y1: (this.height - t.y) / t.k + 30,
    };

    // dải nền xen kẽ theo đời
    for (const row of layout.rows) {
      const top = row.y - 52;
      if (top > view.y1 || top + ROW_H < view.y0) continue;
      ctx.fillStyle = row.gen % 2 ? COLORS.bandA : COLORS.bandB;
      ctx.fillRect(view.x0, top, view.x1 - view.x0, ROW_H);
    }

    this.drawLines(layout, view);

    const lod = t.k < 0.22 ? 0 : t.k < 0.42 ? 1 : 2;
    const dim = this.state.path && this.state.path.size > 1;
    for (const n of layout.nodes) {
      if (n.x > view.x1 || n.x + NODE_W < view.x0 || n.y > view.y1 || n.y + NODE_H < view.y0) continue;
      ctx.globalAlpha = dim && !(n.id != null && this.state.path!.has(n.id)) ? 0.38 : 1;
      this.drawNode(n, lod);
    }
    ctx.globalAlpha = 1;

    if (this.interactive && this.state.showGenLabels) this.drawGenLabels(layout);
  }

  private drawLines(layout: Layout, view: { x0: number; y0: number; x1: number; y1: number }) {
    const { ctx } = this;
    const visible = (pts: number[]) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
      }
      return !(minX > view.x1 || maxX < view.x0 || minY > view.y1 || maxY < view.y0);
    };
    const stroke = (kind: string, width: number, color: string, dash: number[]) => {
      ctx.beginPath();
      for (const l of layout.lines) {
        if (l.kind !== kind || !visible(l.pts)) continue;
        ctx.moveTo(l.pts[0], l.pts[1]);
        for (let i = 2; i < l.pts.length; i += 2) ctx.lineTo(l.pts[i], l.pts[i + 1]);
      }
      ctx.setLineDash(dash);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    const minW = 1 / this.t.k;
    stroke("child", Math.max(1.6, minW), COLORS.line, []);
    stroke("marriage", Math.max(2.4, minW * 1.5), COLORS.line, []);
    stroke("far", Math.max(1.6, minW), COLORS.lineFar, [6, 5]);
    ctx.setLineDash([]);
  }

  private truncate(text: string, font: string, maxW: number): string {
    const key = `${font}|${maxW}|${text}`;
    const hit = this.textCache.get(key);
    if (hit != null) return hit;
    const { ctx } = this;
    ctx.font = font;
    let out = text;
    if (ctx.measureText(text).width > maxW) {
      let lo = 0, hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
        else hi = mid - 1;
      }
      out = text.slice(0, lo) + "…";
    }
    if (this.textCache.size > 20000) this.textCache.clear();
    this.textCache.set(key, out);
    return out;
  }

  /** Ngắt tên thành tối đa `max` dòng theo từ; luôn giữ tên gọi (chữ cuối) ở dòng cuối. */
  private wrapName(name: string, font: string, maxW: number, max: number): string[] {
    const key = `w|${font}|${maxW}|${max}|${name}`;
    const hit = this.textCache.get(key);
    if (hit != null) return hit.split("\n");
    const { ctx } = this;
    ctx.font = font;
    let lines: string[];
    if (ctx.measureText(name).width <= maxW || max === 1) {
      lines = [this.truncate(name, font, maxW)];
    } else {
      const words = name.split(/\s+/);
      let first = words[0];
      let i = 1;
      while (i < words.length - 1 && ctx.measureText(`${first} ${words[i]}`).width <= maxW) first += ` ${words[i++]}`;
      lines = [this.truncate(first, font, maxW), this.truncate(words.slice(i).join(" "), font, maxW)];
    }
    this.textCache.set(key, lines.join("\n"));
    return lines;
  }

  private image(key: string): HTMLImageElement | null {
    if (this.images.has(key)) return this.images.get(key)!;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      this.images.set(key, img);
      this.invalidate();
    };
    img.onerror = () => this.images.set(key, null);
    img.src = `/media/p/${key}_t.webp`;
    this.images.set(key, null);
    return null;
  }

  /** Nạp trước toàn bộ ảnh (dùng khi xuất ảnh). */
  async preloadImages(): Promise<void> {
    const graph = this.state.graph;
    if (!graph) return;
    const keys = [...graph.persons.values()].map((p) => p.photo).filter((k): k is string => !!k);
    await Promise.all(
      keys.map(
        (k) =>
          new Promise<void>((resolve) => {
            if (this.images.get(k)) return resolve();
            const img = new Image();
            img.onload = () => {
              this.images.set(k, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = `/media/p/${k}_t.webp`;
          }),
      ),
    );
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  private drawNode(n: LNode, lod: number) {
    const { ctx } = this;
    const { graph, badges, meId, selectedId, path, lineToRoot, flashId, flashUntil } = this.state;
    const p = n.id != null ? graph!.get(n.id) : undefined;
    const pal = COLORS[n.gender];
    const x = n.x;
    const y = n.y;

    if (!p) {
      // ô "không rõ tên"
      this.roundRect(x, y, NODE_W, NODE_H, 12);
      ctx.fillStyle = COLORS.placeholderFill;
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = COLORS.placeholderStroke;
      ctx.stroke();
      ctx.setLineDash([]);
      if (lod > 0) {
        ctx.fillStyle = COLORS.muted;
        ctx.font = `italic 14px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(n.gender === "F" ? "Vợ (không rõ tên)" : "Chồng (không rõ tên)", x + NODE_W / 2, y + NODE_H / 2);
        ctx.textAlign = "left";
      }
      return;
    }

    const isMe = p.id === meId;
    const selected = p.id === selectedId;
    const onPath = path?.has(p.id) || lineToRoot?.has(p.id);

    if (flashId === p.id && performance.now() < flashUntil) {
      const phase = (performance.now() % 900) / 900;
      ctx.lineWidth = 6;
      ctx.strokeStyle = `rgba(217,119,6,${1 - phase})`;
      this.roundRect(x - 6 - phase * 10, y - 6 - phase * 10, NODE_W + 12 + phase * 20, NODE_H + 12 + phase * 20, 16);
      ctx.stroke();
    }

    if (isMe || onPath) {
      this.roundRect(x - 5, y - 5, NODE_W + 10, NODE_H + 10, 15);
      ctx.fillStyle = isMe ? "rgba(217,119,6,0.30)" : "rgba(245,158,11,0.22)";
      ctx.fill();
    }

    this.roundRect(x, y, NODE_W, NODE_H, 12);
    ctx.fillStyle = p.lineage ? pal.blood : pal.inlaw;
    ctx.fill();
    if (lod === 0) return;

    ctx.lineWidth = selected ? 4 : 2;
    ctx.strokeStyle = selected ? COLORS.selected : p.lineage ? pal.stroke : pal.soft;
    if (p.ngoai && !selected) ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // biểu tượng người đã mất: dải băng tang ở góc
    if (p.status === "deceased") {
      ctx.save();
      this.roundRect(x, y, NODE_W, NODE_H, 12);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x + NODE_W - 30, y);
      ctx.lineTo(x + NODE_W, y);
      ctx.lineTo(x + NODE_W, y + 30);
      ctx.closePath();
      ctx.fillStyle = COLORS.deceased;
      ctx.fill();
      ctx.restore();
    }

    // ảnh / chữ viết tắt
    const ax = x + 10 + AVATAR / 2;
    const ay = y + NODE_H / 2;
    const img = lod === 2 && p.photo ? this.image(p.photo) : null;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, AVATAR / 2, 0, Math.PI * 2);
    ctx.closePath();
    if (img) {
      ctx.clip();
      ctx.drawImage(img, ax - AVATAR / 2, ay - AVATAR / 2, AVATAR, AVATAR);
    } else {
      ctx.fillStyle = pal.avatar;
      ctx.fill();
      if (lod === 2) {
        ctx.fillStyle = pal.stroke;
        ctx.font = `700 16px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials(p.name), ax, ay + 1);
        ctx.textAlign = "left";
      }
    }
    ctx.restore();

    const tx = x + 66;
    const maxW = NODE_W - 74;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COLORS.text;
    const span = lifeSpan(p);
    const nameFont = `600 ${lod === 1 ? 17 : 15}px ${FONT}`;
    const lines = this.wrapName(p.name, nameFont, maxW, lod === 1 ? 1 : 2);
    ctx.font = nameFont;
    if (lod === 1) {
      ctx.fillText(lines[0], tx, y + NODE_H / 2 + 6);
    } else {
      const lineH = 19;
      const block = lines.length * lineH + (span ? 20 : 0);
      let ty = y + (NODE_H - block) / 2 + 15;
      for (const line of lines) {
        ctx.fillText(line, tx, ty);
        ty += lineH;
      }
      if (span) {
        const subFont = `14px ${FONT}`;
        ctx.font = subFont;
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(this.truncate(span, subFont, maxW), tx, ty + 2);
      }
    }

    // huy hiệu cách gọi (FR-51)
    let badge: Badge | undefined;
    if (isMe) badge = { text: "Tôi", uncertain: false };
    else badge = badges?.get(p.id);
    if (badge && badge.text) {
      const font = `700 13px ${FONT}`;
      ctx.font = font;
      const text = this.truncate(badge.text, font, NODE_W - 24);
      const bw = ctx.measureText(text).width + 18;
      const bx = x + 14;
      const by = y - 12;
      this.roundRect(bx, by, bw, 22, 11);
      ctx.fillStyle = isMe ? COLORS.me : badge.uncertain ? COLORS.badgeUncertain : COLORS.badge;
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + 9, by + 11.5);
      ctx.textBaseline = "alphabetic";
    }

    if (n.toggle && lod > 0) {
      const cx = x + NODE_W / 2;
      const cy = y + NODE_H + 13;
      const label = n.toggle.collapsed ? `+${n.toggle.hidden}` : "−";
      ctx.font = `700 13px ${FONT}`;
      const w = Math.max(24, ctx.measureText(label).width + 14);
      this.roundRect(cx - w / 2, cy - 11, w, 22, 11);
      ctx.fillStyle = n.toggle.collapsed ? pal.stroke : "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = pal.stroke;
      ctx.stroke();
      ctx.fillStyle = n.toggle.collapsed ? "#fff" : pal.stroke;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
  }

  private drawGenLabels(layout: Layout) {
    const { ctx, dpr, t } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `700 14px ${FONT}`;
    for (const row of layout.rows) {
      const sy = row.y * t.k + t.y + (NODE_H * t.k) / 2;
      if (sy < -20 || sy > this.height + 20) continue;
      const w = ctx.measureText(row.label).width + 18;
      this.roundRect(8, sy - 13, w, 26, 13);
      ctx.fillStyle = "rgba(127,29,29,0.92)";
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(row.label, 17, sy + 1);
    }
    ctx.textBaseline = "alphabetic";
  }
}
