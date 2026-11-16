/**
 * Mạng lưới quan hệ: tìm đường nối ngắn nhất giữa hai người bất kỳ (qua cha mẹ – con,
 * anh chị em, hôn nhân) và bố trí sơ đồ lấy một người làm tâm — gồm cả nhà thông gia,
 * những người không có chỗ trên cây dòng họ.
 */
import type { Gender, LinkKind } from "@/api/types";
import type { FamilyGraph } from "./graph";
import { NODE_H, NODE_W, ROW_H, SIBLING_GAP, SPOUSE_GAP, TOP_PAD, type Layout, type LLine, type LNode } from "./layout";

export type StepRel = "father" | "mother" | "son" | "daughter" | "husband" | "wife" | "sibling";

export interface Step {
  from: number;
  to: number;
  /** Vai của `to` đối với `from` */
  rel: StepRel;
  link?: LinkKind;
  /** Với anh chị em: −1 `to` là anh/chị, 1 là em, 0 chưa rõ */
  seniority?: -1 | 0 | 1;
}

/** −1: a sinh trước (lớn hơn) b; 1: sau; 0: chưa rõ. Ưu tiên thứ tự anh chị em rồi ngày sinh. */
export function seniority(g: FamilyGraph, a: number, b: number): -1 | 0 | 1 {
  const pa = g.get(a);
  const pb = g.get(b);
  if (!pa || !pb) return 0;
  if (pa.order != null && pb.order != null && pa.order !== pb.order) return pa.order < pb.order ? -1 : 1;
  if (!pa.birthYear || !pb.birthYear) return 0;
  if (pa.birthYear !== pb.birthYear) return pa.birthYear < pb.birthYear ? -1 : 1;
  if (!pa.birthMonth || !pb.birthMonth || pa.birthMonth === pb.birthMonth) return 0;
  return pa.birthMonth < pb.birthMonth ? -1 : 1;
}

interface Hop {
  to: number;
  rel: StepRel;
  link?: LinkKind;
}

/** Quan hệ trực tiếp kể cả anh chị em (coi là một bước cho gần với cách người ta nghĩ). */
function hops(g: FamilyGraph, pid: number): Hop[] {
  const out: Hop[] = [];
  const seen = new Set<number>();
  for (const e of g.edges(pid)) {
    const p = g.get(e.to)!;
    if (e.rel === "parent") out.push({ to: e.to, rel: p.gender === "M" ? "father" : "mother", link: e.link });
    else if (e.rel === "child") out.push({ to: e.to, rel: p.gender === "M" ? "son" : "daughter", link: e.link });
    else out.push({ to: e.to, rel: p.gender === "M" ? "husband" : "wife" });
    seen.add(e.to);
  }
  for (const s of g.siblings(pid)) if (!seen.has(s)) out.push({ to: s, rel: "sibling" });
  return out;
}

const REL_COST: Record<StepRel, number> = { father: 0, mother: 1, son: 2, daughter: 2, sibling: 3, husband: 4, wife: 4 };

/** Đường nối ngắn nhất từ a tới b (BFS). Ưu tiên ruột thịt rồi mới tới hôn nhân khi cùng độ dài. */
export function findPath(g: FamilyGraph, a: number, b: number, maxDepth = 30): Step[] | null {
  if (a === b) return [];
  if (!g.get(a) || !g.get(b)) return null;
  const prev = new Map<number, { from: number; hop: Hop }>();
  prev.set(a, { from: -1, hop: { to: a, rel: "sibling" } });
  let frontier = [a];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: number[] = [];
    for (const cur of frontier) {
      const list = hops(g, cur).sort((x, y) => REL_COST[x.rel] - REL_COST[y.rel] || x.to - y.to);
      for (const h of list) {
        if (prev.has(h.to)) continue;
        prev.set(h.to, { from: cur, hop: h });
        if (h.to === b) return unwind(g, prev, b);
        next.push(h.to);
      }
    }
    frontier = next;
  }
  return null;
}

