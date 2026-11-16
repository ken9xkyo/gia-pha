import { describe, expect, it } from "vitest";
import type { RawLink, RawPerson, RawUnion } from "@/api/types";
import { FamilyGraph } from "./graph";
import { Kinship } from "./kinship";
import { mergeRules } from "./kinshipRules";
import { maternalTree, paternalTree } from "./testTrees";

const rules = mergeRules({});

function rel(tree: ReturnType<typeof paternalTree>, e: number, t: number) {
  const g = new FamilyGraph(tree);
  return new Kinship(g, rules, { id: e }).relate(t);
}

describe("Ví dụ kiểm thử PRD mục 8", () => {
  it("An → Hùng (em trai bố): gọi Chú, xưng cháu", () => {
    const r = rel(paternalTree(), 13, 7);
    expect(r.label).toBe("Chú");
    expect(r.xung).toBe("cháu");
    expect(r.call).toBe("Chú Hùng");
    expect(r.description).toBe("em trai của bố bạn");
  });

  it("An → vợ Hùng: gọi Thím, xưng cháu", () => {
    const r = rel(paternalTree(), 13, 8);
    expect(r.label).toBe("Thím");
    expect(r.xung).toBe("cháu");
    expect(r.description).toBe("vợ của em trai của bố bạn");
  });

  it("An → Lan (con anh trai bố, kém 5 tuổi): Chị họ, xưng em — ngành trên thắng tuổi", () => {
    const r = rel(paternalTree(), 13, 10);
    expect(r.label).toBe("Chị họ");
    expect(r.xung).toBe("em");
    expect(r.description).toBe("con gái của anh trai của bố bạn");
  });

  it("An → em gái của mẹ: gọi Dì, xưng cháu", () => {
    const r = rel(maternalTree(), 8, 5);
    expect(r.label).toBe("Dì");
    expect(r.xung).toBe("cháu");
    expect(r.description).toBe("em gái của mẹ bạn");
  });

  it("An → bố của ông nội: Cụ ông, xưng chắt", () => {
    const r = rel(paternalTree(), 13, 1);
    expect(r.label).toBe("Cụ ông");
    expect(r.xung).toBe("chắt");
    expect(r.description).toBe("bố của ông nội bạn");
  });

  it("Vợ An → Hùng: gọi Chú (theo chồng), xưng cháu", () => {
    const r = rel(paternalTree(), 14, 7);
    expect(r.label).toBe("Chú");
    expect(r.xung).toBe("cháu");
    expect(r.description).toBe("em trai của bố chồng bạn");
  });
});

describe("Bảng 8.2 — huyết thống", () => {
  const t = paternalTree();
  it.each([
    [13, 6, "Bố", "con"],
    [13, 3, "Ông nội", "cháu"],
    [13, 5, "Bác", "cháu"],
    [13, 12, "Anh", "em"],
    [12, 13, "Em trai", "anh"],
    [13, 15, "Con trai", "bố"],
    [6, 15, "Cháu nội", "ông"],
    [15, 7, "Ông chú", "cháu"],
    [15, 1, "Kỵ ông", "chút"],
    [13, 16, "Cô", "cháu"],
    [13, 18, "Em họ", "anh"],
    [7, 13, "Cháu", "chú"],
    [3, 18, "Cháu ngoại", "ông"],
  ])("%i → %i = %s (xưng %s)", (e, target, label, xung) => {
    const r = rel(t, e, target);
    expect(r.label).toBe(label);
    expect(r.xung).toBe(xung);
  });

  it("anh chị em họ xa thêm hậu tố 'họ'", () => {
    // Khôi (đời 5) → Lan (đời 4, con của ông bác Bảo — ngành trên): g=+1, dT=2 → Bác họ
    const r = rel(t, 15, 10);
    expect(r.label).toBe("Bác họ");
  });
});

describe("Bảng 8.2 — bên ngoại", () => {
  const t = maternalTree();
  it.each([
    [8, 3, "Bác"],
    [8, 6, "Cậu"],
    [8, 9, "Mợ"],
    [8, 10, "Chú"],
    [8, 1, "Ông ngoại"],
    [1, 8, "Cháu ngoại"],
    [8, 4, "Mẹ"],
    [8, 7, "Bố"],
  ])("%i → %i = %s", (e, target, label) => {
    expect(rel(t, e, target).label).toBe(label);
  });
});

