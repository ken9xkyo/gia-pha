import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { del, get, post } from "@/api/client";
import type { TrashItem } from "@/api/types";
import { confirmDialog } from "@/components/confirm";
import { useMutate } from "@/components/mutate";
import { Button, Card, Empty, PageShell, Spinner } from "@/components/ui";
import { dateTime } from "@/lib/format";

/** Thùng rác 30 ngày — khôi phục nguyên nhánh (FR-33). */
export default function TrashPage() {
  const run = useMutate();
  const { data, isLoading } = useQuery({ queryKey: ["trash"], queryFn: () => get<TrashItem[]>("/api/admin/trash") });
  return (
    <PageShell title="Thùng rác">
      <p className="mb-4 text-stone-600">Mục đã xóa được giữ 30 ngày, sau đó tự xóa vĩnh viễn (kể cả ảnh và dữ liệu trong nhật ký).</p>
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<Trash2 className="size-10 text-stone-400" />} title="Thùng rác trống" />
      ) : (
        <ul className="grid gap-3">
          {data.map((t) => (
            <li key={t.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-stone-900">{t.summary}</p>
                  <p className="text-[15px] text-stone-600">
                    {dateTime(t.created_at)} · {t.admin_name ?? "—"} · tự xóa vĩnh viễn sau {dateTime(t.expires_at)}
                  </p>
                  {t.names.length > 0 && <p className="mt-1 text-[15px] text-stone-700">{t.names.join(", ")}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    icon={<RotateCcw className="size-4" />}
                    onClick={() => void run("Đã khôi phục", () => post(`/api/admin/trash/${t.id}/restore`))}
                  >
                    Khôi phục
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-red-700"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Xóa vĩnh viễn?",
                        message: "Không thể hoàn tác. Dữ liệu và ảnh của những người này sẽ bị xóa khỏi hệ thống và nhật ký.",
                        confirmText: "Xóa vĩnh viễn",
                        danger: true,
                      });
                      if (ok) await run("Đã xóa vĩnh viễn", () => del(`/api/admin/trash/${t.id}`));
                    }}
                  >
                    Xóa vĩnh viễn
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
