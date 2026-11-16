import type { Gender, LinkKind, RawLink, RawTree, RuleOverrides, UnionKind, UnionStatus } from "@/api/types";
import { normalize } from "./text";

export interface PNode {
  id: number;
  name: string;
  gender: Gender;
  birthYear?: number;
  birthMonth?: number;
  birthDay?: number;
  birthApprox: boolean;
  birthLunar: boolean;
  deathYear?: number;
  status: "alive" | "deceased" | "unknown";
  order?: number;
  ownBranch?: string;
  photo?: string;
  tenHuy?: string;
  version?: number;
  // ---- tính toán ----
  parentUnion: number | null;
  parentLink: RawLink | null;
  father: number | null;
  mother: number | null;
  unions: number[];
  gen: number | null;
  lineage: boolean;
  /** Dòng ngoại: đường về thủy tổ đi qua một người con gái */
  ngoai: boolean;
  branch: string | null;
  search: string;
}

export interface UNode {
  id: number;
  husband: number | null;
  wife: number | null;
  kind: UnionKind;
  order: number;
  status: UnionStatus;
  version?: number;
  /** Con có quan hệ chính (ưu tiên ruột) với cuộc hôn nhân này, đã sắp xếp trưởng → út */
  children: number[];
  /** Mọi liên kết con (kể cả quan hệ phụ như con nuôi của một nhà khác) */
  allLinks: RawLink[];
}

const LINK_PRIORITY: Record<LinkKind, number> = { biological: 0, adopted: 1, step: 2 };

export function compareSiblings(a: PNode, b: PNode): number {
  const ao = a.order ?? 999;
  const bo = b.order ?? 999;
  if (ao !== bo) return ao - bo;
  const ab = birthKey(a);
  const bb = birthKey(b);
  if (ab && bb && ab !== bb) return ab - bb;
  return a.id - b.id;
}

export function birthKey(p: PNode): number | null {
  if (!p.birthYear) return null;
  return p.birthYear * 10000 + (p.birthMonth ?? 0) * 100 + (p.birthDay ?? 0);
}

export class FamilyGraph {
  readonly persons = new Map<number, PNode>();
  readonly unions = new Map<number, UNode>();
  readonly links = new Map<number, RawLink>();
  readonly rootId: number | null;
  readonly version: number;
  readonly clan: string;
  readonly kinshipOverrides: RuleOverrides;
  readonly branches: string[];
  private descCount = new Map<number, number>();

