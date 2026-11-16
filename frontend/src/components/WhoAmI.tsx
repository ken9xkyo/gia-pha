import { UserRound, X } from "lucide-react";
import { useState } from "react";
import type { FamilyGraph, PNode } from "@/lib/graph";
import { useUI } from "@/store/ui";
import { PersonSearch } from "./PersonSearch";
import { Button, Dialog, IconButton } from "./ui";

/** Chọn "Tôi là ai": tìm tên, hoặc đánh dấu "tôi là vợ/chồng của…" cho người chưa có trên cây. */
function Picker({ graph, onDone, autoFocus }: { graph: FamilyGraph | null; onDone: (p: PNode) => void; autoFocus?: boolean }) {
  const setMe = useUI((s) => s.setMe);
  const [asSpouse, setAsSpouse] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <PersonSearch
        graph={graph}
        autoFocus={autoFocus}
        placeholder={asSpouse ? "Gõ tên vợ/chồng của bạn…" : "Gõ tên của bạn…"}
        onPick={(p) => {
          setMe(asSpouse ? { spouseOf: p.id, gender: p.gender === "M" ? "F" : "M" } : { id: p.id });
          onDone(p);
        }}
      />
      <label className="flex items-center gap-2 text-[15px] text-stone-700">
        <input type="checkbox" className="size-5 accent-brand-800" checked={asSpouse} onChange={(e) => setAsSpouse(e.target.checked)} />
        Tôi chưa có tên trên cây — tôi là vợ/chồng của người được chọn
      </label>
    </div>
  );
}

export function WhoAmIBanner({ graph, onPicked }: { graph: FamilyGraph | null; onPicked: (p: PNode) => void }) {
  const dismiss = useUI((s) => s.dismissBanner);
  return (
    <div className="pointer-events-auto w-full max-w-xl rounded-xl border border-gold-400 bg-amber-50/95 p-4 shadow-lg backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-brand-800">Bạn là ai trong dòng họ?</p>
          <p className="text-[15px] text-stone-700">Chọn tên mình để xem cách gọi từng người trên cây. Lựa chọn chỉ lưu trên máy của bạn.</p>
        </div>
        <IconButton label="Bỏ qua" onClick={dismiss}>
          <X className="size-5" />
        </IconButton>
      </div>
      <Picker graph={graph} onDone={onPicked} />
      <p className="mt-2 text-sm text-stone-500">Hoặc bấm vào một người trên cây rồi chọn “Đây là tôi”.</p>
    </div>
  );
}

export function MeChip({ graph, meLabel, onFocusMe }: { graph: FamilyGraph | null; meLabel: string | null; onFocusMe: () => void }) {
  const setMe = useUI((s) => s.setMe);
  const [open, setOpen] = useState(false);
  return (
    <>
      {meLabel ? (
        <div className="flex min-h-10 items-center gap-1 whitespace-nowrap rounded-full border border-gold-400 bg-amber-50 pl-3 pr-1 text-[15px]">
          <UserRound className="size-4 shrink-0 text-gold-500" />
          <button className="max-w-[10rem] truncate font-semibold text-stone-800 hover:underline" onClick={onFocusMe} title="Đến vị trí của bạn">
            Bạn: {meLabel}
          </button>
          <button className="rounded-full px-2 py-1 text-brand-700 hover:bg-amber-100" onClick={() => setOpen(true)}>
            Đổi
          </button>
          <button className="rounded-full px-2 py-1 text-stone-600 hover:bg-amber-100" onClick={() => setMe(null)}>
            Bỏ chọn
          </button>
        </div>
      ) : (
        <Button size="sm" variant="gold" icon={<UserRound className="size-4" />} onClick={() => setOpen(true)}>
          Tôi là ai?
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Bạn là ai trong dòng họ?">
        <Picker graph={graph} autoFocus onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
