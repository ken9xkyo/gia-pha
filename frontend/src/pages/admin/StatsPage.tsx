import { useQuery } from "@tanstack/react-query";
import { get } from "@/api/client";
import type { Stats } from "@/api/types";
import { Card, PageShell, Spinner } from "@/components/ui";

function Tile({ label, value, sub, target }: { label: string; value: string; sub?: string; target?: string }) {
  return (
    <Card>
      <p className="text-[15px] text-stone-600">{label}</p>
      <p className="mt-1 text-3xl font-bold text-brand-800">{value}</p>
      {sub && <p className="text-sm text-stone-500">{sub}</p>}
      {target && <p className="mt-1 text-sm font-medium text-stone-700">Mục tiêu: {target}</p>}
    </Card>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

/** Chỉ số thành công (PRD mục 10). */
export default function StatsPage() {
  const { data } = useQuery({ queryKey: ["stats"], queryFn: () => get<Stats>("/api/admin/stats") });
  if (!data) return <Spinner />;
  return (
    <PageShell title="Thống kê">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Tổng số thành viên" value={data.persons.toLocaleString("vi-VN")} sub={`${data.lineage} huyết thống · ${data.inlaws} dâu/rể · ${data.extended} nhà thông gia`} />
        <Tile label="Số đời" value={String(data.generations)} />
        <Tile
          label="Độ đủ dữ liệu: có thứ tự anh chị em"
          value={pct(data.with_order, data.with_siblings)}
          sub={`${data.with_order}/${data.with_siblings} người có anh chị em`}
          target="≥ 95%"
        />
        <Tile label="Lượt xem 30 ngày" value={data.visits_30d.toLocaleString("vi-VN")} sub="Đếm ẩn danh theo phiên trình duyệt" />
        <Tile
          label="Tỷ lệ có chọn “Tôi là ai”"
          value={pct(data.visits_with_me_30d, data.visits_30d)}
          sub="Không lưu người được chọn"
          target="≥ 40%"
        />
        <Tile label="Chưa nối được vào cây" value={String(data.disconnected)} sub={data.disconnected ? "Cần kiểm tra lại dữ liệu" : "Dữ liệu toàn vẹn"} />
      </div>
    </PageShell>
  );
}
