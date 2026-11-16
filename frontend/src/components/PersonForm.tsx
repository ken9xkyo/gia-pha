import { Camera, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, del, get, patch } from "@/api/client";
import { usePerson, useRefreshTree } from "@/api/hooks";
import type { LinkKind, PersonDetail, UnionKind, UnionStatus } from "@/api/types";
import type { FamilyGraph } from "@/lib/graph";
import { LINK_KIND, UNION_KIND, UNION_STATUS } from "@/lib/format";
import { useErrorHandler, useMutate } from "./mutate";
import { Button, Drawer, Field, Input, Select, Spinner, Toggle } from "./ui";

const RichEditor = lazy(() => import("./RichEditor").then((m) => ({ default: m.RichEditor })));

type Draft = Partial<PersonDetail>;

const NUMBER_FIELDS = new Set([
  "birth_order", "birth_year", "birth_month", "birth_day", "death_year", "death_month", "death_day",
  "death_lunar_year", "death_lunar_month", "death_lunar_day", "gio_lunar_month", "gio_lunar_day",
  "burial_lat", "burial_lng",
]);
const EDITABLE: (keyof PersonDetail)[] = [
  "full_name", "gender", "ten_huy", "ten_tu", "ten_hieu", "thuy_hieu", "birth_order", "branch_label",
  "birth_year", "birth_month", "birth_day", "birth_calendar", "birth_lunar_leap", "birth_approx", "birth_time",
  "living_status", "death_year", "death_month", "death_day", "death_approx", "death_lunar_year",
  "death_lunar_month", "death_lunar_day", "death_lunar_leap", "gio_lunar_month", "gio_lunar_day",
  "burial_place", "burial_lat", "burial_lng", "reburial_info", "hometown", "residence", "occupation", "phone",
  "biography", "show_full_birth", "show_residence", "show_phone", "hide_ten_huy",
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-stone-200 pb-5 pt-4 first:pt-0">
      <h3 className="text-base font-bold uppercase tracking-wide text-brand-800">{title}</h3>
      {children}
    </section>
  );
}

