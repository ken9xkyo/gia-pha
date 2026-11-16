import { describe, expect, it } from "vitest";
import type { RawTree } from "@/api/types";
import { FamilyGraph } from "./graph";
import { Kinship } from "./kinship";
import { mergeRules } from "./kinshipRules";
import { NODE_W } from "./layout";
import { computeLayout } from "./layout";
import { computeNetworkLayout, describePath, findPath } from "./network";
import { paternalTree } from "./testTrees";

const rules = mergeRules({});

/** Cây bên nội + nhà thông gia của Ngọc (14, vợ An): cha 30, mẹ 31, em trai 32 (vợ 33, con 34). */
function networkTree(): RawTree {
  const t = paternalTree();
  return {
    ...t,
    persons: [
      ...t.persons,
      { id: 30, n: "Vũ Văn Thành", g: "M", by: 1940 },
      { id: 31, n: "Lê Thị Hoa", g: "F" },
      { id: 32, n: "Vũ Văn Tài", g: "M" },
      { id: 33, n: "Ngô Thị Duyên", g: "F" },
      { id: 34, n: "Vũ Minh Tú", g: "M" },
      { id: 40, n: "Người nhập dở", g: "M" },
    ],
    unions: [
      ...t.unions,
      { id: 130, h: 30, w: 31, k: "chinh_that", o: 1, s: "married" },
      { id: 131, h: 32, w: 33, k: "chinh_that", o: 1, s: "married" },
    ],
    links: [
      ...t.links,
      { id: 230, c: 14, u: 130, k: "biological" },
      { id: 231, c: 32, u: 130, k: "biological" },
      { id: 232, c: 34, u: 131, k: "biological" },
    ],
  };
}

const rel = (e: number, t: number) => new Kinship(new FamilyGraph(networkTree()), rules, { id: e }).relate(t);

describe("Phân loại trong mạng lưới", () => {
  it("huyết thống, dâu/rể, nhà thông gia, chưa nối", () => {
    const g = new FamilyGraph(networkTree());
    expect(g.get(13)!.kind).toBe("lineage");
    expect(g.get(14)!.kind).toBe("inlaw");
    expect([30, 31, 32, 33, 34].map((id) => g.get(id)!.kind)).toEqual(Array(5).fill("extended"));
    expect(g.get(40)!.kind).toBe("orphan");
  });

  it("cây dòng họ không vẽ nhà thông gia, vẫn vẽ người chưa nối vào cây", () => {
    const layout = computeLayout(new FamilyGraph(networkTree()), { collapsed: new Set() });
    expect(layout.byPerson.has(14)).toBe(true);
    expect(layout.byPerson.has(30)).toBe(false);
    expect(layout.byPerson.get(40)?.orphan).toBe(true);
  });
});

describe("Xưng hô với nhà thông gia", () => {
  it("bố chồng ↔ bố vợ gọi nhau là thông gia", () => {
    const r = rel(6, 30);
    expect(r.key).toBe("co_parent_inlaw");
    expect(r.label).toBe("Ông thông gia");
    expect(r.xung).toBe("tôi");
    expect(r.description).toBe("bố của vợ của con trai bạn");
    expect(rel(30, 6).label).toBe("Ông thông gia");
    expect(rel(30, 11).label).toBe("Bà thông gia");
  });

  it("vẫn dùng bảng xưng hô sẵn có khi đủ (con rể gọi bố vợ là Bố, bố vợ gọi con rể)", () => {
    expect(rel(13, 30).label).toBe("Bố");
    expect(rel(30, 13).label).toBe("Con rể");
    expect(rel(30, 15).label).toBe("Cháu ngoại");
  });

  it("anh của chồng → em trai của vợ: chuỗi quan hệ", () => {
    const r = rel(12, 32);
    expect(r.key).toBe("inlaw_family");
    expect(r.label).toBe("Bên thông gia");
    expect(r.description).toBe("anh/em trai của vợ của em trai bạn");
    expect(r.path).toEqual([12, 13, 14, 32]);
  });

  it("dâu chưa có trên cây vẫn tra được nhà thông gia qua chồng", () => {
    const g = new FamilyGraph(networkTree());
    const r = new Kinship(g, rules, { spouseOf: 12, gender: "F" }).relate(34);
    expect(r.key).toBe("inlaw_family");
    expect(r.description).toBe("con trai của anh/em trai của vợ của em trai chồng bạn");
  });

  it("không có đường nối thì vẫn là chưa rõ", () => {
    expect(rel(13, 40).key).toBe("unknown");
  });
});

describe("Đường nối", () => {
  it("tìm đường ngắn nhất và mô tả", () => {
    const g = new FamilyGraph(networkTree());
    const steps = findPath(g, 34, 15)!;
    expect(steps.map((s) => s.to)).toEqual([32, 14, 15]);
    expect(describePath(g, steps, "Tú")).toBe("con trai của chị/em gái của bố Tú");
    expect(findPath(g, 34, 40)).toBeNull();
  });
});

describe("Sơ đồ mạng lưới", () => {
  it("lấy dâu làm tâm: cha mẹ đẻ ở trên, chồng cạnh bên, con ở dưới, không chồng lấn", () => {
    const g = new FamilyGraph(networkTree());
    const layout = computeNetworkLayout(g, 14, { radius: 1 });
    const n = (id: number) => layout.byPerson.get(id)!;
    expect([...layout.byPerson.keys()].sort((a, b) => a - b)).toEqual([13, 14, 15, 30, 31, 32]);
    expect(n(14).x).toBe(0);
    expect(n(30).y).toBe(n(31).y);
    expect(n(30).y).toBeLessThan(n(14).y);
    expect(n(13).y).toBe(n(14).y);
    expect(n(15).y).toBeGreaterThan(n(14).y);
    expect(layout.rows.map((r) => r.label)).toEqual(["Đời cha mẹ", "Ngang hàng", "Đời con"]);
    const byRow = new Map<number, number[]>();
    for (const node of layout.nodes) byRow.set(node.y, [...(byRow.get(node.y) ?? []), node.x]);
    for (const xs of byRow.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(NODE_W);
    }
  });

  it("đường nối được làm nổi luôn có mặt dù ở xa", () => {
    const g = new FamilyGraph(networkTree());
    const layout = computeNetworkLayout(g, 1, { radius: 1, include: [3, 6, 13, 14, 32, 34] });
    expect(layout.byPerson.has(34)).toBe(true);
    expect(layout.byPerson.get(34)!.gen).toBe(4);
  });
});
