import { describe, expect, it } from "vitest";
import { FamilyGraph } from "./graph";
import { computeLayout, NODE_W } from "./layout";
import { paternalTree } from "./testTrees";

function noOverlap(nodes: { x: number; y: number }[]) {
  const rows = new Map<number, number[]>();
  for (const n of nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x]);
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(NODE_W);
  }
}

describe("layout", () => {
  const g = new FamilyGraph(paternalTree());

  it("mỗi người xuất hiện đúng một lần, không chồng lấn", () => {
    const l = computeLayout(g, { collapsed: new Set() });
    expect(l.byPerson.size).toBe(g.persons.size);
    noOverlap(l.nodes);
  });

  it("hàng ngang theo đời, anh chị em xếp trưởng → út", () => {
    const l = computeLayout(g, { collapsed: new Set() });
    const y = (id: number) => l.byPerson.get(id)!.y;
    const x = (id: number) => l.byPerson.get(id)!.x;
    expect(y(1)).toBeLessThan(y(3));
    expect(y(5)).toBe(y(6));
    expect(y(8)).toBe(y(7)); // dâu cùng hàng chồng
    expect(x(5)).toBeLessThan(x(6));
    expect(x(6)).toBeLessThan(x(7));
    expect(x(7)).toBeLessThan(x(16));
    expect(x(8)).toBe(x(7) + NODE_W + 22); // vợ đứng ngay cạnh chồng
    expect(x(17)).toBeLessThan(x(16)); // chồng đứng bên trái con gái dòng họ
  });

  it("thu gọn nhánh ẩn hậu duệ và đếm số người ẩn", () => {
    const l = computeLayout(g, { collapsed: new Set([6]) });
    expect(l.byPerson.has(13)).toBe(false);
    expect(l.byPerson.get(6)!.toggle).toEqual({ collapsed: true, hidden: 3 });
  });

  it("chế độ chỉ xem nội tộc ẩn dòng ngoại", () => {
    const l = computeLayout(g, { collapsed: new Set(), hideNgoai: true });
    expect(l.byPerson.has(18)).toBe(false);
    expect(l.byPerson.has(16)).toBe(true);
  });

  it("dữ liệu lớn: 5.000 người bố trí nhanh", () => {
    const persons = [{ id: 1, n: "Tổ", g: "M" as const }] as { id: number; n: string; g: "M" | "F"; o?: number }[];
    const unions: { id: number; h: number; w: number; k: "chinh_that"; o: number; s: "married" }[] = [];
    const links: { id: number; c: number; u: number; k: "biological" }[] = [];
    let next = 2, uid = 1, lid = 1;
    let frontier = [1];
    while (next <= 5000) {
      const nf: number[] = [];
      for (const pid of frontier) {
        if (next > 5000) break;
        const w = next++;
        persons.push({ id: w, n: `V${w}`, g: "F" });
        unions.push({ id: uid, h: pid, w, k: "chinh_that", o: 1, s: "married" });
        for (let i = 0; i < 3 && next <= 5000; i++) {
          const c = next++;
          persons.push({ id: c, n: `N${c}`, g: "M", o: i + 1 });
          links.push({ id: lid++, c, u: uid, k: "biological" });
          nf.push(c);
        }
        uid++;
      }
      frontier = nf;
    }
    const big = new FamilyGraph({ version: 1, root: 1, clan: "", kinship: {}, persons, unions, links });
    const t = performance.now();
    const l = computeLayout(big, { collapsed: new Set() });
    expect(performance.now() - t).toBeLessThan(500);
    expect(l.nodes.length).toBe(5000);
    noOverlap(l.nodes);
  });
});
