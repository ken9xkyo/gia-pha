/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu ("nguyen van an" ↔ "Nguyễn Văn An"). */
export function normalize(s: string): string {
  return s
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const viCollator = new Intl.Collator("vi", { sensitivity: "base" });

/** Tên gọi (chữ cuối) — "Nguyễn Văn Hùng" → "Hùng". */
export function givenName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Tìm theo cụm từ: mọi từ của truy vấn phải xuất hiện trong chuỗi đã chuẩn hóa. */
export function matches(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return q.split(" ").every((w) => haystack.includes(w));
}
