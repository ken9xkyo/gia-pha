/** Xuất cây ra ảnh PNG, SVG (vector) và bản in / PDF (FR-45). */
import type { FamilyGraph } from "@/lib/graph";
import { lifeSpan } from "@/lib/format";
import { NODE_H, NODE_W, type Layout } from "@/lib/layout";
import { TreeRenderer, type Badge } from "./renderer";
import { COLORS, FONT } from "./theme";

const MAX_SIDE = 16000;
const MAX_AREA = 120_000_000;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildSVG(layout: Layout, graph: FamilyGraph, badges: Map<number, Badge> | null, title: string): string {
  const pad = 60;
  const b = layout.bounds;
  const minX = b.minX - pad - 70;
  const minY = b.minY - pad - 30;
  const w = b.maxX - minX + pad;
  const h = b.maxY - minY + pad;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}" font-family='${FONT}'>`,
    `<rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="${COLORS.bg}"/>`,
    `<text x="${minX + 24}" y="${minY + 40}" font-size="28" font-weight="700" fill="${COLORS.badge}">${esc(title)}</text>`,
  );
  for (const row of layout.rows) {
    out.push(
      `<text x="${minX + 24}" y="${row.y + NODE_H / 2 + 5}" font-size="16" font-weight="700" fill="${COLORS.badge}">${esc(row.label)}</text>`,
    );
  }
  const dash = (k: string) => (k === "far" ? ` stroke-dasharray="6 5" stroke="${COLORS.lineFar}"` : ` stroke="${COLORS.line}"`);
  for (const l of layout.lines) {
    const pts = [];
    for (let i = 0; i < l.pts.length; i += 2) pts.push(`${l.pts[i]},${l.pts[i + 1]}`);
    out.push(`<polyline points="${pts.join(" ")}" fill="none" stroke-width="${l.kind === "marriage" ? 2.4 : 1.6}"${dash(l.kind)}/>`);
  }
  for (const n of layout.nodes) {
    const p = n.id != null ? graph.get(n.id) : undefined;
    const pal = COLORS[n.gender];
    if (!p) {
      out.push(
        `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="12" fill="${COLORS.placeholderFill}" stroke="${COLORS.placeholderStroke}" stroke-dasharray="5 4"/>`,
        `<text x="${n.x + NODE_W / 2}" y="${n.y + NODE_H / 2 + 5}" font-size="14" font-style="italic" text-anchor="middle" fill="${COLORS.muted}">${n.gender === "F" ? "Vợ" : "Chồng"} (không rõ tên)</text>`,
      );
      continue;
    }
    out.push(
      `<rect x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="12" fill="${p.lineage ? pal.blood : pal.inlaw}" stroke="${p.lineage ? pal.stroke : pal.soft}" stroke-width="2"${p.ngoai ? ' stroke-dasharray="7 5"' : ""}/>`,
    );
    if (p.status === "deceased")
      out.push(`<path d="M${n.x + NODE_W - 30},${n.y + 1} L${n.x + NODE_W - 12},${n.y + 1} Q${n.x + NODE_W - 1},${n.y + 1} ${n.x + NODE_W - 1},${n.y + 12} L${n.x + NODE_W - 1},${n.y + 30} Z" fill="${COLORS.deceased}"/>`);
    const cx = n.x + 33;
    const cy = n.y + NODE_H / 2;
    if (p.photo) {
      out.push(
        `<clipPath id="c${p.id}"><circle cx="${cx}" cy="${cy}" r="23"/></clipPath>`,
        `<image href="${location.origin}/media/p/${p.photo}_t.webp" x="${cx - 23}" y="${cy - 23}" width="46" height="46" clip-path="url(#c${p.id})"/>`,
      );
    } else {
      out.push(`<circle cx="${cx}" cy="${cy}" r="23" fill="${pal.avatar}"/>`);
    }
    const name = p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name;
    out.push(`<text x="${n.x + 66}" y="${n.y + 32}" font-size="15" font-weight="600" fill="${COLORS.text}">${esc(name)}</text>`);
    const span = lifeSpan(p);
    if (span) out.push(`<text x="${n.x + 66}" y="${n.y + 54}" font-size="14" fill="${COLORS.muted}">${esc(span)}</text>`);
    const badge = badges?.get(p.id);
    if (badge?.text) {
      const bw = badge.text.length * 8 + 18;
      out.push(
        `<rect x="${n.x + 14}" y="${n.y - 12}" width="${bw}" height="22" rx="11" fill="${badge.uncertain ? COLORS.badgeUncertain : COLORS.badge}"/>`,
        `<text x="${n.x + 23}" y="${n.y + 4}" font-size="13" font-weight="700" fill="#fff">${esc(badge.text)}</text>`,
      );
    }
  }
  out.push("</svg>");
  return out.join("\n");
}

export function downloadSVG(svg: string, name: string) {
  download(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${name}.svg`);
}

export async function downloadPNG(layout: Layout, graph: FamilyGraph, badges: Map<number, Badge> | null, name: string) {
  const b = layout.bounds;
  const pad = 60;
  const ww = b.maxX - b.minX + pad * 2 + 70;
  const wh = b.maxY - b.minY + pad * 2;
  let scale = Math.min(2, MAX_SIDE / ww, MAX_SIDE / wh, Math.sqrt(MAX_AREA / (ww * wh)));
  scale = Math.max(scale, 0.05);
  const canvas = document.createElement("canvas");
  const r = new TreeRenderer(canvas, false);
  r.resize(Math.ceil(ww * scale), Math.ceil(wh * scale), 1);
  r.state = { ...r.state, layout, graph, badges, showGenLabels: false };
  await r.preloadImages();
  r.t = { k: scale, x: (pad + 70 - b.minX) * scale, y: (pad - b.minY) * scale };
  r.draw();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  r.destroy();
  if (blob) download(blob, `${name}.png`);
}

export function printTree(svg: string, title: string) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A3 landscape; margin: 10mm; }
  html,body{margin:0;background:#fff}
  .hint{font:16px ${FONT};padding:12px;background:#fef3c7;border-bottom:1px solid #f59e0b}
  @media print{.hint{display:none}}
  svg{width:100%;height:auto;display:block}
</style></head><body>
<div class="hint">Chọn "Lưu dưới dạng PDF" trong hộp thoại in để xuất PDF. Có thể đổi khổ giấy và tỷ lệ cho vừa trang.</div>
${svg}
</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 800);
  return true;
}
