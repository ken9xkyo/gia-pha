import { ArrowLeftRight, Route } from "lucide-react";
import { useMemo, useState } from "react";
import type { FamilyGraph } from "@/lib/graph";
import { Kinship } from "@/lib/kinship";
import type { Rules } from "@/lib/kinshipRules";
import { capitalize } from "@/lib/text";
import { PersonSearch } from "./PersonSearch";
import { Button, Dialog, Field } from "./ui";

/** So sánh 2 người bất kỳ mà không cần đổi "tôi" (FR-54); làm nổi đường nối (FR-55). */
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
    const ab = new Kinship(graph, rules, { id: a }).relate(b);
    const ba = new Kinship(graph, rules, { id: b }).relate(a);
    return { ab, ba };
  }, [graph, rules, a, b]);
  const name = (id: number | null) => (id != null ? graph.get(id)?.name : null);

  return (
    <Dialog open onClose={onClose} title="So sánh 2 người" size="md">
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
        {result && (
          <div className="space-y-2 rounded-lg border border-gold-400 bg-amber-50 p-4 text-[15px]">
            <p>
              <strong>{name(a)}</strong> gọi <strong>{name(b)}</strong> là <strong className="text-brand-800">{result.ab.call}</strong>
              {result.ab.xung && <> và xưng <strong className="text-brand-800">{result.ab.xung}</strong></>}.
            </p>
            <p className="text-stone-700">
              {capitalize(name(b) ?? "")} là {result.ab.description.replace(/bạn/g, name(a) ?? "")}.
            </p>
            <p>
              <strong>{name(b)}</strong> gọi <strong>{name(a)}</strong> là <strong className="text-brand-800">{result.ba.call}</strong>.
            </p>
            {result.ab.note && <p className="text-amber-800">⚠ {result.ab.note}</p>}
            {result.ab.path.length > 1 && (
              <Button
                size="sm"
                variant="primary"
                icon={<Route className="size-4" />}
                onClick={() => {
                  onHighlight(result.ab.path);
                  onClose();
                }}
              >
                Làm nổi đường nối trên cây
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
