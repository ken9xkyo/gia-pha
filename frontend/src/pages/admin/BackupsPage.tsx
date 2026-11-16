import { useQuery } from "@tanstack/react-query";
import { DatabaseBackup, Download } from "lucide-react";
import { get } from "@/api/client";
import type { BackupFile } from "@/api/types";
import { Card, Empty, PageShell, Spinner } from "@/components/ui";
import { bytes, dateTime } from "@/lib/format";

export default function BackupsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["backups"], queryFn: () => get<BackupFile[]>("/api/admin/backups") });
  return (
    <PageShell title="Sao lưu">
      <Card className="mb-4 text-[15px] text-stone-700">
        <p>Hệ thống tự sao lưu cơ sở dữ liệu và ảnh mỗi ngày lúc 02:00 (giờ Việt Nam), giữ 30 bản gần nhất.</p>
        <p className="mt-2">
          Khôi phục toàn bộ cây về một ngày bất kỳ (chạy trên máy chủ):{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5">./scripts/restore.sh giapha-YYYYMMDD-HHMMSS.dump</code>
        </p>
      </Card>
      {isLoading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<DatabaseBackup className="size-10 text-stone-400" />} title="Chưa có bản sao lưu nào" />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-stone-100">
            {data.map((b) => (
              <li key={b.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-mono font-semibold">{b.name}</p>
                  <p className="text-sm text-stone-500">{dateTime(b.created_at)} · {bytes(b.size)}</p>
                </div>
                <a href={`/api/admin/backups/${b.name}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 px-3 font-semibold hover:bg-stone-50">
                  <Download className="size-4" /> Tải về
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
