import type { RuleEntry, RuleOverrides } from "@/api/types";

/**
 * Bảng quy tắc xưng hô miền Bắc (PRD mục 8.2, 8.3). Đây là dữ liệu cấu hình:
 * admin sửa đè từng nhãn trong trang "Quy tắc xưng hô" mà không cần sửa code (FR-57).
 *
 * m/f   : nhãn khi người được xem là nam/nữ
 * sm/sf : nhãn cho vợ của người nam / chồng của người nữ có quan hệ này (bảng 8.3)
 * pm/pf : từ xưng khi người kia gọi mình bằng nhãn m/f (mặc định = chữ đầu viết thường)
 * {n}   : số đời
 */
export interface RuleGroup {
  title: string;
  keys: { key: string; desc: string }[];
}

export const DEFAULT_RULES: Record<string, RuleEntry> = {
  self: { m: "Bạn", f: "Bạn" },
  spouse: { m: "Chồng", f: "Vợ", pm: "anh", pf: "em" },

  parent: { m: "Bố", f: "Mẹ", sm: "Dì", sf: "Bố dượng" },
  grandparent_noi: { m: "Ông nội", f: "Bà nội", sm: "Bà nội", sf: "Ông nội" },
  grandparent_ngoai: { m: "Ông ngoại", f: "Bà ngoại", sm: "Bà ngoại", sf: "Ông ngoại" },
  great_grandparent: { m: "Cụ ông", f: "Cụ bà", sm: "Cụ bà", sf: "Cụ ông" },
  great2_grandparent: { m: "Kỵ ông", f: "Kỵ bà", sm: "Kỵ bà", sf: "Kỵ ông" },
  ancestor_far: { m: "Tổ (cách {n} đời)", f: "Tổ (cách {n} đời)", sm: "Tổ (cách {n} đời)", sf: "Tổ (cách {n} đời)", pm: "tổ", pf: "tổ" },

  pibling_noi_elder: { m: "Bác", f: "Bác", sm: "Bác", sf: "Bác" },
  pibling_noi_younger: { m: "Chú", f: "Cô", sm: "Thím", sf: "Chú" },
  pibling_ngoai_elder: { m: "Bác", f: "Bác", sm: "Bác", sf: "Bác" },
  pibling_ngoai_younger: { m: "Cậu", f: "Dì", sm: "Mợ", sf: "Chú" },
  grandpibling_noi_elder: { m: "Ông bác", f: "Bà bác", sm: "Bà bác", sf: "Ông bác" },
  grandpibling_noi_younger: { m: "Ông chú", f: "Bà cô", sm: "Bà thím", sf: "Ông chú" },
  grandpibling_ngoai_elder: { m: "Ông bác", f: "Bà bác", sm: "Bà bác", sf: "Ông bác" },
  grandpibling_ngoai_younger: { m: "Ông cậu", f: "Bà dì", sm: "Bà mợ", sf: "Ông chú" },
  grand_collateral: { m: "Ông", f: "Bà", sm: "Bà", sf: "Ông" },

  sibling_elder: { m: "Anh", f: "Chị", sm: "Chị", sf: "Anh" },
  sibling_younger: { m: "Em trai", f: "Em gái", sm: "Em", sf: "Em" },
  cousin_elder: { m: "Anh họ", f: "Chị họ", sm: "Chị", sf: "Anh" },
  cousin_younger: { m: "Em họ", f: "Em họ", sm: "Em", sf: "Em" },

  child: { m: "Con trai", f: "Con gái", sm: "Con dâu", sf: "Con rể" },
  grandchild_noi: { m: "Cháu nội", f: "Cháu nội", sm: "Cháu dâu", sf: "Cháu rể" },
  grandchild_ngoai: { m: "Cháu ngoại", f: "Cháu ngoại", sm: "Cháu dâu", sf: "Cháu rể" },
  great_grandchild: { m: "Chắt", f: "Chắt", sm: "Chắt dâu", sf: "Chắt rể" },
  great2_grandchild: { m: "Chút", f: "Chút", sm: "Chút dâu", sf: "Chút rể" },
  great3_grandchild: { m: "Chít", f: "Chít", sm: "Chít dâu", sf: "Chít rể" },
  descendant_far: { m: "Hậu duệ (cách {n} đời)", f: "Hậu duệ (cách {n} đời)", sm: "Hậu duệ (cách {n} đời)", sf: "Hậu duệ (cách {n} đời)", pm: "cháu", pf: "cháu" },
  nibling: { m: "Cháu", f: "Cháu", sm: "Cháu dâu", sf: "Cháu rể" },
  grandnibling: { m: "Cháu", f: "Cháu", sm: "Cháu dâu", sf: "Cháu rể" },

  inlaw_parent: { m: "Bố", f: "Mẹ" },
  inlaw_relative_husband: { m: "Họ hàng bên chồng", f: "Họ hàng bên chồng", pm: "", pf: "" },
  inlaw_relative_wife: { m: "Họ hàng bên vợ", f: "Họ hàng bên vợ", pm: "", pf: "" },
  unknown: { m: "Chưa rõ quan hệ", f: "Chưa rõ quan hệ", pm: "", pf: "" },
  ho_suffix: { m: "họ", f: "họ" },
};

