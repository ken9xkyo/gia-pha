import { useMemo } from "react";
import type { FamilyGraph } from "@/lib/graph";
import { Kinship, type Ego, type Relation } from "@/lib/kinship";
import type { Rules } from "@/lib/kinshipRules";
import { useUI } from "@/store/ui";

export interface KinshipView {
  ego: Ego | null;
  engine: Kinship | null;
  relations: Map<number, Relation> | null;
  meId: number | null;
  meLabel: string | null;
}

function validEgo(graph: FamilyGraph | null, me: Ego | null): Ego | null {
  if (!graph || !me) return null;
  if ("id" in me) return graph.get(me.id) ? me : null;
  return graph.get(me.spouseOf) ? me : null;
}

/** Tính xưng hô của "tôi" với mọi người trên cây — chạy hoàn toàn trên trình duyệt (FR-58). */
export function useKinship(graph: FamilyGraph | null, rules: Rules): KinshipView {
  const rawMe = useUI((s) => s.me);
  const me = validEgo(graph, rawMe);
  const key = me ? ("id" in me ? `p${me.id}` : `s${me.spouseOf}${me.gender}`) : "";
  const engine = useMemo(() => (graph && me ? new Kinship(graph, rules, me) : null), [graph, rules, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const relations = useMemo(() => engine?.relateAll() ?? null, [engine]);
  let meLabel: string | null = null;
  if (me && graph) {
    meLabel = "id" in me ? graph.get(me.id)!.name : `${me.gender === "F" ? "Vợ" : "Chồng"} của ${graph.get(me.spouseOf)!.name}`;
  }
  return { ego: me, engine, relations, meId: me && "id" in me ? me.id : null, meLabel };
}
