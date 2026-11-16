import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { get, patch, post } from "@/api/client";
import type { AdminSettings } from "@/api/types";
import { confirmDialog } from "@/components/confirm";
import { useErrorHandler } from "@/components/mutate";
import { Button, Card, Field, Input, PageShell, Spinner } from "@/components/ui";

export default function SettingsPage() {
  const qc = useQueryClient();
  const onError = useErrorHandler();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => get<AdminSettings>("/api/admin/settings") });
  const [draft, setDraft] = useState<Partial<AdminSettings>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  if (!data) return <Spinner />;

  const link = `${location.origin}/t/${data.public_token}`;
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ["settings"] }), qc.invalidateQueries({ queryKey: ["config"] }), qc.invalidateQueries({ queryKey: ["tree"] })]);

  const save = async () => {
    setSaving(true);
    try {
      await patch("/api/admin/settings", {
        version: data.version,
        clan_name: draft.clan_name,
        tagline: draft.tagline ?? "",
        contact_name: draft.contact_name ?? "",
        contact_phone: draft.contact_phone ?? "",
        contact_zalo: draft.contact_zalo ?? "",
      });
      await reload();
      toast.success("Đã lưu cấu hình");
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  const rotate = async () => {
    const ok = await confirmDialog({
      title: "Đổi đường link công khai?",
      message: "Link cũ sẽ ngừng hoạt động ngay. Bạn cần gửi link mới cho mọi người trong dòng họ.",
      confirmText: "Đổi link",
      danger: true,
    });
    if (!ok) return;
    try {
      await post("/api/admin/settings/rotate-token");
      await reload();
      toast.success("Đã đổi link công khai");
    } catch (e) {
      onError(e);
    }
  };

  const text = (k: keyof AdminSettings) => ({
    value: (draft[k] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value })),
  });

  return (
    <PageShell title="Cấu hình dòng họ">
      <div className="grid gap-5">
        <Card>
          <h2 className="mb-2 text-lg font-bold">Đường link công khai</h2>
          <p className="mb-3 text-[15px] text-stone-600">
            Ai có link này đều xem được cây (không cần đăng nhập). Link có chuỗi ngẫu nhiên và không được công cụ tìm kiếm lập chỉ mục.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input readOnly value={link} className="flex-1 font-mono text-[15px]" onFocus={(e) => e.target.select()} />
            <Button icon={<Copy className="size-4" />} onClick={() => { void navigator.clipboard?.writeText(link); toast.success("Đã sao chép"); }}>
              Sao chép
            </Button>
            <Button variant="danger" icon={<RefreshCw className="size-4" />} onClick={rotate}>
              Đổi link (khi bị lộ)
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-bold">Thông tin chung</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tên dòng họ"><Input {...text("clan_name")} /></Field>
            <Field label="Dòng giới thiệu ngắn"><Input {...text("tagline")} /></Field>
          </div>
          <h3 className="mb-2 mt-5 font-bold">Liên hệ báo sai sót (hiện ở chân trang)</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Người liên hệ"><Input {...text("contact_name")} placeholder="VD: Ông Nguyễn Văn A" /></Field>
            <Field label="Số điện thoại"><Input {...text("contact_phone")} inputMode="tel" /></Field>
            <Field label="Zalo"><Input {...text("contact_zalo")} placeholder="Số Zalo" /></Field>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={saving} onClick={save}>Lưu cấu hình</Button>
          </div>
        </Card>
        <Card className="text-[15px] text-stone-700">
          <h2 className="mb-2 text-lg font-bold text-stone-900">Quyền riêng tư</h2>
          <p>
            Theo Luật Bảo vệ dữ liệu cá nhân (hiệu lực 1/1/2026), người còn sống có quyền yêu cầu ẩn hoặc xóa thông tin của mình. Khi nhận yêu cầu:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Mở hồ sơ người đó → Sửa → mục “Quyền riêng tư” để ẩn từng trường; hoặc</li>
            <li>Xóa người đó, rồi vào Thùng rác chọn “Xóa vĩnh viễn” để xóa luôn ảnh và dữ liệu trong nhật ký.</li>
          </ol>
        </Card>
      </div>
    </PageShell>
  );
}
