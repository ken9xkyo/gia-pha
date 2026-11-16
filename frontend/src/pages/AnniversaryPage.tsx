import { CalendarHeart } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useSource } from "@/api/context";
import { useAnniversaries } from "@/api/hooks";
import { Card, Empty, PageShell, Select, Spinner } from "@/components/ui";
import { pad, solarLong } from "@/lib/format";

/** Ngày giỗ sắp tới: ngày âm, ngày dương tương ứng năm nay, tên, đời (FR-44). */
export default function AnniversaryPage() {
  const [days, setDays] = useState(60);
  const { data, isLoading } = useAnniversaries(days);
  const src = useSource();
  return (
    <PageShell
      title="Ngày giỗ sắp tới"
      actions={
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Khoảng thời gian">
          <option value={30}>30 ngày tới</option>
          <option value={60}>60 ngày tới</option>
          <option value={90}>90 ngày tới</option>
          <option value={365}>Cả năm</option>
        </Select>
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !data?.items.length ? (
        <Empty icon={<CalendarHeart className="size-10 text-stone-400" />} title={`Không có ngày giỗ nào trong ${days} ngày tới`}>
          <p>Ngày giỗ được tính từ ngày mất âm lịch (hoặc ngày giỗ nhập riêng) của người đã mất.</p>
        </Empty>
      ) : (
        <ul className="grid gap-3">
          {data.items.map((a) => (
            <li key={a.person_id}>
              <Card className="flex flex-wrap items-center gap-4">
                <div className="flex w-24 shrink-0 flex-col items-center rounded-lg bg-brand-800 py-2 text-white">
                  <span className="text-3xl font-bold leading-none">{pad(a.lunar_day)}</span>
                  <span className="text-sm">tháng {a.lunar_month} ÂL</span>
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`${src.base}/p/${a.person_id}`} className="text-lg font-bold text-stone-900 hover:underline">
                    {a.name}
                  </Link>
                  <p className="text-[15px] text-stone-600">
                    {[a.generation ? `Đời ${a.generation}` : null, a.death_year ? `mất năm ${a.death_year}` : null, a.is_override ? "ngày giỗ nhập riêng" : null, a.death_leap ? "mất tháng nhuận, giỗ tháng thường" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-[15px] font-medium text-stone-800">{solarLong(a.solar_date)}</p>
                </div>
                <div className="text-right">
                  <span className={`rounded-full px-3 py-1 text-[15px] font-bold ${a.days_left <= 7 ? "bg-gold-400 text-stone-900" : "bg-stone-100 text-stone-700"}`}>
                    {a.days_left === 0 ? "Hôm nay" : `Còn ${a.days_left} ngày`}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
