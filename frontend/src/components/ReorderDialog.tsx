import { closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState } from "react";
import { post } from "@/api/client";
import type { MutationResult } from "@/api/types";
import type { FamilyGraph } from "@/lib/graph";
import { lifeSpan } from "@/lib/format";
import { useMutate } from "./mutate";
import { Button, Dialog, IconButton } from "./ui";

function Row({ id, graph, index, move, total }: { id: number; graph: FamilyGraph; index: number; total: number; move: (from: number, to: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const p = graph.get(id)!;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1 ${isDragging ? "z-10 shadow-lg" : "border-stone-200"}`}
    >
      <button className="cursor-grab touch-none p-2 text-stone-400" aria-label="Kéo để đổi thứ tự" {...attributes} {...listeners}>
        <GripVertical className="size-5" />
      </button>
      <span className="w-7 text-center font-bold text-brand-800">{index + 1}</span>
      <span className="flex-1">
        <span className="font-semibold">{p.name}</span>
        <span className="ml-2 text-sm text-stone-500">{lifeSpan(p)}</span>
      </span>
      <IconButton label="Lên" disabled={index === 0} onClick={() => move(index, index - 1)}>
        <ArrowUp className="size-4" />
      </IconButton>
      <IconButton label="Xuống" disabled={index === total - 1} onClick={() => move(index, index + 1)}>
        <ArrowDown className="size-4" />
      </IconButton>
    </li>
  );
}

/** Kéo thả để đổi thứ tự anh chị em trong cùng cha mẹ (FR-24). */
export function ReorderDialog({ graph, personId, onClose }: { graph: FamilyGraph; personId: number; onClose: () => void }) {
  const run = useMutate();
  const [ids, setIds] = useState(() => graph.children(personId));
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const move = (from: number, to: number) => setIds((x) => arrayMove(x, from, to));
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) move(ids.indexOf(Number(e.active.id)), ids.indexOf(Number(e.over.id)));
  };
  const save = async () => {
    setBusy(true);
    const r = await run("Đã đổi thứ tự", () => post<MutationResult>("/api/admin/reorder-siblings", { child_ids: ids }));
    setBusy(false);
    if (r) onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Thứ tự các con của ${graph.get(personId)?.name}`}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Lưu thứ tự
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[15px] text-stone-600">Trưởng ở trên cùng. Thứ tự này quyết định bác/chú, anh/em họ trong cách xưng hô.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="space-y-2">
            {ids.map((id, i) => (
              <Row key={id} id={id} graph={graph} index={i} total={ids.length} move={move} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </Dialog>
  );
}
