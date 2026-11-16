/**
 * Thuật toán xưng hô miền Bắc (PRD mục 8.1).
 *
 * E = tôi, T = người được xem. Tìm tổ tiên chung gần nhất A, tính chênh lệch đời
 * g = dE − dT, xác định bên nội/ngoại và ngành trên/dưới, tra bảng quy tắc; nếu không
 * cùng huyết thống thì đi qua tối đa một bước hôn nhân ở mỗi đầu.
 */
import type { Gender } from "@/api/types";
import type { FamilyGraph } from "./graph";
import type { Rules } from "./kinshipRules";
import { givenName } from "./text";

export type Ego = { id: number } | { spouseOf: number; gender: Gender };
export const VIRTUAL_ID = -1;

export interface Relation {
  key: string;
  /** Nhãn hiển thị trên huy hiệu, VD "Bác" */
  label: string;
  /** Cách gọi kèm tên, VD "Bác Hùng" */
  call: string;
  /** Từ tôi xưng với người đó, VD "cháu" */
  xung: string;
  /** Mô tả quan hệ bằng lời, VD "anh trai của bố bạn" */
  description: string;
  uncertain: boolean;
  note?: string;
  /** Đường nối từ tôi tới người đó (để làm nổi trên cây) */
  path: number[];
}

interface Anc {
  dist: number;
  child: number | null;
}

interface Blood {
  a: number;
  dE: number;
  dT: number;
  /** A → … → E */
  pathE: number[];
  /** A → … → T */
  pathT: number[];
}

interface Classified {
  key: string;
  alt?: string;
  n?: number;
  suffix: boolean;
}

const NO_NAME_KEYS = new Set(["self", "spouse", "parent", "grandparent_noi", "grandparent_ngoai", "inlaw_parent"]);
const FIRST_WORD_CALL = new Set([
  "great_grandparent", "great2_grandparent", "grandpibling_noi_elder", "grandpibling_noi_younger",
  "grandpibling_ngoai_elder", "grandpibling_ngoai_younger", "grand_collateral",
]);

const firstWord = (s: string) => s.split(/\s+/)[0] ?? s;
const reverse = (b: Blood): Blood => ({ a: b.a, dE: b.dT, dT: b.dE, pathE: b.pathT, pathT: b.pathE });

export class Kinship {
  private ancCache = new Map<number, Map<number, Anc>>();
  readonly egoId: number;
  private virtual: { spouseOf: number; gender: Gender } | null;

  constructor(
    private readonly g: FamilyGraph,
    private readonly rules: Rules,
    ego: Ego,
  ) {
    if ("id" in ego) {
      this.egoId = ego.id;
      this.virtual = null;
    } else {
      this.egoId = VIRTUAL_ID;
      this.virtual = ego;
    }
  }

  // ---- truy cập đồ thị (có "tôi" ảo cho người chưa có trên cây) --------
  private gender(id: number): Gender {
    if (id === VIRTUAL_ID) return this.virtual!.gender;
    return this.g.get(id)?.gender ?? "M";
  }

  private spouses(id: number): number[] {
    if (id === VIRTUAL_ID) return this.virtual ? [this.virtual.spouseOf] : [];
    const list = this.g.spouses(id);
    if (this.virtual && id === this.virtual.spouseOf) list.push(VIRTUAL_ID);
    return list;
  }

  private parents(id: number): number[] {
    if (id === VIRTUAL_ID) return [];
    const p = this.g.get(id);
    if (!p) return [];
    const out: number[] = [];
    if (p.father != null) out.push(p.father);
    if (p.mother != null) out.push(p.mother);
    return out;
  }

