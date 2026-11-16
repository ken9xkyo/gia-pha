/**
 * Bố trí cây: mỗi hàng ngang là một đời; một "cụm" gồm người trong dòng họ và các vợ/chồng
 * đứng cạnh nhau; con xếp trưởng → út từ trái sang phải dưới đúng cuộc hôn nhân (FR-01..04).
 * Dùng thuật toán đường viền (contour) kiểu Reingold–Tilford để cây gọn, O(n · số đời).
 */
import type { Gender } from "@/api/types";
import type { FamilyGraph } from "./graph";

export const NODE_W = 196;
export const NODE_H = 80;
export const SPOUSE_GAP = 22;
export const SIBLING_GAP = 28;
export const ROW_H = 178;
export const TOP_PAD = 40;

export interface LNode {
  key: string;
  /** id người; null nếu là ô "không rõ tên" */
  id: number | null;
  unionId?: number;
  gender: Gender;
  x: number;
  y: number;
  gen: number;
  owner: number;
  anchor: boolean;
  toggle?: { collapsed: boolean; hidden: number };
  orphan?: boolean;
}

export interface LLine {
  kind: "marriage" | "child" | "far";
  pts: number[];
  unionId?: number;
}

export interface Layout {
  nodes: LNode[];
  byPerson: Map<number, LNode>;
  lines: LLine[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  rows: { gen: number; y: number; label: string }[];
}

export interface LayoutOptions {
  collapsed: ReadonlySet<number>;
  hideNgoai?: boolean;
  branch?: string | null;
}

type Member = { kind: "person"; id: number } | { kind: "placeholder"; unionId: number; gender: Gender };

interface Unit {
  owner: number;
  members: Member[];
  ownerIndex: number;
  unions: { uid: number; spouseIndex: number | null; children: Unit[] }[];
  children: Unit[];
  width: number;
  offset: number;
  contourL: number[];
  contourR: number[];
  far: number[];
  toggle?: { collapsed: boolean; hidden: number };
}

export const rowY = (gen: number) => TOP_PAD + (gen - 1) * ROW_H;

export function computeLayout(g: FamilyGraph, opts: LayoutOptions): Layout {
  const placed = new Set<number>();

  let allowed: Set<number> | null = null;
  if (opts.branch) {
    allowed = new Set<number>();
    for (const p of g.persons.values()) {
      if (p.lineage && p.branch === opts.branch) for (const a of g.lineToRoot(p.id)) allowed.add(a);
    }
  }

  /** Con của một cuộc hôn nhân xếp dưới người thuộc dòng họ (ưu tiên chồng). */
  const isOwner = (uid: number, pid: number) => {
    const u = g.unions.get(uid)!;
    const h = u.husband != null ? g.get(u.husband) : undefined;
    const w = u.wife != null ? g.get(u.wife) : undefined;
    const owner = h?.lineage ? h.id : w?.lineage ? w.id : (u.husband ?? u.wife);
    return owner === pid;
  };

  const build = (pid: number): Unit => {
    placed.add(pid);
    const p = g.get(pid)!;
    const spouses: Member[] = [];
    const unitUnions: Unit["unions"] = [];
    const far: number[] = [];

    for (const uid of p.unions) {
      const u = g.unions.get(uid)!;
      const other = u.husband === pid ? u.wife : u.husband;
      const owned = isOwner(uid, pid);
      let spouseIndex: number | null = null;
      if (other == null) {
        if (u.children.length) {
          spouseIndex = spouses.length;
          spouses.push({ kind: "placeholder", unionId: uid, gender: p.gender === "M" ? "F" : "M" });
        }
      } else if (g.get(other)?.lineage || placed.has(other)) {
        far.push(other);
      } else {
        spouseIndex = spouses.length;
        spouses.push({ kind: "person", id: other });
        placed.add(other);
      }
      if (owned) unitUnions.push({ uid, spouseIndex, children: [] });
    }

    const self: Member = { kind: "person", id: pid };
    const members = p.gender === "M" ? [self, ...spouses] : [...[...spouses].reverse(), self];
    const ownerIndex = p.gender === "M" ? 0 : spouses.length;
    // chỉ số vợ/chồng trong mảng members
    for (const uu of unitUnions) {
      if (uu.spouseIndex != null) uu.spouseIndex = p.gender === "M" ? uu.spouseIndex + 1 : spouses.length - 1 - uu.spouseIndex;
    }

    const unit: Unit = {
      owner: pid,
      members,
      ownerIndex,
      unions: unitUnions,
      children: [],
      width: members.length * NODE_W + (members.length - 1) * SPOUSE_GAP,
      offset: 0,
      contourL: [],
      contourR: [],
      far,
    };

    const hasKids = unitUnions.some((uu) => g.unions.get(uu.uid)!.children.length > 0);
    if (hasKids) unit.toggle = { collapsed: opts.collapsed.has(pid), hidden: g.descendantCount(pid) };

    if (!opts.collapsed.has(pid)) {
      for (const uu of unitUnions) {
        for (const cid of g.unions.get(uu.uid)!.children) {
          const c = g.get(cid);
          if (!c || placed.has(cid)) continue;
          if (opts.hideNgoai && c.ngoai) continue;
          if (allowed && !allowed.has(cid)) continue;
          const child = build(cid);
          uu.children.push(child);
          unit.children.push(child);
        }
      }
    }
    arrange(unit);
    return unit;
  };

  const arrange = (unit: Unit) => {
    const kids = unit.children;
    if (!kids.length) {
      unit.contourL = [0];
      unit.contourR = [unit.width];
      return;
    }
    const accL: number[] = [];
    const accR: number[] = [];
    const offsets: number[] = [];
    kids.forEach((c, i) => {
      let off = 0;
      if (i > 0) {
        off = -Infinity;
        const n = Math.min(accR.length, c.contourL.length);
        for (let lvl = 0; lvl < n; lvl++) off = Math.max(off, accR[lvl] - c.contourL[lvl] + SIBLING_GAP);
      }
      offsets.push(off);
      for (let lvl = 0; lvl < c.contourL.length; lvl++) {
        accL[lvl] = Math.min(accL[lvl] ?? Infinity, c.contourL[lvl] + off);
        accR[lvl] = Math.max(accR[lvl] ?? -Infinity, c.contourR[lvl] + off);
      }
    });
    const anchorOf = (c: Unit) => c.ownerIndex * (NODE_W + SPOUSE_GAP) + NODE_W / 2;
    const first = offsets[0] + anchorOf(kids[0]);
    const last = offsets[kids.length - 1] + anchorOf(kids[kids.length - 1]);
    const parentLeft = (first + last) / 2 - unit.width / 2;
    kids.forEach((c, i) => (c.offset = offsets[i] - parentLeft));
    unit.contourL = [0, ...accL.map((v) => v - parentLeft)];
    unit.contourR = [unit.width, ...accR.map((v) => v - parentLeft)];
  };

  const nodes: LNode[] = [];
  const byPerson = new Map<number, LNode>();
  const lines: LLine[] = [];
  const farPairs: [number, number][] = [];

  const emit = (unit: Unit, left: number, orphan = false) => {
    const owner = g.get(unit.owner)!;
    const gen = owner.gen ?? 1;
    const y = rowY(gen);
    const memberNodes: LNode[] = unit.members.map((m, i) => {
      const x = left + i * (NODE_W + SPOUSE_GAP);
      const node: LNode =
        m.kind === "person"
          ? { key: `p${m.id}`, id: m.id, gender: g.get(m.id)!.gender, x, y, gen, owner: unit.owner, anchor: m.id === unit.owner, orphan }
          : { key: `u${m.unionId}`, id: null, unionId: m.unionId, gender: m.gender, x, y, gen, owner: unit.owner, anchor: false, orphan };
      if (node.anchor && unit.toggle) node.toggle = unit.toggle;
      nodes.push(node);
      if (node.id != null) byPerson.set(node.id, node);
      return node;
    });
    const self = memberNodes[unit.ownerIndex];
    const cy = y + NODE_H / 2;

    // Đường hôn nhân: vợ/chồng kề bên nối ngang, người thứ hai trở đi nối vòng phía trên
    unit.unions.forEach((uu, idx) => {
      if (uu.spouseIndex == null) return;
      const sp = memberNodes[uu.spouseIndex];
      const adjacent = Math.abs(uu.spouseIndex - unit.ownerIndex) === 1;
      if (adjacent) {
        const [a, b] = sp.x > self.x ? [self, sp] : [sp, self];
        lines.push({ kind: "marriage", pts: [a.x + NODE_W, cy, b.x, cy], unionId: uu.uid });
      } else {
        const top = y - 14 - idx * 7;
        const sx = self.x + NODE_W / 2 + (sp.x > self.x ? 16 : -16);
        const tx = sp.x + NODE_W / 2;
        lines.push({ kind: "marriage", pts: [sx, y, sx, top, tx, top, tx, y], unionId: uu.uid });
      }
    });
    for (const f of unit.far) farPairs.push([unit.owner, f]);

    // Đường nối con từ đúng cuộc hôn nhân
    let busIdx = 0;
    for (const uu of unit.unions) {
      if (!uu.children.length) continue;
      let ax = self.x + NODE_W / 2;
      let ay = y + NODE_H;
      if (uu.spouseIndex != null) {
        const sp = memberNodes[uu.spouseIndex];
        if (Math.abs(uu.spouseIndex - unit.ownerIndex) === 1) {
          ax = (Math.max(sp.x, self.x) + Math.min(sp.x, self.x) + NODE_W) / 2;
          ay = cy;
        } else {
          ax = sp.x + NODE_W / 2;
        }
      }
      const busY = y + NODE_H + 40 + busIdx * 10;
      busIdx++;
      const childXs = uu.children.map((c) => left + c.offset + c.ownerIndex * (NODE_W + SPOUSE_GAP) + NODE_W / 2);
      const childTop = rowY(gen + 1);
      lines.push({ kind: "child", pts: [ax, ay, ax, busY], unionId: uu.uid });
      const minX = Math.min(ax, ...childXs);
      const maxX = Math.max(ax, ...childXs);
      if (maxX > minX) lines.push({ kind: "child", pts: [minX, busY, maxX, busY], unionId: uu.uid });
      for (const cx of childXs) lines.push({ kind: "child", pts: [cx, busY, cx, childTop], unionId: uu.uid });
    }
    for (const c of unit.children) emit(c, left + c.offset, orphan);
  };

  let cursor = 0;
  if (g.rootId != null && g.get(g.rootId) && (!allowed || allowed.has(g.rootId))) {
    const root = build(g.rootId);
    const minL = Math.min(...root.contourL);
    emit(root, -minL);
    cursor = Math.max(...root.contourR) - minL + 160;
  }

  // Người chưa nối được vào cây (dữ liệu lỗi hoặc đang nhập dở) — đặt riêng bên phải
  if (!allowed) {
    for (const p of [...g.persons.values()].sort((a, b) => a.id - b.id)) {
      if (placed.has(p.id) || p.gen != null) continue;
      const unit = build(p.id);
      const minL = Math.min(...unit.contourL);
      emit(unit, cursor - minL, true);
      cursor += Math.max(...unit.contourR) - minL + 80;
    }
  }

  for (const [a, b] of farPairs) {
    const na = byPerson.get(a);
    const nb = byPerson.get(b);
    if (!na || !nb) continue;
    const ya = na.y + NODE_H;
    const yb = nb.y + NODE_H;
    const low = Math.max(ya, yb) + 22;
    lines.push({ kind: "far", pts: [na.x + NODE_W / 2, ya, na.x + NODE_W / 2, low, nb.x + NODE_W / 2, low, nb.x + NODE_W / 2, yb] });
  }

  let minX = 0, minY = 0, maxX = NODE_W, maxY = NODE_H;
  if (nodes.length) {
    minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_W);
      maxY = Math.max(maxY, n.y + NODE_H);
    }
  }
  const gens = [...new Set(nodes.map((n) => n.gen))].sort((a, b) => a - b);
  const rows = gens.map((gen) => ({ gen, y: rowY(gen), label: `Đời ${gen}` }));
  return { nodes, byPerson, lines, bounds: { minX, minY: minY - 40, maxX, maxY }, rows };
}
