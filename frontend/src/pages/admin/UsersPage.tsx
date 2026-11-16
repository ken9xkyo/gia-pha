import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { get, patch, post } from "@/api/client";
import { useMe } from "@/api/hooks";
import type { AdminUser } from "@/api/types";
import { confirmDialog } from "@/components/confirm";
import { useErrorHandler } from "@/components/mutate";
import { Button, Card, Dialog, Field, Input, PageShell, Spinner } from "@/components/ui";
import { dateTime } from "@/lib/format";

export default function UsersPage() {
  const qc = useQueryClient();
  const onError = useErrorHandler();
  const me = useMe();
  const { data } = useQuery({ queryKey: ["users"], queryFn: () => get<AdminUser[]>("/api/admin/users") });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", password: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await refresh();
      toast.success(msg);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <PageShell title="Tài khoản admin" actions={<Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setCreating(true)}>Thêm admin</Button>}>
      <p className="mb-4 text-stone-600">Các admin ngang quyền nhau. Mỗi tài khoản bắt buộc xác thực 2 bước; khóa tạm sau 5 lần nhập sai; phiên đăng nhập hết hạn sau 7 ngày.</p>
      {!data ? (
        <Spinner />
      ) : (
        <div className="grid gap-3">
          {data.map((u) => (
            <Card key={u.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold">
                  {u.full_name} {u.id === me.data?.id && <span className="text-sm font-normal text-stone-500">(bạn)</span>}
                </p>
                <p className="text-[15px] text-stone-600">
                  {u.email} · {u.totp_enabled ? "Đã bật 2 bước" : "Chưa thiết lập 2 bước"} · {u.is_active ? (u.locked ? "Đang tạm khóa" : "Hoạt động") : "Đã vô hiệu"}
                  {u.last_login_at && ` · đăng nhập ${dateTime(u.last_login_at)}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await confirmDialog({ title: "Đặt lại xác thực 2 bước?", message: `${u.full_name} sẽ phải quét mã QR mới ở lần đăng nhập sau.` }))
                      await act(() => post(`/api/admin/users/${u.id}/reset-2fa`), "Đã đặt lại xác thực 2 bước");
                  }}
                >
                  Đặt lại 2 bước
                </Button>
                {u.id !== me.data?.id && (
                  <Button
                    size="sm"
                    variant={u.is_active ? "ghost" : "primary"}
                    className={u.is_active ? "text-red-700" : ""}
                    onClick={() => act(() => patch(`/api/admin/users/${u.id}`, { is_active: !u.is_active }), u.is_active ? "Đã vô hiệu hóa" : "Đã kích hoạt")}
                  >
                    {u.is_active ? "Vô hiệu hóa" : u.locked ? "Mở khóa" : "Kích hoạt"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Đổi mật khẩu của bạn</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mật khẩu hiện tại"><Input type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="Mật khẩu mới" hint="Tối thiểu 10 ký tự, gồm 3 trong 4 loại: thường, hoa, số, ký tự đặc biệt"><Input type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" disabled={!pw.current_password || pw.new_password.length < 10} onClick={() => act(() => post("/api/admin/me/password", pw), "Đã đổi mật khẩu").then(() => setPw({ current_password: "", new_password: "" }))}>
            Đổi mật khẩu
          </Button>
        </div>
      </Card>

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Thêm admin"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>Hủy</Button>
            <Button
              variant="primary"
              onClick={() =>
                act(() => post("/api/admin/users", form), "Đã tạo tài khoản").then(() => {
                  setCreating(false);
                  setForm({ email: "", full_name: "", password: "" });
                })
              }
            >
              Tạo tài khoản
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Họ tên"><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Mật khẩu tạm" hint="Gửi riêng cho người đó; họ sẽ thiết lập xác thực 2 bước khi đăng nhập lần đầu">
            <Input type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
        </div>
      </Dialog>
    </PageShell>
  );
}
