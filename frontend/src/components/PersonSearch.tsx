import clsx from "clsx";
import { Search } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import type { FamilyGraph, PNode } from "@/lib/graph";
import { lifeSpan } from "@/lib/format";
import { matches, viCollator } from "@/lib/text";

interface Props {
  graph: FamilyGraph | null;
  onPick: (p: PNode) => void;
  placeholder?: string;
  autoFocus?: boolean;
  filter?: (p: PNode) => boolean;
  className?: string;
  compact?: boolean;
}

/** Tìm theo tên thường gọi / tên húy, không phân biệt dấu; hiện đời + tên cha mẹ để phân biệt người trùng tên (FR-40). */
export function PersonSearch({ graph, onPick, placeholder = "Tìm theo tên…", autoFocus, filter, className, compact }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!graph || !q.trim()) return [];
    const out: PNode[] = [];
    for (const p of graph.persons.values()) {
      if (filter && !filter(p)) continue;
      if (matches(p.search, q)) out.push(p);
      if (out.length > 200) break;
    }
    return out
      .sort((a, b) => Number(b.lineage) - Number(a.lineage) || (a.gen ?? 99) - (b.gen ?? 99) || viCollator.compare(a.name, b.name))
      .slice(0, 30);
  }, [graph, q, filter]);

  const pick = (p: PNode) => {
    onPick(p);
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className={clsx("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-stone-400" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={id}
          aria-label={placeholder}
          autoFocus={autoFocus}
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && results[active]) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className={clsx(
            "w-full rounded-lg border border-stone-300 bg-white pl-10 pr-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700/20",
            compact ? "min-h-10" : "min-h-11",
          )}
        />
      </div>
      {open && q.trim() && (
        <ul
          id={id}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 shadow-xl"
        >
          {results.length === 0 && <li className="px-4 py-3 text-stone-500">Không tìm thấy “{q}”</li>}
          {results.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              onMouseEnter={() => setActive(i)}
              className={clsx("cursor-pointer px-4 py-2", i === active && "bg-brand-50")}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold text-stone-900">{p.name}</span>
                <span className="shrink-0 text-sm text-stone-500">{lifeSpan(p)}</span>
              </div>
              <div className="text-sm text-stone-600">
                {graph!.hint(p.id)}
                {p.tenHuy && <span> · húy {p.tenHuy}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