describe("Thiếu dữ liệu và trường hợp đặc biệt", () => {
  it("thiếu thứ tự và năm sinh → nhãn dự phòng 'Bác hoặc Chú'", () => {
    const tree = paternalTree();
    for (const p of tree.persons) {
      if (p.id === 7) {
        delete p.o;
        delete p.by;
      }
    }
    const r = rel(tree, 13, 7);
    expect(r.label).toBe("Bác hoặc Chú");
    expect(r.uncertain).toBe(true);
    expect(r.note).toContain("Chưa rõ thứ bậc");
  });

  it("thiếu thứ tự thì so năm sinh", () => {
    const tree = paternalTree();
    for (const p of tree.persons) if (p.id === 5 || p.id === 6) delete p.o;
    expect(rel(tree, 13, 5).label).toBe("Bác");
  });

  it("vợ/chồng của nhau", () => {
    const r = rel(paternalTree(), 13, 14);
    expect(r.label).toBe("Vợ");
    expect(r.xung).toBe("anh");
  });

  it("dâu gọi bố chồng là Bố", () => {
    const r = rel(paternalTree(), 14, 6);
    expect(r.label).toBe("Bố");
    expect(r.description).toBe("bố chồng bạn");
    expect(r.xung).toBe("con");
  });

  it("dâu gọi anh chồng", () => {
    const r = rel(paternalTree(), 14, 12);
    expect(r.label).toBe("Anh");
    expect(r.description).toBe("anh chồng bạn");
  });

  it("dâu chưa có trên cây: 'tôi là vợ của Quang'", () => {
    const g = new FamilyGraph(paternalTree());
    const k = new Kinship(g, rules, { spouseOf: 12, gender: "F" });
    expect(k.relate(7).label).toBe("Chú");
    expect(k.relate(7).xung).toBe("cháu");
    expect(k.relate(12).label).toBe("Chồng");
    expect(k.relate(13).description).toBe("em chồng bạn");
  });

  it("hai bước hôn nhân cùng vế → nhãn chung", () => {
    // Vợ An → vợ của Quang? Quang chưa có vợ; dùng chồng của Hằng (cô của An) từ phía vợ An = vai trên → theo chồng
    const r = rel(paternalTree(), 14, 17);
    expect(r.label).toBe("Chú");
    const g = new FamilyGraph(paternalTree());
    const k = new Kinship(g, rules, { spouseOf: 12, gender: "F" });
    expect(k.relate(14).label).toBe("Họ hàng bên chồng");
  });

  it("admin sửa nhãn theo tập quán riêng (FR-57)", () => {
    const g = new FamilyGraph(maternalTree());
    const custom = mergeRules({ pibling_ngoai_elder: { m: "Cậu" }, pibling_ngoai_younger: { sf: "Dượng" } });
    const k = new Kinship(g, custom, { id: 8 });
    expect(k.relate(3).label).toBe("Cậu");
    expect(k.relate(10).label).toBe("Dượng");
  });

  it("đường nối đi qua tổ tiên chung", () => {
    const r = rel(paternalTree(), 13, 10);
    expect(r.path).toEqual([13, 6, 3, 5, 10]);
  });
});

describe("Hiệu năng", () => {
  it("tính xưng hô cho cây 5.000 người dưới 200 ms", () => {
    const persons: RawPerson[] = [{ id: 1, n: "Tổ", g: "M" }];
    const unions: RawUnion[] = [];
    const links: RawLink[] = [];
    let nextId = 2;
    let uid = 1;
    let lid = 1;
    let frontier = [1];
    while (nextId <= 5000) {
      const next: number[] = [];
      for (const pid of frontier) {
        if (nextId > 5000) break;
        const wife = nextId++;
        persons.push({ id: wife, n: `Vợ ${wife}`, g: "F" });
        unions.push({ id: uid, h: pid, w: wife, k: "chinh_that", o: 1, s: "married" });
        for (let i = 0; i < 3 && nextId <= 5000; i++) {
          const c = nextId++;
          persons.push({ id: c, n: `Người ${c}`, g: i % 2 ? "F" : "M", o: i + 1 });
          links.push({ id: lid++, c, u: uid, k: "biological" });
          next.push(c);
        }
        uid++;
      }
      frontier = next;
    }
    const g = new FamilyGraph({ version: 1, root: 1, clan: "", kinship: {}, persons, unions, links });
    const start = performance.now();
    const all = new Kinship(g, rules, { id: 4000 }).relateAll();
    const ms = performance.now() - start;
    expect(all.size).toBe(5000);
    expect(ms).toBeLessThan(200);
  });
});
