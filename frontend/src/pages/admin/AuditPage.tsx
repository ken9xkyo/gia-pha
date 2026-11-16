import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { get } from "@/api/client";
import type { AuditItem } from "@/api/types";
import { Button, Card, PageShell, Spinner } from "@/components/ui";
import { dateTime } from "@/lib/format";

const FIELD: Record<string, string> = {
  full_name: "Họ tên", gender: "Giới tính", ten_huy: "Tên húy", ten_tu: "Tên tự", ten_hieu: "Tên hiệu", thuy_hieu: "Thụy hiệu",
  birth_order: "Thứ tự", branch_label: "Chi/phái", birth_year: "Năm sinh", birth_month: "Tháng sinh", birth_day: "Ngày sinh",
  birth_calendar: "Lịch ngày sinh", birth_lunar_leap: "Sinh tháng nhuận", birth_approx: "Sinh khoảng", birth_time: "Giờ sinh",
  living_status: "Tình trạng", death_year: "Năm mất", death_month: "Tháng mất", death_day: "Ngày mất", death_approx: "Mất khoảng",
  death_lunar_year: "Năm mất (ÂL)", death_lunar_month: "Tháng mất (ÂL)", death_lunar_day: "Ngày mất (ÂL)", death_lunar_leap: "Mất tháng nhuận",
  gio_lunar_month: "Tháng giỗ", gio_lunar_day: "Ngày giỗ", burial_place: "Nơi an táng", burial_lat: "Vĩ độ mộ", burial_lng: "Kinh độ mộ",
  reburial_info: "Cải táng", hometown: "Quê quán", residence: "Nơi ở", occupation: "Nghề nghiệp", phone: "Điện thoại", biography: "Tiểu sử",
  photo: "Ảnh", show_full_birth: "Hiện ngày sinh", show_residence: "Hiện nơi ở", show_phone: "Hiện điện thoại", hide_ten_huy: "Ẩn tên húy",
  deleted_at: "Đã xóa", deleted_batch: "Lô xóa", husband_id: "Chồng (mã)", wife_id: "Vợ (mã)", kind: "Loại", order_index: "Thứ tự",
  status: "Tình trạng", child_id: "Con (mã)", union_id: "Hôn nhân (mã)", clan_name: "Tên dòng họ", tagline: "Khẩu hiệu",
  pha_ky_html: "Phả ký", public_token: "Link công khai", contact_name: "Người liên hệ", contact_phone: "SĐT liên hệ",
  contact_zalo: "Zalo", root_person_id: "Thủy tổ (mã)", kinship_overrides: "Quy tắc xưng hô",
};
const ACTION: Record<string, string> = { create: "Tạo", update: "Sửa", delete: "Xóa", hard_delete: "Hủy tạo" };
const KIND: Record<string, string> = { edit: "", delete: "", undo: "Hoàn tác", restore: "Khôi phục", purge: "Xóa vĩnh viễn" };

function show(v: unknown): string {
  if (v == null || v === "") return "∅";
  if (typeof v === "boolean") return v ? "có" : "không";
  if (typeof v === "object") return "(đã đổi)";
  const s = String(v).replace(/<[^>]+>/g, " ");
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

/** Nhật ký thay đổi: ai, lúc nào, sửa trường gì, giá trị cũ → mới (FR-47). */
export default function AuditPage() {
  const [params] = useSearchParams();
  const entity = params.get("entity");
  const id = params.get("id");
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page) });
  if (entity) qs.set("entity_type", entity);
  if (id) qs.set("entity_id", id);
  const { data, isLoading } = useQuery({
    queryKey: ["audit", entity, id, page],
    queryFn: () => get<{ items: AuditItem[]; has_more: boolean }>(`/api/admin/audit?${qs}`),
  });

  return (
    <PageShell
      title={entity ? "Lịch sử thay đổi của một thành viên" : "Nhật ký thay đổi"}
      actions={entity && <Link to="/admin/nhat-ky" className="text-brand-700 underline">Xem toàn bộ</Link>}
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="grid gap-2">
          {data?.items.map((e) => {
            const changes = Object.entries(e.changes).filter(([k]) => k !== "deleted_batch" && k !== "tree_version");
            return (
              <li key={e.id}>
                <Card className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-stone-900">
                      <span className="mr-2 rounded bg-stone-100 px-1.5 py-0.5 text-sm">{KIND[e.batch_kind] || ACTION[e.action] || e.action}</span>
                      {e.label}
                      {e.undone && <span className="ml-2 text-sm font-normal text-stone-500">(đã hoàn tác)</span>}
                    </p>
                    <span className="text-sm text-stone-500">
                      {dateTime(e.created_at)} · {e.admin_name ?? "hệ thống"}
                    </span>
                  </div>
                  <p className="text-sm text-stone-600">{e.batch_summary}</p>
                  {e.action === "update" && changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-[15px]">
                      {changes.slice(0, 12).map(([k, [a, b]]) => (
                        <li key={k}>
                          <span className="text-stone-500">{FIELD[k] ?? k}:</span> <span className="text-red-700 line-through">{show(a)}</span> →{" "}
                          <span className="text-green-800">{show(b)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 flex justify-center gap-2">
        <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Trang trước</Button>
        <Button disabled={!data?.has_more} onClick={() => setPage((p) => p + 1)}>Trang sau</Button>
      </div>
    </PageShell>
  );
}