  private ancestors(id: number): Map<number, Anc> {
    const cached = this.ancCache.get(id);
    if (cached) return cached;
    const map = new Map<number, Anc>([[id, { dist: 0, child: null }]]);
    const queue = [id];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      const d = map.get(cur)!.dist;
      for (const p of this.parents(cur)) {
        if (map.has(p)) continue;
        map.set(p, { dist: d + 1, child: cur });
        queue.push(p);
      }
    }
    this.ancCache.set(id, map);
    return map;
  }

  private blood(e: number, t: number): Blood | null {
    const ea = this.ancestors(e);
    const ta = this.ancestors(t);
    let best: number | null = null;
    let bestTotal = Infinity;
    for (const [a, anc] of ta) {
      const x = ea.get(a);
      if (!x) continue;
      const total = x.dist + anc.dist;
      if (total < bestTotal) {
        bestTotal = total;
        best = a;
      }
    }
    if (best == null) return null;
    const chain = (map: Map<number, Anc>) => {
      const out = [best!];
      let cur = map.get(best!)!.child;
      while (cur != null) {
        out.push(cur);
        cur = map.get(cur)!.child;
      }
      return out;
    };
    const pathE = chain(ea);
    const pathT = chain(ta);
    return { a: best, dE: pathE.length - 1, dT: pathT.length - 1, pathE, pathT };
  }

  /** −1: nhánh a là ngành trên của b; 1: ngành dưới; 0: chưa rõ. */
  private seniority(a: number, b: number): -1 | 0 | 1 {
    const pa = this.g.get(a);
    const pb = this.g.get(b);
    if (!pa || !pb) return 0;
    if (pa.order != null && pb.order != null && pa.order !== pb.order) return pa.order < pb.order ? -1 : 1;
    // Thiếu thứ tự → so ngày sinh (chỉ khi đủ độ chính xác để phân biệt)
    if (!pa.birthYear || !pb.birthYear) return 0;
    if (pa.birthYear !== pb.birthYear) return pa.birthYear < pb.birthYear ? -1 : 1;
    if (!pa.birthMonth || !pb.birthMonth) return 0;
    if (pa.birthMonth !== pb.birthMonth) return pa.birthMonth < pb.birthMonth ? -1 : 1;
    if (!pa.birthDay || !pb.birthDay || pa.birthDay === pb.birthDay) return 0;
    return pa.birthDay < pb.birthDay ? -1 : 1;
  }

  // ---- phân loại theo bảng 8.2 ------------------------------------------
  private classify(b: Blood): Classified {
    const { dE, dT, pathE, pathT } = b;
    const g = dE - dT;
    if (dE === 0 && dT === 0) return { key: "self", suffix: false };
    if (dT === 0) {
      if (g === 1) return { key: "parent", suffix: false };
      if (g === 2) {
        const parentOnPath = pathE[dE - 1];
        return { key: this.gender(parentOnPath) === "M" ? "grandparent_noi" : "grandparent_ngoai", suffix: false };
      }
      if (g === 3) return { key: "great_grandparent", suffix: false };
      if (g === 4) return { key: "great2_grandparent", suffix: false };
      return { key: "ancestor_far", n: g, suffix: false };
    }
    if (dE === 0) {
      const k = dT;
      if (k === 1) return { key: "child", suffix: false };
      if (k === 2) return { key: this.gender(pathT[1]) === "M" ? "grandchild_noi" : "grandchild_ngoai", suffix: false };
      if (k === 3) return { key: "great_grandchild", suffix: false };
      if (k === 4) return { key: "great2_grandchild", suffix: false };
      if (k === 5) return { key: "great3_grandchild", suffix: false };
      return { key: "descendant_far", n: k, suffix: false };
    }

    const cE = pathE[1];
    const cT = pathT[1];
    const sen = this.seniority(cT, cE);
    const pick = (base: string, suffix: boolean): Classified =>
      sen === 0
        ? { key: `${base}_elder`, alt: `${base}_younger`, suffix }
        : { key: `${base}_${sen < 0 ? "elder" : "younger"}`, suffix };

    if (g === 0) return pick(dE === 1 ? "sibling" : "cousin", false);
    if (g === 1) {
      const side = this.gender(pathE[dT]) === "M" ? "noi" : "ngoai";
      return pick(`pibling_${side}`, dT >= 2);
    }
    if (g === 2) {
      if (dT === 1) return pick(`grandpibling_${this.gender(cE) === "M" ? "noi" : "ngoai"}`, false);
      return { key: "grand_collateral", suffix: false };
    }
    if (g === 3) return { key: "great_grandparent", suffix: false };
    if (g === 4) return { key: "great2_grandparent", suffix: false };
    if (g >= 5) return { key: "ancestor_far", n: g, suffix: false };
    if (g === -1) return { key: "nibling", suffix: dE >= 2 };
    if (g === -2) return { key: "grandnibling", suffix: dE >= 2 };
    if (g === -3) return { key: "great_grandchild", suffix: false };
    if (g === -4) return { key: "great2_grandchild", suffix: false };
    if (g === -5) return { key: "great3_grandchild", suffix: false };
    return { key: "descendant_far", n: -g, suffix: false };
  }

  // ---- nhãn ---------------------------------------------------------------
  private fill(s: string, n?: number): string {
    return n != null ? s.replace("{n}", String(n)) : s;
  }

  private withSuffix(label: string, suffix: boolean): string {
    if (!suffix) return label;
    const word = this.rules.ho_suffix?.m ?? "họ";
    return label.endsWith(` ${word}`) ? label : `${label} ${word}`;
  }

  private label(key: string, gender: Gender, n?: number): string {
    const r = this.rules[key] ?? this.rules.unknown;
    return this.fill(gender === "M" ? r.m : r.f, n);
  }

  private spouseLabel(key: string, partnerGender: Gender, n?: number): string {
    const r = this.rules[key] ?? this.rules.unknown;
    const v = partnerGender === "M" ? r.sm : r.sf;
    return this.fill(v ?? (partnerGender === "M" ? r.f : r.m), n);
  }

  private pronoun(key: string, gender: Gender, label: string): string {
    const r = this.rules[key];
    const explicit = r ? (gender === "M" ? r.pm : r.pf) : undefined;
    if (explicit != null) return explicit;
    return firstWord(label).toLowerCase();
  }

  private labelOf(c: Classified, gender: Gender) {
    const main = this.withSuffix(this.label(c.key, gender, c.n), c.suffix);
    if (!c.alt) return { label: main, uncertain: false, parts: [main] };
    const alt = this.withSuffix(this.label(c.alt, gender, c.n), c.suffix);
    return main === alt
      ? { label: main, uncertain: false, parts: [main] }
      : { label: `${main} hoặc ${alt}`, uncertain: true, parts: [main, alt] };
  }

  private spouseLabelOf(c: Classified, partnerGender: Gender) {
    const main = this.withSuffix(this.spouseLabel(c.key, partnerGender, c.n), c.suffix);
    if (!c.alt) return { label: main, uncertain: false, parts: [main] };
    const alt = this.withSuffix(this.spouseLabel(c.alt, partnerGender, c.n), c.suffix);
    return main === alt
      ? { label: main, uncertain: false, parts: [main] }
      : { label: `${main} hoặc ${alt}`, uncertain: true, parts: [main, alt] };
  }

  private pronounOf(c: Classified, targetGender: Gender): string {
    const parts = [c.key, ...(c.alt ? [c.alt] : [])].map((k) =>
      this.pronoun(k, targetGender, this.label(k, targetGender, c.n)),
    );
    return [...new Set(parts)].join("/");
  }

  private spousePronounOf(c: Classified, partnerGender: Gender): string {
    const parts = [c.key, ...(c.alt ? [c.alt] : [])].map((k) =>
      firstWord(this.spouseLabel(k, partnerGender, c.n)).toLowerCase(),
    );
    return [...new Set(parts)].join("/");
  }

  private call(t: number, info: { label: string; uncertain: boolean; parts: string[] }, key: string, noName = false): string {
    if (noName || t === VIRTUAL_ID) return info.label;
    const name = givenName(this.g.get(t)?.name ?? "");
    if (info.uncertain) return `${info.parts.map(firstWord).join("/")} ${name}`;
    if (NO_NAME_KEYS.has(key)) return info.label;
    const word = FIRST_WORD_CALL.has(key) ? firstWord(info.label) : info.label.replace(/\s+họ$/, "");
    const short = /^(Con|Cháu|Chắt|Chút|Chít|Em) /.test(word) ? firstWord(word) : word;
    return `${short} ${name}`;
  }

  // ---- mô tả bằng lời -----------------------------------------------------
  private ancestorPhrase(pathE: number[], k: number, owner: string): string {
    const dE = pathE.length - 1;
    const x = pathE[dE - k];
    const male = this.gender(x) === "M";
    if (k === 1) return `${male ? "bố" : "mẹ"} ${owner}`;
    if (k === 2) {
      const side = this.gender(pathE[dE - 1]) === "M" ? "nội" : "ngoại";
      return `${male ? "ông" : "bà"} ${side} ${owner}`;
    }
    if (k === 3) return `${male ? "bố" : "mẹ"} của ${this.ancestorPhrase(pathE, 2, owner)}`;
    if (k === 4) return `${male ? "kỵ ông" : "kỵ bà"} của ${owner}`;
    return `tổ tiên đời thứ ${k} của ${owner}`;
  }

  private descWord(k: number, gender: Gender, firstChildGender?: Gender, direct = false): string {
    if (k === 1) return gender === "M" ? "con trai" : "con gái";
    if (k === 2) return direct ? (firstChildGender === "F" ? "cháu ngoại" : "cháu nội") : "cháu";
    if (k === 3) return "chắt";
    if (k === 4) return "chút";
    if (k === 5) return "chít";
    return `hậu duệ đời thứ ${k}`;
  }

  private siblingWord(y: number, sen: -1 | 0 | 1): string {
    const male = this.gender(y) === "M";
    if (sen < 0) return male ? "anh trai" : "chị gái";
    if (sen > 0) return male ? "em trai" : "em gái";
    return male ? "anh/em trai" : "chị/em gái";
  }

  private describe(b: Blood, owner: string): string {
    const { dE, dT, pathE, pathT } = b;
    if (dE === 0 && dT === 0) return `chính ${owner}`;
    const t = pathT[dT];
    if (dT === 0) return this.ancestorPhrase(pathE, dE, owner);
    if (dE === 0) return `${this.descWord(dT, this.gender(t), this.gender(pathT[1]), true)} của ${owner}`;
    const cE = pathE[1];
    const cT = pathT[1];
    const base = dE - 1 === 0 ? owner : this.ancestorPhrase(pathE, dE - 1, owner);
    const sib = `${this.siblingWord(cT, this.seniority(cT, cE))} của ${base}`;
    if (dT === 1) return sib;
    return `${this.descWord(dT - 1, this.gender(t))} của ${sib}`;
  }

  private pathOf(b: Blood): number[] {
    return [...[...b.pathE].reverse(), ...b.pathT.slice(1)];
  }

  // ---- API ----------------------------------------------------------------
  relate(t: number): Relation {
    const e = this.egoId;
    if (e === t) {
      return { key: "self", label: "Bạn", call: "Bạn", xung: "", description: "Đây là bạn", uncertain: false, path: [e] };
    }
    const b = this.blood(e, t);
    if (b) return this.fromBlood(e, t, b);

    if (this.spouses(e).includes(t)) {
      const label = this.label("spouse", this.gender(t));
      return {
        key: "spouse",
        label,
        call: label,
        xung: this.pronoun("spouse", this.gender(e), this.label("spouse", this.gender(e))),
        description: `${this.gender(t) === "M" ? "chồng" : "vợ"} của bạn`,
        uncertain: false,
        path: [e, t],
      };
    }

    // T là dâu/rể của một người R cùng huyết thống với tôi (bảng 8.3)
    let best: { r: number; b: Blood } | null = null;
    for (const r of this.spouses(t)) {
      const rb = this.blood(e, r);
      if (rb && (!best || rb.dE + rb.dT < best.b.dE + best.b.dT)) best = { r, b: rb };
    }
    if (best) return this.viaSpouseOfRelative(e, t, best.r, best.b);

    // Tôi là dâu/rể: gọi theo vợ/chồng mình
    for (const s of this.spouses(e)) {
      const sb = this.blood(s, t);
      if (sb) return this.asInlaw(e, s, t, sb);
    }
    for (const s of this.spouses(e)) {
      for (const r of this.spouses(t)) {
        if (r === s) continue;
        const rb = this.blood(s, r);
        if (rb) return this.twoSteps(e, s, t, r, rb);
      }
    }
    const label = this.label("unknown", this.gender(t));
    return {
      key: "unknown",
      label,
      call: label,
      xung: "",
      description: "Không xác định được quan hệ trên cây",
      uncertain: true,
      path: [],
    };
  }

  relateAll(): Map<number, Relation> {
    const out = new Map<number, Relation>();
    for (const id of this.g.persons.keys()) out.set(id, this.relate(id));
    return out;
  }

  private note(uncertain: boolean) {
    return uncertain ? "Chưa rõ thứ bậc — cần bổ sung thứ tự anh chị em hoặc ngày sinh" : undefined;
  }

  private fromBlood(e: number, t: number, b: Blood): Relation {
    const c = this.classify(b);
    const info = this.labelOf(c, this.gender(t));
    const rc = this.classify(reverse(b));
    return {
      key: c.key,
      label: info.label,
      call: this.call(t, info, c.key),
      xung: this.pronounOf(rc, this.gender(e)),
      description: this.describe(b, "bạn"),
      uncertain: info.uncertain,
      note: this.note(info.uncertain),
      path: this.pathOf(b),
    };
  }

  private viaSpouseOfRelative(e: number, t: number, r: number, b: Blood): Relation {
    const c = this.classify(b);
    const info = this.spouseLabelOf(c, this.gender(r));
    const rc = this.classify(reverse(b));
    const xung = this.pronounOf(rc, this.gender(e));
    return {
      key: c.key,
      label: info.label,
      call: this.call(t, info, c.key, c.key === "parent"),
      xung,
      description: `${this.gender(t) === "M" ? "chồng" : "vợ"} của ${this.describe(b, "bạn")}`,
      uncertain: info.uncertain,
      note: this.note(info.uncertain),
      path: [...this.pathOf(b), t],
    };
  }

  private asInlaw(e: number, s: number, t: number, b: Blood): Relation {
    const c = this.classify(b);
    const owner = `${this.gender(s) === "M" ? "chồng" : "vợ"} bạn`;
    const tMale = this.gender(t) === "M";
    let key = c.key;
    let description: string;
    if (c.key === "parent") {
      key = "inlaw_parent";
      description = `${tMale ? "bố" : "mẹ"} ${owner}`;
    } else if (b.dE === 1 && b.dT === 1) {
      const sen = this.seniority(t, s);
      const word = sen < 0 ? (tMale ? "anh" : "chị") : sen > 0 ? "em" : tMale ? "anh/em" : "chị/em";
      description = `${word} ${owner}`;
    } else {
      description = this.describe(b, owner);
    }
    const info = this.labelOf({ ...c, key }, this.gender(t));
    const rc = this.classify(reverse(b));
    return {
      key,
      label: info.label,
      call: this.call(t, info, key),
      xung: this.spousePronounOf(rc, this.gender(s)),
      description,
      uncertain: info.uncertain,
      note: this.note(info.uncertain),
      path: [e, ...this.pathOf(b)],
    };
  }

  private twoSteps(e: number, s: number, t: number, r: number, b: Blood): Relation {
    const c = this.classify(b);
    const owner = `${this.gender(s) === "M" ? "chồng" : "vợ"} bạn`;
    const elder = b.dE - b.dT > 0;
    let info: { label: string; uncertain: boolean; parts: string[] };
    let key = c.key;
    let xung = "";
    if (elder) {
      // Người vai trên bên nhà chồng/vợ: gọi theo vợ/chồng mình (VD: thím, mợ)
      info = this.spouseLabelOf(c, this.gender(r));
      const rc = this.classify(reverse(b));
      xung = this.spousePronounOf(rc, this.gender(s));
    } else {
      key = this.gender(s) === "M" ? "inlaw_relative_husband" : "inlaw_relative_wife";
      const label = this.label(key, this.gender(t));
      info = { label, uncertain: false, parts: [label] };
    }
    return {
      key,
      label: info.label,
      call: elder ? this.call(t, info, key) : info.label,
      xung,
      description: `${this.gender(t) === "M" ? "chồng" : "vợ"} của ${this.describe(b, owner)}`,
      uncertain: info.uncertain,
      note: this.note(info.uncertain),
      path: [e, ...this.pathOf(b), t],
    };
  }
}