  constructor(raw: RawTree) {
    this.rootId = raw.root;
    this.version = raw.version;
    this.clan = raw.clan;
    this.kinshipOverrides = raw.kinship ?? {};

    for (const r of raw.persons) {
      this.persons.set(r.id, {
        id: r.id,
        name: r.n,
        gender: r.g,
        birthYear: r.by,
        birthMonth: r.bm,
        birthDay: r.bd,
        birthApprox: !!r.ba,
        birthLunar: !!r.bl,
        deathYear: r.dy,
        status: r.st === "a" ? "alive" : r.st === "d" ? "deceased" : "unknown",
        order: r.o,
        ownBranch: r.br,
        photo: r.ph,
        tenHuy: r.th,
        version: r.v,
        parentUnion: null,
        parentLink: null,
        father: null,
        mother: null,
        unions: [],
        gen: null,
        lineage: false,
        ngoai: false,
        branch: null,
        search: normalize(`${r.n} ${r.th ?? ""}`),
      });
    }
    for (const u of raw.unions) {
      this.unions.set(u.id, {
        id: u.id,
        husband: u.h,
        wife: u.w,
        kind: u.k,
        order: u.o,
        status: u.s,
        version: u.v,
        children: [],
        allLinks: [],
      });
      for (const pid of [u.h, u.w]) {
        if (pid != null) this.persons.get(pid)?.unions.push(u.id);
      }
    }
    for (const p of this.persons.values()) {
      p.unions.sort((a, b) => this.unions.get(a)!.order - this.unions.get(b)!.order || a - b);
    }
    for (const l of raw.links) {
      this.links.set(l.id, l);
      const child = this.persons.get(l.c);
      const union = this.unions.get(l.u);
      if (!child || !union) continue;
      union.allLinks.push(l);
      if (!child.parentLink || LINK_PRIORITY[l.k] < LINK_PRIORITY[child.parentLink.k]) child.parentLink = l;
    }
    for (const p of this.persons.values()) {
      if (!p.parentLink) continue;
      const u = this.unions.get(p.parentLink.u)!;
      p.parentUnion = u.id;
      p.father = u.husband;
      p.mother = u.wife;
      u.children.push(p.id);
    }
    for (const u of this.unions.values()) {
      u.children.sort((a, b) => compareSiblings(this.persons.get(a)!, this.persons.get(b)!));
    }
    this.computeLineage();
    const set = new Set<string>();
    for (const p of this.persons.values()) if (p.branch) set.add(p.branch);
    this.branches = [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }

  private computeLineage(): void {
    const root = this.rootId != null ? this.persons.get(this.rootId) : undefined;
    if (!root) return;
    root.gen = 1;
    root.lineage = true;
    root.branch = root.ownBranch ?? null;
    const queue: number[] = [root.id];
    for (let i = 0; i < queue.length; i++) {
      const p = this.persons.get(queue[i])!;
      for (const uid of p.unions) {
        const u = this.unions.get(uid)!;
        const otherId = u.husband === p.id ? u.wife : u.husband;
        const other = otherId != null ? this.persons.get(otherId) : undefined;
        if (other && other.gen == null) {
          other.gen = p.gen;
          if (!other.lineage) other.branch = other.ownBranch ?? (p.lineage ? p.branch : null);
          queue.push(other.id);
        }
        if (!p.lineage) continue;
        for (const cid of u.children) {
          const c = this.persons.get(cid)!;
          if (c.lineage) continue;
          c.lineage = true;
          c.gen = (p.gen ?? 0) + 1;
          // Kế thừa từ cha nếu cha thuộc dòng họ, nếu không thì qua mẹ (dòng ngoại)
          const father = u.husband != null ? this.persons.get(u.husband) : undefined;
          const viaFather = father?.lineage ? father : null;
          const bloodParent = viaFather ?? p;
          c.ngoai = viaFather ? viaFather.ngoai : true;
          c.branch = c.ownBranch ?? bloodParent.branch;
          queue.push(c.id);
        }
      }
    }
  }

  get(id: number): PNode | undefined {
    return this.persons.get(id);
  }

  partnerIn(uid: number, pid: number): number | null {
    const u = this.unions.get(uid);
    if (!u) return null;
    return u.husband === pid ? u.wife : u.husband;
  }

  spouses(pid: number): number[] {
    const p = this.persons.get(pid);
    if (!p) return [];
    const out: number[] = [];
    for (const uid of p.unions) {
      const s = this.partnerIn(uid, pid);
      if (s != null) out.push(s);
    }
    return out;
  }

  children(pid: number): number[] {
    const p = this.persons.get(pid);
    if (!p) return [];
    return p.unions.flatMap((uid) => this.unions.get(uid)!.children);
  }

  /** Anh chị em (ruột và cùng cha/mẹ khác), sắp theo thứ tự. */
  siblings(pid: number): number[] {
    const p = this.persons.get(pid);
    if (!p) return [];
    const set = new Set<number>();
    for (const parent of [p.father, p.mother]) {
      if (parent != null) for (const c of this.children(parent)) set.add(c);
    }
    if (p.parentUnion != null) for (const c of this.unions.get(p.parentUnion)!.children) set.add(c);
    set.delete(pid);
    return [...set].sort((a, b) => compareSiblings(this.persons.get(a)!, this.persons.get(b)!));
  }

  descendantCount(pid: number): number {
    const cached = this.descCount.get(pid);
    if (cached != null) return cached;
    let total = 0;
    const seen = new Set<number>([pid]);
    const stack = [pid];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of this.children(cur)) {
        if (seen.has(c)) continue;
        seen.add(c);
        total++;
        stack.push(c);
      }
    }
    this.descCount.set(pid, total);
    return total;
  }

  /** Đường từ một người lên thủy tổ theo huyết thống. */
  lineToRoot(pid: number): number[] {
    const out: number[] = [];
    let cur = this.persons.get(pid);
    const seen = new Set<number>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      out.push(cur.id);
      if (!cur.lineage) {
        const s = this.spouses(cur.id).find((x) => this.persons.get(x)?.lineage);
        cur = s != null ? this.persons.get(s) : undefined;
        continue;
      }
      const f = cur.father != null ? this.persons.get(cur.father) : undefined;
      const m = cur.mother != null ? this.persons.get(cur.mother) : undefined;
      cur = f?.lineage ? f : m?.lineage ? m : undefined;
    }
    return out;
  }

  /** Mô tả ngắn để phân biệt người trùng tên: đời + tên cha/mẹ hoặc vợ/chồng. */
  hint(pid: number): string {
    const p = this.persons.get(pid);
    if (!p) return "";
    const parts: string[] = [];
    if (p.gen) parts.push(`Đời ${p.gen}`);
    const f = p.father != null ? this.persons.get(p.father) : undefined;
    const m = p.mother != null ? this.persons.get(p.mother) : undefined;
    if (f || m) parts.push(`con ${[f?.name, m?.name].filter(Boolean).join(" & ")}`);
    else {
      const s = this.spouses(pid)[0];
      if (s != null) parts.push(`${p.gender === "F" ? "vợ" : "chồng"} ${this.persons.get(s)?.name}`);
    }
    return parts.join(" · ");
  }
}