/** BFS một lần từ a tới mọi người; trả về hàm lấy đường nối tới b (dùng khi cần cho cả cây). */
export function shortestPaths(g: FamilyGraph, a: number): (b: number) => Step[] | null {
  const prev = new Map<number, { from: number; hop: Hop }>();
  if (g.get(a)) {
    prev.set(a, { from: -1, hop: { to: a, rel: "sibling" } });
    const queue = [a];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      const list = hops(g, cur).sort((x, y) => REL_COST[x.rel] - REL_COST[y.rel] || x.to - y.to);
      for (const h of list) {
        if (prev.has(h.to)) continue;
        prev.set(h.to, { from: cur, hop: h });
        queue.push(h.to);
      }
    }
  }
  return (b) => (prev.has(b) ? unwind(g, prev, b) : null);
}

function unwind(g: FamilyGraph, prev: Map<number, { from: number; hop: Hop }>, b: number): Step[] {
  const steps: Step[] = [];
  let cur = b;
  while (true) {
    const p = prev.get(cur)!;
    if (p.from === -1) break;
    const step: Step = { from: p.from, to: cur, rel: p.hop.rel, link: p.hop.link };
    if (step.rel === "sibling") step.seniority = seniority(g, cur, p.from);
    steps.push(step);
    cur = p.from;
  }
  return steps.reverse();
}

/** "bố", "vợ", "em trai"… — vai của step.to đối với step.from. */
export function stepWord(g: FamilyGraph, s: Step): string {
  const gender: Gender = g.get(s.to)?.gender ?? "M";
  switch (s.rel) {
    case "father":
      return s.link === "adopted" ? "bố nuôi" : s.link === "step" ? "bố dượng" : "bố";
    case "mother":
      return s.link === "adopted" ? "mẹ nuôi" : s.link === "step" ? "mẹ kế" : "mẹ";
    case "son":
      return s.link === "adopted" ? "con trai nuôi" : s.link === "step" ? "con riêng" : "con trai";
    case "daughter":
      return s.link === "adopted" ? "con gái nuôi" : s.link === "step" ? "con riêng" : "con gái";
    case "husband":
      return "chồng";
    case "wife":
      return "vợ";
    case "sibling":
      if (s.seniority === -1) return gender === "M" ? "anh trai" : "chị gái";
      if (s.seniority === 1) return gender === "M" ? "em trai" : "em gái";
      return gender === "M" ? "anh/em trai" : "chị/em gái";
  }
}

/** Mô tả cả chuỗi theo lối của bảng xưng hô: "bố của vợ của em trai An". */
export function describePath(g: FamilyGraph, steps: Step[], ownerName: string): string {
  if (!steps.length) return `chính ${ownerName}`;
  return `${[...steps].reverse().map((s) => stepWord(g, s)).join(" của ")} ${ownerName}`;
}

export function pathIds(steps: Step[], start: number): number[] {
  return [start, ...steps.map((s) => s.to)];
}

// ---- bố trí sơ đồ quanh một người ------------------------------------------
export interface NetworkOptions {
  /** Số bước quan hệ tính từ người ở tâm (anh chị em tính 1 bước) */
  radius: number;
  /** Những người buộc phải có mặt (VD: đường nối đang làm nổi) */
  include?: readonly number[];
  /** Giới hạn số người để sơ đồ còn đọc được */
  limit?: number;
}

export const GEN_LABEL = (rel: number): string => {
  const fixed: Record<number, string> = {
    [-4]: "Đời kỵ",
    [-3]: "Đời cụ",
    [-2]: "Đời ông bà",
    [-1]: "Đời cha mẹ",
    0: "Ngang hàng",
    1: "Đời con",
    2: "Đời cháu",
    3: "Đời chắt",
    4: "Đời chút",
  };
  return fixed[rel] ?? (rel < 0 ? `${-rel} đời trên` : `${rel} đời dưới`);
};

