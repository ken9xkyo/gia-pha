import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useSource } from "@/api/context";
import { useTree } from "@/api/hooks";
import { Spinner } from "@/components/ui";
import { useKinship } from "@/components/useKinship";
import type { PNode } from "@/lib/graph";
import { lifeSpan } from "@/lib/format";
import { matches } from "@/lib/text";

interface Row {
  p: PNode;
  depth: number;
  spouses: string[];
}

/** Danh sách thụt lề theo đời — dễ dùng trên điện thoại (FR-10). */
export default function ListPage() {
  const { graph, rules, isLoading } = useTree();
  const kin = useKinship(graph, rules);
  const src = useSource();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    if (!graph || graph.rootId == null) return [];
    const out: Row[] = [];
    const seen = new Set<number>();
    const walk = (id: number, depth: number) => {
      if (seen.has(id)) return;
      seen.add(id);
      const p = graph.get(id)!;
      const spouses = graph.spouses(id).map((s) => graph.get(s)!.name);
      out.push({ p, depth, spouses });
      for (const c of graph.children(id)) if (graph.get(c)?.lineage) walk(c, depth + 1);
    };
    walk(graph.rootId, 0);
    return out;
  }, [graph]);

  const filtered = useMemo(() => {
    if (!q.trim() || !graph) return rows;
    return rows.filter((r) => matches(r.p.search, q) || r.spouses.some((s) => matches(s.toLowerCase(), q)));
  }, [rows, q, graph]);

  const v = useVirtualizer({ count: filtered.length, getScrollElement: () => parentRef.current, estimateSize: () => 68, overscan: 12 });

  if (isLoading || !graph)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-4xl px-4 pt-5">
        <h1 className="mb-3 text-2xl font-bold text-brand-800">Danh sách theo đời ({rows.length} người trong dòng họ)</h1>
        <div className="mb-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Lọc theo tên (không cần dấu)…"
            className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3"
          />
        </div>
      </div>
      <div ref={parentRef} className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-4 pb-6">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((item) => {
            const r = filtered[item.index];
            const rel = kin.relations?.get(r.p.id);
            return (
              <button
                key={r.p.id}
                onClick={() => navigate(`${src.base}/p/${r.p.id}`)}
                className="absolute left-0 right-0 flex items-center gap-3 border-b border-stone-200 bg-white px-3 text-left hover:bg-amber-50"
                style={{ top: item.start, height: item.size, paddingLeft: 12 + Math.min(r.depth, 12) * 18 }}
              >
                <span className="w-14 shrink-0 rounded bg-brand-800/10 py-0.5 text-center text-sm font-bold text-brand-800">Đời {r.p.gen}</span>
                <span className="min-w-0 flex-1">
                  <span className={clsx("font-semibold", r.p.gender === "M" ? "text-blue-900" : "text-pink-900")}>{r.p.name}</span>
                  {r.p.ngoai && <span className="ml-2 text-sm text-stone-500">(ngoại)</span>}
                  <span className="block truncate text-sm text-stone-600">
                    {[lifeSpan(r.p), r.spouses.length ? `${r.p.gender === "M" ? "Vợ" : "Chồng"}: ${r.spouses.join(", ")}` : ""].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {rel && rel.key !== "unknown" && (
                  <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-sm font-bold text-white", rel.key === "self" ? "bg-gold-500" : "bg-brand-800")}>
                    {rel.key === "self" ? "Tôi" : rel.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
