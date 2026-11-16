import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { get, put } from "@/api/client";
import type { AdminSettings, RuleEntry, RuleOverrides } from "@/api/types";
import { useErrorHandler } from "@/components/mutate";
import { Button, Card, PageShell, Spinner } from "@/components/ui";
import { DEFAULT_RULES, RULE_GROUPS } from "@/lib/kinshipRules";

const COLS: { key: keyof RuleEntry; label: string }[] = [
  { key: "m", label: "Gọi (nam)" },
  { key: "f", label: "Gọi (nữ)" },
  { key: "sm", label: "Vợ của người này" },
  { key: "sf", label: "Chồng của người này" },
];

/** Bảng quy tắc xưng hô là dữ liệu cấu hình — admin sửa theo tập quán riêng (FR-57). */
export default function KinshipPage() {
  const qc = useQueryClient();
  const onError = useErrorHandler();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get<AdminSettings>("/api/admin/settings") });
  const [overrides, setOverrides] = useState<RuleOverrides>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setOverrides(data.kinship_overrides ?? {});
  }, [data]);
  if (!data) return <Spinner />;

  const value = (key: string, col: keyof RuleEntry) => overrides[key]?.[col] ?? DEFAULT_RULES[key]?.[col] ?? "";
  const setValue = (key: string, col: keyof RuleEntry, v: string) => {
    setOverrides((o) => {
      const entry = { ...(o[key] ?? {}) };
      if (v === (DEFAULT_RULES[key]?.[col] ?? "")) delete entry[col];
      else entry[col] = v;
      const next = { ...o, [key]: entry };
      if (!Object.keys(entry).length) delete next[key];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await put("/api/admin/kinship-rules", { version: data.version, overrides });
      await Promise.all([qc.invalidateQueries({ queryKey: ["settings"] }), qc.invalidateQueries({ queryKey: ["tree"] })]);
      toast.success("Đã lưu quy tắc xưng hô");
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  const changed = Object.keys(overrides).length;

  return (
    <PageShell
      title="Quy tắc xưng hô (miền Bắc)"
      actions={
        <>
          <Button icon={<RotateCcw className="size-4" />} onClick={() => setOverrides({})} disabled={!changed}>
            Khôi phục mặc định
          </Button>
          <Button variant="primary" loading={saving} onClick={save}>Lưu</Button>
        </>
      }
    >
      <p className="mb-4 text-stone-600">
        Tập quán trong miền Bắc khác nhau giữa các gia đình (VD: anh trai mẹ gọi “bác” hay “cậu”, chồng của dì gọi “chú” hay “dượng”).
        Sửa nhãn bên dưới để áp dụng cho cả dòng họ. Ô có nền vàng là đã khác mặc định. {changed > 0 && <strong>{changed} quy tắc đã sửa.</strong>}
      </p>
      <div className="grid gap-5">
        {RULE_GROUPS.map((g) => (
          <Card key={g.title} className="overflow-x-auto p-0">
            <h2 className="border-b border-stone-200 px-4 py-3 text-lg font-bold text-brand-800">{g.title}</h2>
            <table className="w-full min-w-[640px] text-[15px]">
              <thead>
                <tr className="bg-stone-50 text-left text-stone-600">
                  <th className="px-4 py-2 font-semibold">Quan hệ</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-2 py-2 font-semibold">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {g.keys.map(({ key, desc }) => (
                  <tr key={key} className="border-t border-stone-100">
                    <td className="px-4 py-2 text-stone-800">{desc}</td>
                    {COLS.map((c) => {
                      const isChanged = overrides[key]?.[c.key] != null;
                      const hasDefault = DEFAULT_RULES[key]?.[c.key] != null;
                      return (
                        <td key={c.key} className="px-2 py-1.5">
                          {hasDefault || c.key === "m" || c.key === "f" ? (
                            <input
                              value={value(key, c.key)}
                              onChange={(e) => setValue(key, c.key, e.target.value)}
                              className={`min-h-10 w-full rounded-md border px-2 ${isChanged ? "border-gold-500 bg-amber-50" : "border-stone-300"}`}
                              aria-label={`${desc} — ${c.label}`}
                            />
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
