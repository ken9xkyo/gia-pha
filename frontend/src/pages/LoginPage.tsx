import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, post } from "@/api/client";
import { Button, Card, Field, Input } from "@/components/ui";

type Step =
  | { kind: "password" }
  | { kind: "totp"; challenge: string }
  | { kind: "setup"; challenge: string; secret: string; qr: string; uri: string };

/** Đăng nhập admin: email + mật khẩu, bắt buộc xác thực 2 bước TOTP (PRD mục 9). */
export default function LoginPage() {
  const [step, setStep] = useState<Step>({ kind: "password" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ step: string; challenge: string; secret?: string; qr_svg?: string; otpauth_uri?: string }>(
        "/api/auth/login",
        { email, password },
      );
      if (r.step === "totp_setup") setStep({ kind: "setup", challenge: r.challenge, secret: r.secret!, qr: r.qr_svg!, uri: r.otpauth_uri! });
      else setStep({ kind: "totp", challenge: r.challenge });
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind === "password") return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/totp", { challenge: step.challenge, code });
      await qc.invalidateQueries({ queryKey: ["me"] });
      navigate("/admin", { replace: true });
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message);
      if (ae.code === "challenge_expired" || ae.code === "locked") setStep({ kind: "password" });
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-paper p-4">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-12" />
          <div>
            <h1 className="text-2xl font-bold text-brand-800">Quản trị gia phả</h1>
            <p className="text-stone-600">Dành cho người được dòng họ giao giữ gia phả</p>
          </div>
        </div>

        {step.kind === "password" && (
          <form onSubmit={submitPassword} className="flex flex-col gap-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            </Field>
            <Field label="Mật khẩu">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="rounded-lg bg-red-50 p-3 font-medium text-red-800">{error}</p>}
            <Button variant="primary" size="lg" type="submit" loading={busy} icon={<KeyRound className="size-5" />}>
              Đăng nhập
            </Button>
          </form>
        )}

        {step.kind !== "password" && (
          <form onSubmit={submitCode} className="flex flex-col gap-4">
            {step.kind === "setup" ? (
              <>
                <div className="rounded-lg bg-amber-50 p-3 text-[15px] text-stone-800">
                  <p className="font-bold">Thiết lập xác thực 2 bước (bắt buộc)</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    <li>Cài ứng dụng Google Authenticator, Microsoft Authenticator hoặc tương tự.</li>
                    <li>Quét mã QR bên dưới (hoặc nhập khóa bí mật).</li>
                    <li>Nhập mã 6 số ứng dụng hiển thị.</li>
                  </ol>
                </div>
                <div className="mx-auto w-52 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: step.qr }} />
                <p className="break-all text-center font-mono text-sm text-stone-600">{step.secret.match(/.{1,4}/g)?.join(" ")}</p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-stone-700">
                <ShieldCheck className="size-5 text-brand-700" /> Nhập mã 6 số trong ứng dụng xác thực.
              </p>
            )}
            <Field label="Mã xác thực">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ""))}
                className="text-center font-mono text-2xl tracking-[0.4em]"
                autoFocus
                required
              />
            </Field>
            {error && <p className="rounded-lg bg-red-50 p-3 font-medium text-red-800">{error}</p>}
            <Button variant="primary" size="lg" type="submit" loading={busy} disabled={code.length !== 6}>
              Xác nhận
            </Button>
            <Button variant="ghost" type="button" onClick={() => setStep({ kind: "password" })}>
              Quay lại
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
