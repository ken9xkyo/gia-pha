import type { RawPerson, RawTree } from "@/api/types";

const P = (id: number, n: string, g: "M" | "F", extra: Partial<RawPerson> = {}): RawPerson => ({ id, n, g, ...extra });

/** Cây bên nội theo ví dụ kiểm thử PRD mục 8. */
export function paternalTree(): RawTree {
  return {
    version: 1,
    root: 1,
    clan: "Nguyễn",
    kinship: {},
    persons: [
      P(1, "Nguyễn Văn Tổ", "M", { by: 1880 }),
      P(2, "Phạm Thị Lành", "F"),
      P(3, "Nguyễn Văn Đức", "M", { o: 1, by: 1905 }),
      P(4, "Hoàng Thị Nết", "F"),
      P(5, "Nguyễn Văn Bảo", "M", { o: 1, by: 1935 }),
      P(6, "Nguyễn Văn Bình", "M", { o: 2, by: 1938 }),
      P(7, "Nguyễn Văn Hùng", "M", { o: 3, by: 1942 }),
      P(8, "Đỗ Thị Thu", "F"),
      P(9, "Lý Thị Gấm", "F"),
      P(10, "Nguyễn Thị Lan", "F", { o: 1, by: 1970 }),
      P(11, "Đặng Thị Mai", "F"),
      P(12, "Nguyễn Văn Quang", "M", { o: 1, by: 1962 }),
      P(13, "Nguyễn Văn An", "M", { o: 2, by: 1965 }),
      P(14, "Vũ Thị Ngọc", "F"),
      P(15, "Nguyễn Minh Khôi", "M", { o: 1, by: 1995 }),
      P(16, "Nguyễn Thị Hằng", "F", { o: 4, by: 1945 }),
      P(17, "Phan Văn Khải", "M"),
      P(18, "Phan Thị Yến", "F", { o: 1, by: 1972 }),
    ],
    unions: [
      { id: 101, h: 1, w: 2, k: "chinh_that", o: 1, s: "married" },
      { id: 102, h: 3, w: 4, k: "chinh_that", o: 1, s: "married" },
      { id: 103, h: 7, w: 8, k: "chinh_that", o: 1, s: "married" },
      { id: 104, h: 5, w: 9, k: "chinh_that", o: 1, s: "married" },
      { id: 105, h: 6, w: 11, k: "chinh_that", o: 1, s: "married" },
      { id: 106, h: 13, w: 14, k: "chinh_that", o: 1, s: "married" },
      { id: 107, h: 17, w: 16, k: "chong", o: 1, s: "married" },
    ],
    links: [
      { id: 201, c: 3, u: 101, k: "biological" },
      { id: 202, c: 5, u: 102, k: "biological" },
      { id: 203, c: 6, u: 102, k: "biological" },
      { id: 204, c: 7, u: 102, k: "biological" },
      { id: 205, c: 16, u: 102, k: "biological" },
      { id: 206, c: 10, u: 104, k: "biological" },
      { id: 207, c: 12, u: 105, k: "biological" },
      { id: 208, c: 13, u: 105, k: "biological" },
      { id: 209, c: 15, u: 106, k: "biological" },
      { id: 210, c: 18, u: 107, k: "biological" },
    ],
  };
}

/** Cây có mẹ của An thuộc dòng họ (để kiểm thử bên ngoại). */
export function maternalTree(): RawTree {
  return {
    version: 1,
    root: 1,
    clan: "Lê",
    kinship: {},
    persons: [
      P(1, "Lê Văn Tổ", "M", { by: 1910 }),
      P(2, "Trần Thị Bà", "F"),
      P(3, "Lê Văn Hải", "M", { o: 1, by: 1935 }),
      P(4, "Lê Thị Mai", "F", { o: 2, by: 1940 }),
      P(5, "Lê Thị Cúc", "F", { o: 3, by: 1945 }),
      P(6, "Lê Văn Tùng", "M", { o: 4, by: 1948 }),
      P(7, "Nguyễn Văn Sơn", "M"),
      P(8, "Nguyễn Văn An", "M", { o: 1, by: 1965 }),
      P(9, "Phạm Thị Hoa", "F"),
      P(10, "Đào Văn Lộc", "M"),
    ],
    unions: [
      { id: 101, h: 1, w: 2, k: "chinh_that", o: 1, s: "married" },
      { id: 102, h: 7, w: 4, k: "chong", o: 1, s: "married" },
      { id: 103, h: 6, w: 9, k: "chinh_that", o: 1, s: "married" },
      { id: 104, h: 10, w: 5, k: "chong", o: 1, s: "married" },
    ],
    links: [
      { id: 201, c: 3, u: 101, k: "biological" },
      { id: 202, c: 4, u: 101, k: "biological" },
      { id: 203, c: 5, u: 101, k: "biological" },
      { id: 204, c: 6, u: 101, k: "biological" },
      { id: 205, c: 8, u: 102, k: "biological" },
    ],
  };
}
