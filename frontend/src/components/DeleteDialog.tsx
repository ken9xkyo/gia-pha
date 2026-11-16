import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { get, post } from "@/api/client";
import type { DeletePreview, MutationResult } from "@/api/types";
import { normalize } from "@/lib/text";
import { useMutate } from "./mutate";
import { Button, Dialog, Input, Spinner } from "./ui";

/** Xóa an toàn (FR-30..34): xóa mềm vào Thùng rác 30 ngày. */
export function DeleteDialog({ personId, onClose, onDeleted }: { personId: number; onClose: () => void; onDeleted: () => void }) {
  const run = useMutate();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["delete-preview", personId],
    queryFn: () => get<DeletePreview>(`/api/admin/persons/${personId}/delete-preview`),
    gcTime: 0,
  });

  const name = data?.person_name ?? "";
  const ok = data && data.mode !== "blocked" && (data.mode !== "branch" || normalize(typed) === normalize(name));

  const submit = async () => {
    if (!data) return;
    setBusy(true);
    const r = await run(
      data.mode === "branch" ? `Đã xóa nhánh ${name} (${data.count} người) vào Thùng rác` : `Đã xóa ${name} vào Thùng rác`,
      () => post<MutationResult>(`/api/admin/persons/${personId}/delete`, { mode: data.mode, confirm_name: typed }),
    );
    setBusy(false);
    if (r) {
      onDeleted();
      onClose();
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={data?.mode === "branch" ? `Xóa cả nhánh (${data.count} người)` : `Xóa ${name}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          {data?.mode !== "blocked" && (
            <Button variant="danger" disabled={!ok} loading={busy} onClick={submit}>
              {data?.mode === "branch" ? `Xóa cả nhánh (${data.count} người)` : "Xóa"}
            </Button>
          )}
        </>
      }
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : data.mode === "blocked" ? (
        <p className="text-stone-800">{data.reason}</p>
      ) : (
        <div className="space-y-3 text-stone-800">
          {data.mode === "single" && <p>Xóa <strong>{name}</strong>? Các quan hệ hôn nhân của người này sẽ được gỡ theo.</p>}
          {data.mode === "inlaw" && (
            <p>
              <strong>{name}</strong> là dâu/rể.{" "}
              {data.keeps_children
                ? "Các con chung vẫn được giữ trên cây; vị trí vợ/chồng sẽ chuyển thành “không rõ tên”."
                : "Quan hệ hôn nhân sẽ được gỡ theo."}
            </p>
          )}
          {data.mode === "branch" && (
            <>
              <p>
                <strong>{name}</strong> có hậu duệ. Không thể để lại nhánh mồ côi nên toàn bộ <strong>{data.count} người</strong> sẽ bị xóa:
              </p>
              <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-[15px]">
                {data.names.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
                {data.count > data.names.length && <li>… và {data.count - data.names.length} người khác</li>}
              </ul>
              <div>
                <p className="mb-1 text-[15px]">Gõ lại tên <strong>{name}</strong> để xác nhận:</p>
                <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </div>
            </>
          )}
          <p className="text-sm text-stone-500">Dữ liệu được giữ trong Thùng rác 30 ngày và có thể khôi phục nguyên nhánh.</p>
        </div>
      )}
    </Dialog>
  );
}