export const RULE_GROUPS: RuleGroup[] = [
  {
    title: "Đời trên trực hệ",
    keys: [
      { key: "parent", desc: "Cha mẹ (vợ/chồng khác của cha mẹ: mẹ kế, bố dượng)" },
      { key: "grandparent_noi", desc: "Ông bà bên nội" },
      { key: "grandparent_ngoai", desc: "Ông bà bên ngoại" },
      { key: "great_grandparent", desc: "Đời +3 (cha mẹ của ông bà) và anh chị em của họ" },
      { key: "great2_grandparent", desc: "Đời +4" },
      { key: "ancestor_far", desc: "Đời +5 trở lên" },
    ],
  },
  {
    title: "Anh chị em của cha mẹ, ông bà",
    keys: [
      { key: "pibling_noi_elder", desc: "Anh/chị của bố (ngành trên)" },
      { key: "pibling_noi_younger", desc: "Em của bố (ngành dưới)" },
      { key: "pibling_ngoai_elder", desc: "Anh/chị của mẹ" },
      { key: "pibling_ngoai_younger", desc: "Em của mẹ" },
      { key: "grandpibling_noi_elder", desc: "Anh/chị của ông (nội hoặc ngoại)" },
      { key: "grandpibling_noi_younger", desc: "Em của ông" },
      { key: "grandpibling_ngoai_elder", desc: "Anh/chị của bà" },
      { key: "grandpibling_ngoai_younger", desc: "Em của bà" },
      { key: "grand_collateral", desc: "Họ hàng khác cùng vế ông bà" },
    ],
  },
  {
    title: "Cùng vế",
    keys: [
      { key: "sibling_elder", desc: "Anh chị ruột (sinh trước)" },
      { key: "sibling_younger", desc: "Em ruột" },
      { key: "cousin_elder", desc: "Anh chị họ (ngành trên, không xét tuổi)" },
      { key: "cousin_younger", desc: "Em họ (ngành dưới)" },
      { key: "spouse", desc: "Vợ / chồng" },
    ],
  },
  {
    title: "Đời dưới",
    keys: [
      { key: "child", desc: "Con" },
      { key: "grandchild_noi", desc: "Cháu nội (con của con trai)" },
      { key: "grandchild_ngoai", desc: "Cháu ngoại (con của con gái)" },
      { key: "great_grandchild", desc: "Đời −3" },
      { key: "great2_grandchild", desc: "Đời −4" },
      { key: "great3_grandchild", desc: "Đời −5" },
      { key: "descendant_far", desc: "Đời −6 trở xuống" },
      { key: "nibling", desc: "Con của anh chị em (ruột hoặc họ)" },
      { key: "grandnibling", desc: "Cháu của anh chị em" },
    ],
  },
  {
    title: "Qua hôn nhân và khác",
    keys: [
      { key: "inlaw_parent", desc: "Dâu/rể gọi cha mẹ chồng/vợ" },
      { key: "inlaw_relative_husband", desc: "Họ hàng xa bên chồng (2 bước hôn nhân)" },
      { key: "inlaw_relative_wife", desc: "Họ hàng xa bên vợ (2 bước hôn nhân)" },
      { key: "unknown", desc: "Không xác định được quan hệ" },
      { key: "ho_suffix", desc: "Hậu tố thêm cho họ hàng xa (VD: chú họ, cháu họ)" },
    ],
  },
];

export type Rules = Record<string, RuleEntry>;

export function mergeRules(overrides: RuleOverrides | undefined): Rules {
  const out: Rules = {};
  for (const [key, entry] of Object.entries(DEFAULT_RULES)) {
    out[key] = { ...entry, ...(overrides?.[key] ?? {}) };
  }
  return out;
}