interface NUnit {
  members: number[];
  gen: number;
  order: number;
  x: number;
  width: number;
}

/** Sơ đồ hình đồng hồ cát: đời trên ở trên, đời dưới ở dưới, vợ/chồng đứng cạnh nhau. */
export function computeNetworkLayout(g: FamilyGraph, center: number, opts: NetworkOptions): Layout {
  const limit = opts.limit ?? 320;
  const empty: Layout = { nodes: [], byPerson: new Map(), lines: [], bounds: { minX: 0, minY: 0, maxX: NODE_W, maxY: NODE_H }, rows: [] };
  if (!g.get(center)) return empty;

  // 1. Chọn người: BFS theo số bước, rồi thêm vợ/chồng của mỗi người để cặp vợ chồng đứng đủ đôi
  const dist = new Map<number, number>([[center, 0]]);
  let frontier = [center];
  for (let d = 1; d <= opts.radius && frontier.length && dist.size < limit; d++) {
    const next: number[] = [];
    for (const cur of frontier) {
      for (const h of hops(g, cur)) {
        if (dist.has(h.to)) continue;
        dist.set(h.to, d);
        next.push(h.to);
      }
    }
    frontier = next;
  }
  const chosen = new Set(dist.keys());
  for (const id of opts.include ?? []) if (g.get(id)) chosen.add(id);
  for (const id of [...chosen]) {
    if ((dist.get(id) ?? 0) >= opts.radius && !opts.include?.includes(id)) continue;
    for (const s of g.spouses(id)) if (chosen.size < limit + 40) chosen.add(s);
  }

  // 2. Đời tương đối so với người ở tâm (cha mẹ −1, con +1, vợ chồng & anh chị em 0)
  const gen = new Map<number, number>([[center, 0]]);
  const bfsOrder: number[] = [center];
  for (let i = 0; i < bfsOrder.length; i++) {
    const cur = bfsOrder[i];
    const gc = gen.get(cur)!;
    for (const h of hops(g, cur)) {
      if (!chosen.has(h.to) || gen.has(h.to)) continue;
      const delta = h.rel === "father" || h.rel === "mother" ? -1 : h.rel === "son" || h.rel === "daughter" ? 1 : 0;
      gen.set(h.to, gc + delta);
      bfsOrder.push(h.to);
    }
  }
  for (const id of chosen) if (!gen.has(id)) chosen.delete(id);

  // 3. Gom cặp vợ chồng cùng đời thành một cụm (chồng trái, vợ phải)
  const unitOf = new Map<number, NUnit>();
  const rows = new Map<number, NUnit[]>();
  for (const id of bfsOrder) {
    if (unitOf.has(id)) continue;
    const p = g.get(id)!;
    const gid = gen.get(id)!;
    const spouses = g.spouses(id).filter((s) => chosen.has(s) && !unitOf.has(s) && gen.get(s) === gid);
    const members = p.gender === "M" ? [id, ...spouses] : [...spouses.reverse(), id];
    const unit: NUnit = { members, gen: gid, order: 0, x: 0, width: members.length * NODE_W + (members.length - 1) * SPOUSE_GAP };
    for (const m of members) unitOf.set(m, unit);
    const row = rows.get(gid) ?? [];
    unit.order = row.length;
    row.push(unit);
    rows.set(gid, row);
  }

  // Liên kết giữa các cụm ở hai đời kề nhau (cha mẹ ↔ con)
  const up = new Map<NUnit, NUnit[]>();
  const down = new Map<NUnit, NUnit[]>();
  for (const id of chosen) {
    for (const parent of g.allParents(id)) {
      if (!chosen.has(parent)) continue;
      const c = unitOf.get(id)!;
      const pu = unitOf.get(parent)!;
      if (c === pu) continue;
      up.set(c, [...(up.get(c) ?? []), pu]);
      down.set(pu, [...(down.get(pu) ?? []), c]);
    }
  }

  const gens = [...rows.keys()].sort((a, b) => a - b);
  const center0 = (u: NUnit) => u.x + u.width / 2;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  // 4. Sắp thứ tự trong mỗi hàng bằng trọng tâm (barycenter), quét lên xuống vài lượt
  const reorder = (gid: number, ref: Map<NUnit, NUnit[]>) => {
    const row = rows.get(gid)!;
    const key = new Map<NUnit, number>();
    for (const u of row) {
      const linked = ref.get(u);
      key.set(u, linked?.length ? mean(linked.map((x) => x.order)) : u.order);
    }
    row.sort((a, b) => key.get(a)! - key.get(b)! || a.order - b.order);
    row.forEach((u, i) => (u.order = i));
  };
  for (let pass = 0; pass < 4; pass++) {
    for (const gid of gens) reorder(gid, up);
    for (const gid of [...gens].reverse()) reorder(gid, down);
  }

  // 5. Toạ độ: xếp liền nhau rồi kéo dần về phía cụm liên quan, giữ khoảng cách tối thiểu
  const GAP = SIBLING_GAP + 18;
  for (const gid of gens) {
    let x = 0;
    for (const u of rows.get(gid)!) {
      u.x = x;
      x += u.width + GAP;
    }
  }
  const settle = (gid: number, refs: (Map<NUnit, NUnit[]>)[]) => {
    const row = rows.get(gid)!;
    const want = row.map((u) => {
      const linked = refs.flatMap((r) => r.get(u) ?? []);
      return linked.length ? mean(linked.map(center0)) - u.width / 2 : u.x;
    });
    // đẩy từ trái sang phải, rồi cân lại từ phải sang trái để không lệch hẳn một phía
    const xs = [...want];
    for (let i = 1; i < row.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + row[i - 1].width + GAP);
    for (let i = row.length - 2; i >= 0; i--) xs[i] = Math.min(xs[i], xs[i + 1] - row[i].width - GAP);
    for (let i = 1; i < row.length; i++) xs[i] = Math.max(xs[i], xs[i - 1] + row[i - 1].width + GAP);
    row.forEach((u, i) => (u.x = xs[i]));
  };
  for (let pass = 0; pass < 8; pass++) {
    for (const gid of gens) settle(gid, [up, down]);
    for (const gid of [...gens].reverse()) settle(gid, [down, up]);
  }
  // Người ở tâm đặt tại x = 0
  const cu = unitOf.get(center)!;
  const shift = -(cu.x + cu.members.indexOf(center) * (NODE_W + SPOUSE_GAP));
  for (const row of rows.values()) for (const u of row) u.x += shift;

  // 6. Nút
  const rowY = (gid: number) => TOP_PAD + gid * ROW_H;
  const nodes: LNode[] = [];
  const byPerson = new Map<number, LNode>();
  for (const row of rows.values()) {
    for (const u of row) {
      u.members.forEach((id, i) => {
        const n: LNode = {
          key: `p${id}`,
          id,
          gender: g.get(id)!.gender,
          x: u.x + i * (NODE_W + SPOUSE_GAP),
          y: rowY(u.gen),
          gen: u.gen,
          owner: u.members[0],
          anchor: id === center,
        };
        nodes.push(n);
        byPerson.set(id, n);
      });
    }
  }

  // 7. Đường nối
  const lines: LLine[] = [];
  const drawnUnions = new Set<number>();
  for (const row of rows.values()) {
    for (const u of row) {
      // hôn nhân trong cụm: người đầu với từng người còn lại
      const owner = u.members.find((m) => u.members.every((x) => x === m || g.spouses(m).includes(x))) ?? u.members[0];
      const on = byPerson.get(owner)!;
      const cy = on.y + NODE_H / 2;
      let arc = 0;
      for (const m of u.members) {
        if (m === owner) continue;
        const sn = byPerson.get(m)!;
        const adjacent = Math.abs(sn.x - on.x) <= NODE_W + SPOUSE_GAP + 1;
        if (adjacent) {
          const [a, b] = sn.x > on.x ? [on, sn] : [sn, on];
          lines.push({ kind: "marriage", pts: [a.x + NODE_W, cy, b.x, cy] });
        } else {
          const top = on.y - 14 - arc++ * 7;
          const sx = on.x + NODE_W / 2 + (sn.x > on.x ? 16 : -16);
          const tx = sn.x + NODE_W / 2;
          lines.push({ kind: "marriage", pts: [sx, on.y, sx, top, tx, top, tx, on.y] });
        }
      }
    }
  }
  // vợ chồng ở hai cụm khác nhau (VD: người có nhiều đời chồng) → nét đứt
  for (const id of chosen) {
    for (const s of g.spouses(id)) {
      if (s < id || !chosen.has(s) || unitOf.get(s) === unitOf.get(id)) continue;
      const a = byPerson.get(id)!;
      const b = byPerson.get(s)!;
      const low = Math.max(a.y, b.y) + NODE_H + 22;
      lines.push({ kind: "far", pts: [a.x + NODE_W / 2, a.y + NODE_H, a.x + NODE_W / 2, low, b.x + NODE_W / 2, low, b.x + NODE_W / 2, b.y + NODE_H] });
    }
  }
  // con: từ giữa cặp vợ chồng (hoặc từ người cha/mẹ có mặt) xuống từng con
  const busCount = new Map<NUnit, number>();
  for (const [uid, union] of g.unions) {
    if (drawnUnions.has(uid)) continue;
    const kids = union.allLinks.map((l) => l.c).filter((c) => chosen.has(c));
    if (!kids.length) continue;
    const parents = [union.husband, union.wife].filter((x): x is number => x != null && chosen.has(x));
    if (!parents.length) continue;
    drawnUnions.add(uid);
    const pn = parents.map((x) => byPerson.get(x)!);
    let ax: number;
    let ay: number;
    if (pn.length === 2 && pn[0].y === pn[1].y && Math.abs(pn[0].x - pn[1].x) <= NODE_W + SPOUSE_GAP + 1) {
      ax = (Math.min(pn[0].x, pn[1].x) + NODE_W + Math.max(pn[0].x, pn[1].x)) / 2;
      ay = pn[0].y + NODE_H / 2;
    } else {
      // vợ/chồng không đứng cạnh nhau: xuất phát từ người mẹ nếu có, cho dễ nhìn
      const from = pn.find((n) => n.gender === "F") ?? pn[0];
      ax = from.x + NODE_W / 2;
      ay = from.y + NODE_H;
    }
    const parentUnit = unitOf.get(parents[0])!;
    const idx = busCount.get(parentUnit) ?? 0;
    busCount.set(parentUnit, idx + 1);
    const baseY = Math.max(...pn.map((n) => n.y)) + NODE_H;
    const busY = baseY + 40 + idx * 10;
    const kidNodes = kids.map((c) => byPerson.get(c)!).filter((k) => k.y > baseY);
    if (!kidNodes.length) continue;
    const kxs = kidNodes.map((k) => k.x + NODE_W / 2);
    lines.push({ kind: "child", pts: [ax, ay, ax, busY], unionId: uid });
    const minX = Math.min(ax, ...kxs);
    const maxX = Math.max(ax, ...kxs);
    if (maxX > minX) lines.push({ kind: "child", pts: [minX, busY, maxX, busY], unionId: uid });
    for (const k of kidNodes) lines.push({ kind: "child", pts: [k.x + NODE_W / 2, busY, k.x + NODE_W / 2, k.y], unionId: uid });
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_W);
    maxY = Math.max(maxY, n.y + NODE_H);
  }
  return {
    nodes,
    byPerson,
    lines,
    bounds: { minX, minY: minY - 40, maxX, maxY },
    rows: gens.map((gid) => ({ gen: gid, y: rowY(gid), label: GEN_LABEL(gid) })),
  };
}
