import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Pencil } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";
import { get, put } from "@/api/client";
import { useSource } from "@/api/context";
import { useErrorHandler } from "@/components/mutate";
import { Button, Card, Empty, PageShell, Spinner } from "@/components/ui";

const RichEditor = lazy(() => import("@/components/RichEditor").then((m) => ({ default: m.RichEditor })));

/** Phả ký: tổ quán, thủy tổ, lịch sử dòng họ, tộc ước (FR-43). */
export default function PhaKyPage() {
  const src = useSource();
  const admin = src.mode === "admin";
  const qc = useQueryClient();
  const onError = useErrorHandler();
  const { data, isLoading } = useQuery({
    queryKey: ["pha-ky", src.mode],
    queryFn: () => get<{ html: string; version?: number; clan_name: string }>(`${src.api}/pha-ky`),
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await put("/api/admin/pha-ky", { html: draft, version: data.version });
      await qc.invalidateQueries({ queryKey: ["pha-ky"] });
      await qc.invalidateQueries({ queryKey: ["config"] });
      toast.success("Đã lưu Phả ký");
      setEditing(false);
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell
      title={`Phả ký${data?.clan_name ? ` — ${data.clan_name}` : ""}`}
      actions={
        admin &&
        (editing ? (
          <>
            <Button onClick={() => setEditing(false)}>Hủy</Button>
            <Button variant="primary" loading={saving} onClick={save}>
              Lưu
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            icon={<Pencil className="size-4" />}
            onClick={() => {
              setDraft(data?.html ?? "");
              setEditing(true);
            }}
          >
            Sửa Phả ký
          </Button>
        ))
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : editing ? (
        <Suspense fallback={<Spinner />}>
          <RichEditor value={draft} onChange={setDraft} minHeight="28rem" placeholder="Tổ quán, thủy tổ, quá trình hình thành dòng họ, tộc ước…" />
        </Suspense>
      ) : data?.html ? (
        <Card className="p-6 sm:p-10">
          <article className="prose-vi mx-auto max-w-3xl text-stone-800" dangerouslySetInnerHTML={{ __html: data.html }} />
        </Card>
      ) : (
        <Empty icon={<BookOpen className="size-10 text-stone-400" />} title="Chưa có Phả ký">
          {admin && <p>Bấm “Sửa Phả ký” để viết về tổ quán, thủy tổ và lịch sử dòng họ.</p>}
        </Empty>
      )}
    </PageShell>
  );
}
