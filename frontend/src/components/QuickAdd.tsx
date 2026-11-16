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

type PickMode = "new" | "existing";

function ModeTabs({ value, onChange }: { value: PickMode; onChange: (v: PickMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
      {(["new", "existing"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={clsx("min-h-10 rounded-md font-semibold", value === t ? "bg-white shadow" : "text-stone-600")}
        >
          {t === "new" ? "Người mới" : "Chọn người có sẵn"}
        </button>
      ))}
    </div>
  );
}

/** Chọn một người có sẵn trên cây (lọc theo giới tính, bỏ chính người đó và vợ/chồng). */
function ExistingPick({
  graph,
  gender,
  exclude,
  value,
  onChange,
  autoFocus,
}: {
  graph: FamilyGraph;
  gender: Gender;
  exclude: Set<number>;
  value: number | null;
  onChange: (id: number | null) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <PersonSearch
        graph={graph}
        autoFocus={autoFocus}
        filter={(x) => x.gender === gender && !exclude.has(x.id)}
        onPick={(x) => onChange(x.id)}
        placeholder={gender === "M" ? "Tìm người cha đã có…" : "Tìm người mẹ đã có…"}
      />
      {value != null && (
        <p className="mt-1 font-semibold text-brand-800">
          Đã chọn: {graph.get(value)?.name} <span className="font-normal text-stone-500">{graph.hint(value)}</span>
        </p>
      )}
    </>
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
  const [fatherMode, setFatherMode] = useState<PickMode>("new");
  const [fatherId, setFatherId] = useState<number | null>(null);
  /** "new" | "existing" | "u<id>" (con của cuộc hôn nhân có sẵn của người cha đã chọn) */
  const [motherChoice, setMotherChoice] = useState<string>("new");
  const [motherId, setMotherId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const isRoot = personId != null && graph.rootId === personId;
  const exclude = useMemo(() => new Set(p ? [p.id, ...graph.spouses(p.id)] : []), [graph, p]);
  const fatherUnions = fatherMode === "existing" && fatherId != null ? graph.get(fatherId)?.unions ?? [] : [];
  useEffect(() => setMotherChoice(fatherUnions.length ? `u${fatherUnions[0]}` : "new"), [fatherId, fatherMode]); // eslint-disable-line react-hooks/exhaustive-deps

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
    parents: isRoot ? `Thêm cha mẹ cho thủy tổ ${p?.name}` : `Thêm cha mẹ cho ${p?.name}`,
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
      const body: Record<string, unknown> = { link_kind: linkKind };
      if (motherChoice.startsWith("u")) body.union_id = Number(motherChoice.slice(1));
      else {
        if (fatherMode === "existing" && fatherId != null) body.father_id = fatherId;
        else if (fatherMode === "new" && name.trim() && name.trim() !== defaultSurname.trim()) body.father = { full_name: name.trim(), gender: "M" };
        if (motherChoice === "existing" && motherId != null) body.mother_id = motherId;
        else if (motherChoice === "new" && motherName.trim()) body.mother = { full_name: motherName.trim(), gender: "F" };
      }
      if (!["union_id", "father", "father_id", "mother", "mother_id"].some((k) => k in body)) {
        setBusy(false);
        if (fatherMode === "new") nameRef.current?.focus();
        return;
      }
      r = await run("Đã thêm cha mẹ", (confirm) =>
        post<MutationResult>(`${base}/${personId}/parents`, { ...body, confirm_warnings: confirm }),
      );
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

        {mode === "parents" ? (
          <>
            <Field label="Cha">
              {!isRoot && <ModeTabs value={fatherMode} onChange={setFatherMode} />}
              {fatherMode === "new" || isRoot ? (
                <Input ref={nameRef} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Họ tên cha — có thể để trống" className={clsx(!isRoot && "mt-2")} />
              ) : (
                <div className="mt-2">
                  <ExistingPick graph={graph} gender="M" exclude={exclude} value={fatherId} onChange={setFatherId} autoFocus />
                </div>
              )}
            </Field>
            <Field label="Mẹ" hint={fatherUnions.length ? "Chọn vợ của người cha đã chọn, hoặc người khác" : undefined}>
              {fatherUnions.length > 0 && (
                <Select value={motherChoice} onChange={(e) => setMotherChoice(e.target.value)}>
                  {fatherUnions.map((uid) => {
                    const sp = graph.partnerIn(uid, fatherId!);
                    return (
                      <option key={uid} value={`u${uid}`}>
                        {sp != null ? graph.get(sp)!.name : "Không rõ tên"} ({UNION_KIND[graph.unions.get(uid)!.kind]})
                      </option>
                    );
                  })}
                  <option value="new">Người khác — nhập mới</option>
                  <option value="existing">Người khác — chọn người có sẵn</option>
                </Select>
              )}
              {!fatherUnions.length && !isRoot && (
                <ModeTabs value={motherChoice === "existing" ? "existing" : "new"} onChange={(v) => setMotherChoice(v)} />
              )}
              {(motherChoice === "new" || isRoot) && (
                <Input value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="Họ tên mẹ — có thể để trống" className={clsx(!isRoot && "mt-2")} />
              )}
              {motherChoice === "existing" && !isRoot && (
                <div className="mt-2">
                  <ExistingPick graph={graph} gender="F" exclude={exclude} value={motherId} onChange={setMotherId} />
                </div>
              )}
            </Field>
            {!isRoot && (
              <p className="text-sm text-stone-600">
                Chọn người có sẵn khi cha/mẹ đã có trên cây — VD: hai anh em trong họ lấy hai chị em ruột, hoặc bố mẹ của dâu/rể vốn là người trong họ.
              </p>
            )}
          </>
        ) : mode === "spouse" && tab === "existing" ? (
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
            <Field label="Họ tên *">
              <Input ref={nameRef} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn An" />
            </Field>
            <Field label="Giới tính *">
              <GenderPick value={gender} onChange={setGender} fixed={mode === "spouse"} />
            </Field>
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
          </>
        )}

        {(mode === "child" || (mode === "parents" && !isRoot)) && (
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