/** Ngăn kéo sửa đầy đủ các trường hồ sơ (FR-23) — có khóa lạc quan (FR-28). */
export function PersonForm({ graph, personId, onClose }: { graph: FamilyGraph; personId: number; onClose: () => void }) {
  const { data, isLoading, refetch } = usePerson(personId);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const run = useMutate();
  const onError = useErrorHandler();
  const refresh = useRefreshTree();

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const node = graph.get(personId);
  const set = <K extends keyof PersonDetail>(key: K, value: PersonDetail[K] | null) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const num = (key: keyof PersonDetail) => ({
    value: draft[key] == null ? "" : String(draft[key]),
    inputMode: "numeric" as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      set(key, (v === "" ? null : Number(v.replace(",", "."))) as never);
    },
  });
  const text = (key: keyof PersonDetail) => ({
    value: (draft[key] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value as never),
  });

  const changes = useMemo(() => {
    if (!data) return {};
    const out: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      const a = data[k] ?? null;
      let b = (draft[k] ?? null) as unknown;
      if (typeof b === "string" && !NUMBER_FIELDS.has(k)) b = b.trim() === "" ? null : b;
      if (typeof b === "number" && Number.isNaN(b)) continue;
      if (a !== b) out[k] = b;
    }
    return out;
  }, [data, draft]);

  // Gợi ý thứ tự theo năm sinh trong số anh chị em
  const suggestedOrder = useMemo(() => {
    if (!node || !draft.birth_year) return null;
    const sibs = graph.siblings(personId).map((id) => graph.get(id)!).filter((s) => s.birthYear);
    return sibs.filter((s) => s.birthYear! < draft.birth_year!).length + 1;
  }, [graph, personId, node, draft.birth_year]);

  // Xem trước quy đổi âm ↔ dương của ngày mất
  const [lunarPreview, setLunarPreview] = useState<string | null>(null);
  useEffect(() => {
    const { death_year: y, death_month: m, death_day: d } = draft;
    if (!y || !m || !d || !("death_day" in changes || "death_month" in changes || "death_year" in changes)) {
      setLunarPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await get<{ day: number; month: number; year: number; leap: boolean; can_chi: string }>(
          `/api/lunar/to-lunar?y=${y}&m=${m}&d=${d}`,
        );
        setLunarPreview(`${r.day}/${r.month}${r.leap ? " nhuận" : ""}/${r.year} âm lịch (năm ${r.can_chi})`);
      } catch {
        setLunarPreview(null);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [draft.death_year, draft.death_month, draft.death_day]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!data) return;
    const body = { ...changes };
    // Chỉ gửi một phía ngày mất khi người dùng chỉ sửa phía đó: máy chủ tự quy đổi phía kia
    setSaving(true);
    const r = await run("Đã lưu thông tin", (confirm) =>
      patch<{ batch_id: string; person: PersonDetail }>(`/api/admin/persons/${personId}`, {
        ...body,
        version: data.version,
        confirm_warnings: confirm,
      }),
    );
    setSaving(false);
    if (r) {
      await refetch();
      onClose();
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!data) return;
    const form = new FormData();
    form.append("file", file);
    try {
      await api("POST", `/api/admin/persons/${personId}/photo?version=${data.version}`, form);
      await Promise.all([refetch(), refresh(personId)]);
    } catch (e) {
      onError(e);
    }
  };
  const removePhoto = async () => {
    if (!data) return;
    try {
      await del(`/api/admin/persons/${personId}/photo?version=${data.version}`);
      await Promise.all([refetch(), refresh(personId)]);
    } catch (e) {
      onError(e);
    }
  };

  const dirty = Object.keys(changes).length > 0;
  const deceased = draft.living_status === "deceased";

  return (
    <Drawer
      open
      wide
      onClose={() => {
        if (!dirty || window.confirm("Bỏ các thay đổi chưa lưu?")) onClose();
      }}
      title={`Sửa: ${node?.name ?? ""}`}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>
            Lưu thay đổi
          </Button>
        </>
      }
    >
      {isLoading || !data ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div>
          <Section title="Cơ bản">
            <div className="flex items-center gap-4">
              {data.photo_url ? (
                <img src={data.photo_url} alt="" className="size-20 rounded-full object-cover" />
              ) : (
                <div className="flex size-20 items-center justify-center rounded-full bg-stone-200 text-stone-500">
                  <Camera className="size-7" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 font-semibold hover:bg-stone-50">
                  <Camera className="size-4" /> {data.photo_url ? "Đổi ảnh" : "Tải ảnh chân dung"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPhoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {data.photo_url && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={removePhoto}>
                    Gỡ ảnh
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm text-stone-500">Ảnh được tự cắt vuông. Hãy lưu các thay đổi khác trước khi đổi ảnh.</p>
            <Field label="Họ tên thường gọi *">
              <Input {...text("full_name")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Giới tính *">
                <Select value={draft.gender} onChange={(e) => set("gender", e.target.value as "M" | "F")}>
                  <option value="M">Nam</option>
                  <option value="F">Nữ</option>
                </Select>
              </Field>
              <Field label="Thứ tự anh chị em" hint={suggestedOrder ? `Gợi ý theo năm sinh: ${suggestedOrder}` : "1 = con trưởng"}>
                <Input {...num("birth_order")} placeholder="1, 2, 3…" />
              </Field>
              <Field label="Tình trạng">
                <Select value={draft.living_status} onChange={(e) => set("living_status", e.target.value as PersonDetail["living_status"])}>
                  <option value="unknown">Không rõ</option>
                  <option value="alive">Còn sống</option>
                  <option value="deceased">Đã mất</option>
                </Select>
              </Field>
              <Field label="Chi / phái" hint="Con cháu tự kế thừa">
                <Input {...text("branch_label")} placeholder="VD: Chi trưởng" list="branch-list" />
                <datalist id="branch-list">
                  {graph.branches.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </Field>
            </div>
          </Section>

          <Section title="Tên khác">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tên húy"><Input {...text("ten_huy")} /></Field>
              <Field label="Tên tự"><Input {...text("ten_tu")} /></Field>
              <Field label="Tên hiệu"><Input {...text("ten_hieu")} /></Field>
              <Field label="Thụy hiệu"><Input {...text("thuy_hieu")} /></Field>
            </div>
          </Section>

          <Section title="Ngày sinh">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Ngày"><Input {...num("birth_day")} placeholder="dd" /></Field>
              <Field label="Tháng"><Input {...num("birth_month")} placeholder="mm" /></Field>
              <Field label="Năm"><Input {...num("birth_year")} placeholder="yyyy" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lịch">
                <Select value={draft.birth_calendar} onChange={(e) => set("birth_calendar", e.target.value as "solar" | "lunar")}>
                  <option value="solar">Dương lịch</option>
                  <option value="lunar">Âm lịch</option>
                </Select>
              </Field>
              <Field label="Giờ sinh"><Input {...text("birth_time")} placeholder="VD: giờ Tý, 23:30" /></Field>
            </div>
            <div className="flex flex-wrap gap-x-6">
              <Toggle checked={!!draft.birth_approx} onChange={(v) => set("birth_approx", v)} label="Chỉ biết khoảng" />
              {draft.birth_calendar === "lunar" && (
                <Toggle checked={!!draft.birth_lunar_leap} onChange={(v) => set("birth_lunar_leap", v)} label="Tháng nhuận" />
              )}
            </div>
          </Section>

          {(deceased || draft.death_year || draft.death_lunar_year) && (
            <Section title="Ngày mất và ngày giỗ">
              <p className="text-sm text-stone-600">Nhập theo dương lịch hoặc âm lịch — hệ thống tự quy đổi phía còn lại khi lưu.</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Ngày (DL)"><Input {...num("death_day")} /></Field>
                <Field label="Tháng (DL)"><Input {...num("death_month")} /></Field>
                <Field label="Năm (DL)"><Input {...num("death_year")} /></Field>
              </div>
              {lunarPreview && <p className="text-[15px] text-brand-700">≈ {lunarPreview}</p>}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Ngày (ÂL)"><Input {...num("death_lunar_day")} /></Field>
                <Field label="Tháng (ÂL)"><Input {...num("death_lunar_month")} /></Field>
                <Field label="Năm (ÂL)"><Input {...num("death_lunar_year")} /></Field>
              </div>
              <div className="flex flex-wrap gap-x-6">
                <Toggle checked={!!draft.death_lunar_leap} onChange={(v) => set("death_lunar_leap", v)} label="Mất vào tháng nhuận" />
                <Toggle checked={!!draft.death_approx} onChange={(v) => set("death_approx", v)} label="Chỉ biết khoảng" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ngày giỗ nhập riêng (ÂL)" hint="Để trống = theo ngày mất">
                  <Input {...num("gio_lunar_day")} placeholder="ngày" />
                </Field>
                <Field label="Tháng giỗ (ÂL)">
                  <Input {...num("gio_lunar_month")} placeholder="tháng" />
                </Field>
              </div>
              <Field label="Nơi an táng"><Input {...text("burial_place")} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Vĩ độ"><Input {...num("burial_lat")} placeholder="21.0285" /></Field>
                <Field label="Kinh độ"><Input {...num("burial_lng")} placeholder="105.8542" /></Field>
              </div>
              <Field label="Cải táng"><Input {...text("reburial_info")} placeholder="Năm, nơi cải táng…" /></Field>
            </Section>
          )}

          <Section title="Thông tin khác">
            <Field label="Quê quán"><Input {...text("hometown")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nơi ở"><Input {...text("residence")} /></Field>
              <Field label="Điện thoại"><Input {...text("phone")} inputMode="tel" /></Field>
            </div>
            <Field label="Nghề nghiệp"><Input {...text("occupation")} /></Field>
            <Field label="Tiểu sử">
              <Suspense fallback={<Spinner />}>
                <RichEditor value={draft.biography ?? ""} onChange={(v) => set("biography", v)} allowImages />
              </Suspense>
            </Field>
          </Section>

          <Section title="Quyền riêng tư (với người xem)">
            <Toggle checked={!!draft.show_full_birth} onChange={(v) => set("show_full_birth", v)} label="Hiện ngày sinh đầy đủ" description="Mặc định chỉ hiện năm sinh với người còn sống" />
            <Toggle checked={!!draft.show_residence} onChange={(v) => set("show_residence", v)} label="Hiện nơi ở" />
            <Toggle checked={!!draft.show_phone} onChange={(v) => set("show_phone", v)} label="Hiện số điện thoại" />
            <Toggle checked={!!draft.hide_ten_huy} onChange={(v) => set("hide_ten_huy", v)} label="Ẩn tên húy" />
          </Section>

          <RelationsEditor graph={graph} personId={personId} run={run} />
        </div>
      )}
    </Drawer>
  );
}

function RelationsEditor({ graph, personId, run }: { graph: FamilyGraph; personId: number; run: ReturnType<typeof useMutate> }) {
  const p = graph.get(personId)!;
  const link = p.parentLink;
  const parentUnions = useMemo(() => {
    if (!link) return [];
    const u = graph.unions.get(link.u);
    const parent = u?.husband ?? u?.wife;
    return parent != null ? graph.get(parent)!.unions : [];
  }, [graph, link]);

  return (
    <Section title="Quan hệ">
      {link && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quan hệ với cha mẹ">
            <Select
              value={link.k}
              onChange={(e) =>
                void run("Đã đổi loại quan hệ", () => patch(`/api/admin/links/${link.id}`, { version: link.v, kind: e.target.value as LinkKind }))
              }
            >
              {Object.entries(LINK_KIND).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          {parentUnions.length > 1 && (
            <Field label="Là con của cuộc hôn nhân">
              <Select
                value={link.u}
                onChange={(e) =>
                  void run("Đã chuyển cha mẹ", () => patch(`/api/admin/links/${link.id}`, { version: link.v, union_id: Number(e.target.value) }))
                }
              >
                {parentUnions.map((uid) => {
                  const u = graph.unions.get(uid)!;
                  const names = [u.husband, u.wife].map((x) => (x != null ? graph.get(x)?.name : "(không rõ tên)")).join(" & ");
                  return <option key={uid} value={uid}>{names}</option>;
                })}
              </Select>
            </Field>
          )}
        </div>
      )}
      {p.unions.map((uid) => {
        const u = graph.unions.get(uid)!;
        const sp = graph.partnerIn(uid, personId);
        const spName = sp != null ? graph.get(sp)?.name : `${p.gender === "M" ? "Vợ" : "Chồng"} không rõ tên`;
        const save = (body: Record<string, unknown>) =>
          void run("Đã lưu hôn nhân", () => patch(`/api/admin/unions/${uid}`, { version: u.version, ...body }));
        return (
          <div key={uid} className="rounded-lg border border-stone-200 p-3">
            <p className="mb-2 font-semibold">{spName}</p>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Loại">
                <Select value={u.kind} onChange={(e) => save({ kind: e.target.value as UnionKind })}>
                  {(p.gender === "M" ? ["chinh_that", "ke_that", "thu_that"] : ["chong"]).map((k) => (
                    <option key={k} value={k}>{UNION_KIND[k as UnionKind]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Thứ tự">
                <Select value={u.order} onChange={(e) => save({ order_index: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{p.gender === "M" ? `Vợ ${["", "cả", "hai", "ba", "tư", "năm", "sáu"][n]}` : `Thứ ${n}`}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Tình trạng">
                <Select value={u.status} onChange={(e) => save({ status: e.target.value as UnionStatus })}>
                  {Object.entries(UNION_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {u.children.length === 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-red-700"
                onClick={() => {
                  if (window.confirm("Gỡ quan hệ hôn nhân này?")) void run("Đã gỡ quan hệ hôn nhân", () => del(`/api/admin/unions/${uid}`));
                }}
              >
                Gỡ quan hệ hôn nhân
              </Button>
            )}
          </div>
        );
      })}
    </Section>
  );
}
