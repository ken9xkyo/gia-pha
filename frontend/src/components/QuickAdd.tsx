import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { post } from "@/api/client";
import type { Gender, LinkKind, MutationResult, UnionKind } from "@/api/types";
import type { FamilyGraph } from "@/lib/graph";
import { LINK_KIND, UNION_KIND } from "@/lib/format";
import { useMutate } from "./mutate";
import { PersonSearch } from "./PersonSearch";
import { Button, Dialog, Field, Input, Select } from "./ui";

export type AddMode = "child" | "spouse" | "sibling" | "parents" | "root";

function surname(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

function GenderPick({ value, onChange, fixed }: { value: Gender; onChange: (g: Gender) => void; fixed?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Giới tính">
      {(["M", "F"] as const).map((g) => (
        <button
          key={g}
          type="button"
          role="radio"
          aria-checked={value === g}
          disabled={fixed && value !== g}
          onClick={() => onChange(g)}
          className={clsx(
            "min-h-11 rounded-lg border-2 font-semibold transition-colors disabled:opacity-40",
            value === g
              ? g === "M"
                ? "border-blue-700 bg-blue-50 text-blue-800"
                : "border-pink-700 bg-pink-50 text-pink-800"
              : "border-stone-300 bg-white text-stone-700",
          )}
        >
          {g === "M" ? "Nam" : "Nữ"}
        </button>
      ))}
    </div>
  );
}

interface Props {
  graph: FamilyGraph;
  mode: AddMode;
  personId: number | null;
  onClose: () => void;
  onCreated: (id: number | undefined) => void;
}

/** Thêm nhanh chỉ cần tên + giới tính; "Lưu và thêm tiếp" để nhập nhiều con liên tiếp (FR-22). */
export function QuickAdd({ graph, mode, personId, onClose, onCreated }: Props) {
  const run = useMutate();
  const p = personId != null ? graph.get(personId) : undefined;
  const nameRef = useRef<HTMLInputElement>(null);

  const unions = p?.unions ?? [];
  const [unionId, setUnionId] = useState<number | null>(unions.length ? unions[0] : null);
  const defaultSurname = useMemo(() => {
    if (!p) return "";
    if (mode === "child") {
      const u = unionId != null ? graph.unions.get(unionId) : undefined;
      const father = u?.husband != null ? graph.get(u.husband) : p.gender === "M" ? p : undefined;
      return father ? `${surname(father.name)} ` : "";
    }
    if (mode === "sibling") return `${surname(p.name)} `;
    if (mode === "parents") return `${surname(p.name)} `;
    return "";
  }, [graph, p, mode, unionId]);

  const [name, setName] = useState(defaultSurname);
  const [gender, setGender] = useState<Gender>(mode === "spouse" && p ? (p.gender === "M" ? "F" : "M") : "M");
  const [birthYear, setBirthYear] = useState("");
  const [order, setOrder] = useState("");
  const [linkKind, setLinkKind] = useState<LinkKind>("biological");
  const [kind, setKind] = useState<UnionKind>(p?.gender === "M" ? (unions.length ? "ke_that" : "chinh_that") : "chong");
  const [existing, setExisting] = useState<number | null>(null);
  const [tab, setTab] = useState<"new" | "existing">("new");
  const [motherName, setMotherName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(defaultSurname), [defaultSurname]);

  const nextOrder = useMemo(() => {
    if (!p) return 1;
    const sibs = mode === "child" ? graph.children(p.id) : mode === "sibling" ? [p.id, ...graph.siblings(p.id)] : [];
    return Math.max(0, ...sibs.map((id) => graph.get(id)?.order ?? 0), sibs.length) + 1;
  }, [graph, p, mode]);

  const title = {
    child: `Thêm con cho ${p?.name}`,
    spouse: `Thêm ${p?.gender === "M" ? "vợ" : "chồng"} cho ${p?.name}`,
    sibling: `Thêm anh/chị/em của ${p?.name}`,
    parents: `Thêm cha mẹ cho thủy tổ ${p?.name}`,
    root: "Tạo thủy tổ",
  }[mode];

  const person = () => ({
    full_name: name.trim(),
    gender,
    ...(birthYear ? { birth_year: Number(birthYear) } : {}),
    ...(order ? { birth_order: Number(order) } : {}),
  });

  const submit = async (again: boolean) => {
    if (mode !== "parents" && mode !== "spouse" && !name.trim()) return nameRef.current?.focus();
    setBusy(true);
    let r: MutationResult | null = null;
    const base = "/api/admin/persons";
    if (mode === "root") {
      r = await run("Đã tạo thủy tổ", () => post<MutationResult>(`${base}/root`, person()));
    } else if (mode === "child") {
      r = await run(`Đã thêm ${name.trim()}`, (confirm) =>
        post<MutationResult>(`${base}/${personId}/children`, { person: person(), union_id: unionId, link_kind: linkKind, confirm_warnings: confirm }),
      );
    } else if (mode === "sibling") {
      r = await run(`Đã thêm ${name.trim()}`, (confirm) =>
        post<MutationResult>(`${base}/${personId}/siblings`, { person: person(), confirm_warnings: confirm }),
      );
    } else if (mode === "spouse") {
      if (tab === "existing" && existing == null) return setBusy(false);
      if (tab === "new" && !name.trim()) {
        setBusy(false);
        return nameRef.current?.focus();
      }
      r = await run("Đã thêm vợ/chồng", () =>
        post<MutationResult>(`${base}/${personId}/spouses`, tab === "existing" ? { existing_person_id: existing, kind } : { person: person(), kind }),
      );
    } else if (mode === "parents") {
      const father = name.trim() && name.trim() !== defaultSurname.trim() ? { full_name: name.trim(), gender: "M" } : null;
      const mother = motherName.trim() ? { full_name: motherName.trim(), gender: "F" } : null;
      if (!father && !mother) {
        setBusy(false);
        return nameRef.current?.focus();
      }
      r = await run("Đã thêm cha mẹ", () => post<MutationResult>(`${base}/${personId}/parents`, { father, mother }));
    }
    setBusy(false);
    if (!r) return;
    onCreated(r.person_id);
    if (again && (mode === "child" || mode === "sibling")) {
      setName(defaultSurname);
      setBirthYear("");
      setOrder("");
      setTimeout(() => nameRef.current?.focus(), 30);
    } else onClose();
  };

  const canRepeat = mode === "child" || mode === "sibling";

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          {canRepeat && (
            <Button onClick={() => void submit(true)} loading={busy}>
              Lưu và thêm tiếp
            </Button>
          )}
          <Button variant="primary" onClick={() => void submit(false)} loading={busy}>
            Lưu
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(canRepeat);
        }}
      >
        {mode === "child" && unions.length > 1 && (
          <Field label="Con của cuộc hôn nhân nào?">
            <Select value={unionId ?? ""} onChange={(e) => setUnionId(Number(e.target.value))}>
              {unions.map((uid) => {
                const u = graph.unions.get(uid)!;
                const sp = graph.partnerIn(uid, p!.id);
                return (
                  <option key={uid} value={uid}>
                    Với {sp != null ? graph.get(sp)!.name : "người không rõ tên"} ({UNION_KIND[u.kind]})
                  </option>
                );
              })}
            </Select>
          </Field>
        )}

        {mode === "spouse" && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
            {(["new", "existing"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx("min-h-10 rounded-md font-semibold", tab === t ? "bg-white shadow" : "text-stone-600")}
              >
                {t === "new" ? "Người mới" : "Chọn người có sẵn"}
              </button>
            ))}
          </div>
        )}

        {mode === "spouse" && tab === "existing" ? (
          <Field label="Chọn người đã có trên cây" hint="Dùng cho hôn nhân nội tộc xa hoặc khi lỡ nhập trùng">
            <PersonSearch
              graph={graph}
              autoFocus
              filter={(x) => x.gender !== p?.gender && x.id !== p?.id}
              onPick={(x) => setExisting(x.id)}
            />
            {existing != null && <p className="mt-1 font-semibold text-brand-800">Đã chọn: {graph.get(existing)?.name}</p>}
          </Field>
        ) : (
          <>
            <Field label={mode === "parents" ? "Họ tên cha" : "Họ tên *"}>
              <Input ref={nameRef} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn An" />
            </Field>
            {mode === "parents" ? (
              <Field label="Họ tên mẹ">
                <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="Có thể để trống" />
              </Field>
            ) : (
              <Field label="Giới tính *">
                <GenderPick value={gender} onChange={setGender} fixed={mode === "spouse"} />
              </Field>
            )}
            {mode !== "parents" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Năm sinh">
                  <Input value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Không bắt buộc" />
                </Field>
                {(mode === "child" || mode === "sibling") && (
                  <Field label="Thứ tự" hint={`Mặc định: ${nextOrder}`}>
                    <Input value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={String(nextOrder)} />
                  </Field>
                )}
              </div>
            )}
          </>
        )}

        {mode === "child" && (
          <Field label="Loại quan hệ">
            <Select value={linkKind} onChange={(e) => setLinkKind(e.target.value as LinkKind)}>
              {Object.entries(LINK_KIND).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
        )}
        {mode === "spouse" && p?.gender === "M" && (
          <Field label="Loại">
            <Select value={kind} onChange={(e) => setKind(e.target.value as UnionKind)}>
              {(["chinh_that", "ke_that", "thu_that"] as const).map((k) => (
                <option key={k} value={k}>{UNION_KIND[k]}</option>
              ))}
            </Select>
          </Field>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Dialog>
  );
}
