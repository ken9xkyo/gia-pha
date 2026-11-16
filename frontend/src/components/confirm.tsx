import { useState } from "react";
import { create } from "zustand";
import { Button, Dialog, Input } from "./ui";

interface ConfirmOptions {
  title: string;
  message?: string;
  list?: string[];
  confirmText?: string;
  danger?: boolean;
  /** Bắt người dùng gõ lại chuỗi này để xác nhận */
  typeToConfirm?: string;
}

interface ConfirmState {
  current: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  ask: (o: ConfirmOptions) => Promise<boolean>;
  close: (v: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  current: null,
  ask: (o) => new Promise<boolean>((resolve) => set({ current: { ...o, resolve } })),
  close: (v) => {
    get().current?.resolve(v);
    set({ current: null });
  },
}));

export const confirmDialog = (o: ConfirmOptions) => useConfirmStore.getState().ask(o);

export function ConfirmHost() {
  const { current, close } = useConfirmStore();
  const [typed, setTyped] = useState("");
  if (!current) return null;
  const ok = !current.typeToConfirm || typed.trim() === current.typeToConfirm.trim();
  const done = (v: boolean) => {
    setTyped("");
    close(v);
  };
  return (
    <Dialog
      open
      onClose={() => done(false)}
      title={current.title}
      size="sm"
      footer={
        <>
          <Button onClick={() => done(false)}>Hủy</Button>
          <Button variant={current.danger ? "danger" : "primary"} disabled={!ok} onClick={() => done(true)}>
            {current.confirmText ?? "Đồng ý"}
          </Button>
        </>
      }
    >
      {current.message && <p className="text-stone-700">{current.message}</p>}
      {current.list && current.list.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-stone-800">
          {current.list.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {current.typeToConfirm && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-stone-600">
            Gõ lại <strong>{current.typeToConfirm}</strong> để xác nhận:
          </p>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </div>
      )}
    </Dialog>
  );
}
