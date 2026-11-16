import { ArrowLeftRight, ChevronRight, Route } from "lucide-react";
import { useMemo, useState } from "react";
import type { FamilyGraph } from "@/lib/graph";
import { GENERIC_KEYS, Kinship } from "@/lib/kinship";
import type { Rules } from "@/lib/kinshipRules";
import { describePath, findPath, pathIds, stepWord } from "@/lib/network";
import { capitalize } from "@/lib/text";
import { PersonSearch } from "./PersonSearch";
import { Button, Dialog, Field } from "./ui";

/**
 * Tra cứu quan hệ giữa 2 người bất kỳ trong mạng lưới — kể cả nhà thông gia — mà không cần
 * đổi "tôi" (FR-54): chuỗi đường nối + cách xưng hô khi xác định được; làm nổi đường nối (FR-55).
 */
export function CompareDialog({
  graph,
  rules,
  initialA,
  onClose,
  onHighlight,
}: {
  graph: FamilyGraph;
  rules: Rules;
  initialA: number | null;
  onClose: () => void;
  onHighlight: (path: number[]) => void;
}) {
  const [a, setA] = useState<number | null>(initialA);
  const [b, setB] = useState<number | null>(null);
  const result = useMemo(() => {
    if (a == null || b == null || a === b) return null;
    const steps = findPath(graph, a, b);
    if (!steps) return { steps: null, ab: null, ba: null };
    const ab = new Kinship(graph, rules, { id: a }).relate(b);
    const ba = new Kinship(graph, rules, { id: b }).relate(a);
    return { steps, ab, ba };
  }, [graph, rules, a, b]);
  const name = (id: number | null) => (id != null ? graph.get(id)?.name : null);

  return (
    <Dialog open onClose={onClose} title="Tra cứu quan hệ" size="md">
      <div className="grid gap-4">
        <Field label="Người thứ nhất (A)">
          <PersonSearch graph={graph} onPick={(p) => setA(p.id)} placeholder="Tìm người A…" />
          {a != null && <p className="font-semibold text-brand-800">{name(a)}</p>}
        </Field>
        <div className="flex justify-center">
          <Button size="sm" variant="ghost" icon={<ArrowLeftRight className="size-4" />} onClick={() => { setA(b); setB(a); }}>
            Đổi chỗ
          </Button>
        </div>
        <Field label="Người thứ hai (B)">
          <PersonSearch graph={graph} onPick={(p) => setB(p.id)} placeholder="Tìm người B…" autoFocus={initialA != null} />
          {b != null && <p className="font-semibold text-brand-800">{name(b)}</p>}
        </Field>

        {result && !result.steps && (
          <p className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-stone-700">
            Chưa tìm thấy đường nối nào giữa hai người này trong gia phả.
          </p>
        )}

        {result?.steps && result.ab && result.ba && (
          <div className="space-y-3 rounded-lg border border-gold-400 bg-amber-50 p-4 text-[15px]">
            {!GENERIC_KEYS.has(result.ab.key) ? (
              <p>
                <strong>{name(a)}</strong> gọi <strong>{name(b)}</strong> là <strong className="text-brand-800">{result.ab.call}</strong>
                {result.ab.xung && <> và xưng <strong className="text-brand-800">{result.ab.xung}</strong></>}.
              </p>
            ) : (
              <p>
                <strong>{name(b)}</strong> thuộc <strong className="text-brand-800">{result.ab.label.toLowerCase()}</strong> của {name(a)} — bảng xưng hô chưa có danh xưng riêng, thường gọi theo tuổi.
              </p>
            )}
            <p className="text-stone-700">
              {capitalize(name(b) ?? "")} là {describePath(graph, result.steps, name(a) ?? "")}.
            </p>
            {!GENERIC_KEYS.has(result.ba.key) && (
              <p>
                <strong>{name(b)}</strong> gọi <strong>{name(a)}</strong> là <strong className="text-brand-800">{result.ba.call}</strong>.
              </p>
            )}
            {result.ab.note && <p className="text-amber-800">⚠ {result.ab.note}</p>}

            <div>
              <p className="mb-1 font-semibold text-stone-700">Đường nối ({result.steps.length} bước)</p>
              <ol className="flex flex-wrap items-center gap-1">
                <li className="rounded-full bg-white px-3 py-1 font-semibold shadow-sm">{name(a)}</li>
                {result.steps.map((s) => (
                  <li key={s.to} className="flex items-center gap-1">
                    <ChevronRight className="size-4 text-stone-400" aria-hidden />
                    <span className="rounded-full bg-white px-3 py-1 shadow-sm">
                      <span className="text-stone-500">{stepWord(graph, s)}</span> <strong>{name(s.to)}</strong>
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <Button
              size="sm"
              variant="primary"
              icon={<Route className="size-4" />}
              onClick={() => {
                onHighlight(pathIds(result.steps!, a!));
                onClose();
              }}
            >
              Làm nổi đường nối
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
