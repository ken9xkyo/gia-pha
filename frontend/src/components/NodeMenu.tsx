import clsx from "clsx";
import {
  ArrowDownUp,
  Baby,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Eye,
  GitCompare,
  Heart,
  Pencil,
  Trash2,
  UserPlus,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import type { FamilyGraph } from "@/lib/graph";
import { Kinship, type Relation } from "@/lib/kinship";
import type { Rules } from "@/lib/kinshipRules";
import { lifeSpan } from "@/lib/format";
import { capitalize } from "@/lib/text";
import type { ScreenRect } from "@/tree/TreeCanvas";
import type { Ego } from "@/lib/kinship";
import { IconButton } from "./ui";

export type NodeAction =
  | "view" | "me" | "compare" | "toggle" | "copy"
  | "addChild" | "addSpouse" | "addSibling" | "addParents" | "edit" | "reorder" | "delete";

interface Props {
  graph: FamilyGraph;
  rules: Rules;
  personId: number;
  rect: ScreenRect;
  container: { w: number; h: number };
  admin: boolean;
  ego: Ego | null;
  relation: Relation | null;
  collapsed: boolean;
  onAction: (a: NodeAction) => void;
  onClose: () => void;
}

export function KinshipCard({ graph, rules, personId, ego, relation }: Pick<Props, "graph" | "rules" | "personId" | "ego" | "relation">) {
  // FR-53: người này gọi tôi là gì
  const reverse = useMemo(() => {
    if (!ego || !("id" in ego) || ego.id === personId) return null;
    return new Kinship(graph, rules, { id: personId }).relate(ego.id);
  }, [graph, rules, personId, ego]);
  if (!relation || relation.key === "self") return null;
  return (
    <div className="rounded-lg border border-gold-400 bg-amber-50 p-3 text-[15px]">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          Bạn gọi: <strong className="text-brand-800">{relation.call}</strong>
        </span>
        {relation.xung && (
          <span>
            Bạn xưng: <strong className="text-brand-800">{relation.xung}</strong>
          </span>
        )}
      </div>
      <p className="mt-1 text-stone-700">Quan hệ: {relation.description}</p>
      {reverse && reverse.key !== "unknown" && (
        <p className="mt-1 text-stone-600">
          Người này gọi bạn là <strong>{capitalize(reverse.label)}</strong>
        </p>
      )}
      {relation.note && <p className="mt-1 text-sm font-medium text-amber-800">⚠ {relation.note}</p>}
    </div>
  );
}

function Item({ icon, children, onClick, danger }: { icon: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-base hover:bg-stone-100",
        danger ? "text-red-700" : "text-stone-800",
      )}
    >
      <span className="shrink-0 [&>svg]:size-5">{icon}</span>
      {children}
    </button>
  );
}

export function NodeMenu(props: Props) {
  const { graph, personId, rect, container, admin, relation, collapsed, onAction, onClose } = props;
  const p = graph.get(personId);
  if (!p) return null;
  const hasChildren = graph.children(personId).length > 0;
  const isRoot = graph.rootId === personId;
  const hasParents = p.parentUnion != null;
  const tags: string[] = [];
  if (p.gen) tags.push(`Đời ${p.gen}`);
  if (!p.lineage) tags.push(p.gender === "F" ? "Dâu" : "Rể");
  if (p.ngoai) tags.push("Dòng ngoại");
  if (p.branch) tags.push(p.branch);
  if (isRoot) tags.push("Thủy tổ");

  const mobile = container.w < 640;
  const width = 340;
  let style: React.CSSProperties = {};
  if (!mobile) {
    const left = Math.min(Math.max(8, rect.x + rect.w / 2 - width / 2), container.w - width - 8);
    const below = rect.y + rect.h + 12;
    const top = below + 380 < container.h ? below : Math.max(8, rect.y - 392);
    style = { left, top, width };
  }

  return (
    <div
      className={clsx(
        "absolute z-20 rounded-xl border border-stone-200 bg-white p-3 shadow-2xl",
        mobile && "inset-x-0 bottom-0 max-h-[75%] overflow-y-auto rounded-b-none",
      )}
      style={style}
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-stone-900">{p.name}</p>
          <p className="text-[15px] text-stone-600">
            {[lifeSpan(p), ...tags].filter(Boolean).join(" · ")}
          </p>
        </div>
        <IconButton label="Đóng" onClick={onClose} className="-mr-1 -mt-1">
          <X className="size-5" />
        </IconButton>
      </div>
      <KinshipCard {...props} />
      <div className="mt-2 grid gap-0.5">
        <Item icon={<Eye />} onClick={() => onAction("view")}>Xem hồ sơ</Item>
        {relation?.key !== "self" && <Item icon={<UserRound />} onClick={() => onAction("me")}>Đây là tôi</Item>}
        <Item icon={<GitCompare />} onClick={() => onAction("compare")}>So sánh với người khác</Item>
        {hasChildren && (
          <Item icon={collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} onClick={() => onAction("toggle")}>
            {collapsed ? `Mở rộng nhánh (${graph.descendantCount(personId)} người)` : "Thu gọn nhánh"}
          </Item>
        )}
        <Item
          icon={<Copy />}
          onClick={() => {
            onAction("copy");
            toast.success("Đã sao chép liên kết tới người này");
          }}
        >
          Sao chép liên kết
        </Item>
        {admin && (
          <>
            <div className="my-1 border-t border-stone-200" />
            <Item icon={<Baby />} onClick={() => onAction("addChild")}>Thêm con</Item>
            <Item icon={<Heart />} onClick={() => onAction("addSpouse")}>Thêm {p.gender === "M" ? "vợ" : "chồng"}</Item>
            {hasParents && <Item icon={<Users />} onClick={() => onAction("addSibling")}>Thêm anh/chị/em</Item>}
            {isRoot && !hasParents && <Item icon={<UserPlus />} onClick={() => onAction("addParents")}>Thêm cha/mẹ (lùi gốc lên một đời)</Item>}
            <Item icon={<Pencil />} onClick={() => onAction("edit")}>Sửa thông tin</Item>
            {graph.children(personId).length > 1 && (
              <Item icon={<ArrowDownUp />} onClick={() => onAction("reorder")}>Sắp xếp thứ tự các con</Item>
            )}
            <Item icon={<Trash2 />} danger onClick={() => onAction("delete")}>Xóa</Item>
          </>
        )}
      </div>
    </div>
  );
}
