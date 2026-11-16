import type { PersonDetail, UnionKind, UnionStatus } from "@/api/types";
import type { PNode } from "./graph";

export const UNION_KIND: Record<UnionKind, string> = {
  chinh_that: "Chính thất",
  ke_that: "Kế thất",
  thu_that: "Thứ thất",
  chong: "Chồng",
};
export const UNION_STATUS: Record<UnionStatus, string> = {
  married: "Chung sống",
  widowed: "Góa",
  divorced: "Ly hôn",
};
export const LINK_KIND = { biological: "Con ruột", adopted: "Con nuôi", step: "Con riêng của vợ/chồng" } as const;
export const STATUS = { alive: "Còn sống", deceased: "Đã mất", unknown: "Không rõ" } as const;
export const WIFE_ORDER = ["", "Vợ cả", "Vợ hai", "Vợ ba", "Vợ tư", "Vợ năm"];

export function lifeSpan(p: PNode): string {
  const b = p.birthYear ? `${p.birthApprox ? "~" : ""}${p.birthYear}` : "";
  if (p.status === "deceased" || p.deathYear) return `${b || "?"} – ${p.deathYear ?? "?"}`;
  return b ? `s. ${b}` : "";
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDate(y?: number | null, m?: number | null, d?: number | null): string {
  if (!y && !m) return "";
  const parts: string[] = [];
  if (d) parts.push(pad(d));
  if (m) parts.push(pad(m));
  if (y) parts.push(String(y));
  return parts.join("/");
}

export function birthText(p: PersonDetail): string {
  const s = formatDate(p.birth_year, p.birth_month, p.birth_day);
  if (!s) return "";
  return `${p.birth_approx ? "Khoảng " : ""}${s}${p.birth_calendar === "lunar" ? ` (âm lịch${p.birth_lunar_leap ? ", tháng nhuận" : ""})` : ""}`;
}

export function deathText(p: PersonDetail): string {
  const solar = formatDate(p.death_year, p.death_month, p.death_day);
  const lunar = formatDate(p.death_lunar_year, p.death_lunar_month, p.death_lunar_day);
  const parts: string[] = [];
  if (solar) parts.push(`${p.death_approx ? "Khoảng " : ""}${solar}`);
  if (lunar) parts.push(`${lunar} âm lịch${p.death_lunar_leap ? " (tháng nhuận)" : ""}`);
  return parts.join(" · ");
}

export function gioText(p: PersonDetail): string {
  if (p.gio_lunar_day && p.gio_lunar_month) return `${pad(p.gio_lunar_day)}/${pad(p.gio_lunar_month)} âm lịch (nhập riêng)`;
  if (p.death_lunar_day && p.death_lunar_month) return `${pad(p.death_lunar_day)}/${pad(p.death_lunar_month)} âm lịch`;
  return "";
}

const WEEKDAYS = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];

export function solarLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]}, ${pad(d)}/${pad(m)}/${y}`;
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function mediaThumb(key?: string | null) {
  return key ? `/media/p/${key}_t.webp` : null;
}
