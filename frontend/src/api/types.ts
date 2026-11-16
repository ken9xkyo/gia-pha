export type Gender = "M" | "F";
export type LivingStatus = "alive" | "deceased" | "unknown";
export type UnionKind = "chinh_that" | "ke_that" | "thu_that" | "chong";
export type UnionStatus = "married" | "widowed" | "divorced";
export type LinkKind = "biological" | "adopted" | "step";

export interface RuleEntry {
  m: string;
  f: string;
  /** Gọi vợ của một người nam có quan hệ này */
  sm?: string;
  /** Gọi chồng của một người nữ có quan hệ này */
  sf?: string;
  /** Từ xưng khi người kia gọi mình bằng nhãn này (mặc định: chữ đầu của nhãn) */
  pm?: string;
  pf?: string;
}
export type RuleOverrides = Record<string, Partial<RuleEntry>>;

export interface RawPerson {
  id: number;
  n: string;
  g: Gender;
  by?: number;
  bm?: number;
  bd?: number;
  ba?: 1;
  bl?: 1;
  dy?: number;
  st?: "a" | "d";
  o?: number;
  br?: string;
  ph?: string;
  th?: string;
  v?: number;
}

export interface RawUnion {
  id: number;
  h: number | null;
  w: number | null;
  k: UnionKind;
  o: number;
  s: UnionStatus;
  v?: number;
}

export interface RawLink {
  id: number;
  c: number;
  u: number;
  k: LinkKind;
  v?: number;
}

export interface RawTree {
  version: number;
  root: number | null;
  clan: string;
  kinship: RuleOverrides;
  persons: RawPerson[];
  unions: RawUnion[];
  links: RawLink[];
}

export interface PersonDetail {
  id: number;
  full_name: string;
  gender: Gender;
  ten_huy: string | null;
  ten_tu: string | null;
  ten_hieu: string | null;
  thuy_hieu: string | null;
  birth_order: number | null;
  branch_label: string | null;
  birth_year: number | null;
  birth_month: number | null;
  birth_day: number | null;
  birth_calendar: "solar" | "lunar";
  birth_lunar_leap: boolean;
  birth_approx: boolean;
  birth_time: string | null;
  living_status: LivingStatus;
  death_year: number | null;
  death_month: number | null;
  death_day: number | null;
  death_approx: boolean;
  death_lunar_year: number | null;
  death_lunar_month: number | null;
  death_lunar_day: number | null;
  death_lunar_leap: boolean;
  gio_lunar_month: number | null;
  gio_lunar_day: number | null;
  burial_place: string | null;
  burial_lat: number | null;
  burial_lng: number | null;
  reburial_info: string | null;
  hometown: string | null;
  residence: string | null;
  occupation: string | null;
  phone: string | null;
  biography: string | null;
  photo_url: string | null;
  photo_thumb_url: string | null;
  // chỉ admin
  version?: number;
  photo?: string | null;
  show_full_birth?: boolean;
  show_residence?: boolean;
  show_phone?: boolean;
  hide_ten_huy?: boolean;
  updated_at?: string | null;
}

export interface PublicConfig {
  clan_name: string;
  tagline: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_zalo: string | null;
  has_pha_ky: boolean;
}

export interface AdminSettings extends PublicConfig {
  version: number;
  public_token: string;
  root_person_id: number | null;
  kinship_overrides: RuleOverrides;
}

export interface AdminInfo {
  id: number;
  email: string;
  full_name: string;
  totp_enabled: boolean;
}

export interface AdminUser extends AdminInfo {
  is_active: boolean;
  last_login_at: string | null;
  locked: boolean;
  created_at: string | null;
}

export interface Anniversary {
  person_id: number;
  name: string;
  gender: Gender;
  generation: number | null;
  lunar_day: number;
  lunar_month: number;
  lunar_year: number;
  solar_date: string;
  days_left: number;
  death_year: number | null;
  death_leap: boolean;
  is_override: boolean;
  photo: string | null;
}

export interface MutationResult {
  batch_id: string;
  person_id?: number;
  union_id?: number;
  count?: number;
}

export interface DeletePreview {
  mode: "single" | "branch" | "inlaw" | "blocked";
  count: number;
  reason: string | null;
  names: string[];
  keeps_children: boolean;
  person_name: string | null;
  /** Người sẽ không còn đường nối về dòng họ nên bị xóa theo (VD: nhà thông gia) */
  detached_count: number;
  detached_names: string[];
}

export interface TrashItem {
  id: string;
  summary: string;
  created_at: string;
  expires_at: string;
  admin_name: string | null;
  names: string[];
}

export interface AuditItem {
  id: number;
  created_at: string;
  admin_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number;
  label: string | null;
  batch_id: string;
  batch_summary: string;
  batch_kind: string;
  undone: boolean;
  changes: Record<string, [unknown, unknown]>;
}

export interface Stats {
  persons: number;
  lineage: number;
  inlaws: number;
  extended: number;
  generations: number;
  disconnected: number;
  with_siblings: number;
  with_order: number;
  visits_30d: number;
  visits_with_me_30d: number;
}

export interface BackupFile {
  name: string;
  size: number;
  created_at: string;
}
