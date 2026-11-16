import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BarChart3,
  BookOpen,
  CalendarHeart,
  ChevronDown,
  DatabaseBackup,
  History,
  List,
  LogOut,
  Menu,
  Network,
  Phone,
  Settings,
  Trash2,
  UserCog,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ApiError, post } from "@/api/client";
import { adminSource, publicSource, SourceContext, type Source } from "@/api/context";
import { useConfig, useMe, useTree } from "@/api/hooks";
import { PersonSearch } from "@/components/PersonSearch";
import { Spinner } from "@/components/ui";
import { useKinship } from "@/components/useKinship";
import { MeChip } from "@/components/WhoAmI";
import { NotFound } from "@/pages/Landing";
import { useParams } from "react-router";

const ADMIN_LINKS = [
  { to: "/admin/thung-rac", label: "Thùng rác", icon: Trash2 },
  { to: "/admin/nhat-ky", label: "Nhật ký thay đổi", icon: History },
  { to: "/admin/cai-dat", label: "Cấu hình dòng họ", icon: Settings },
  { to: "/admin/xung-ho", label: "Quy tắc xưng hô", icon: Network },
  { to: "/admin/tai-khoan", label: "Tài khoản admin", icon: UserCog },
  { to: "/admin/sao-luu", label: "Sao lưu", icon: DatabaseBackup },
  { to: "/admin/thong-ke", label: "Thống kê", icon: BarChart3 },
];

function TopBar({ admin, base }: { admin: boolean; base: string }) {
  const { graph, rules } = useTree();
  const config = useConfig();
  const kin = useKinship(graph, rules);
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  useEffect(() => {
    setMobileOpen(false);
    setAdminOpen(false);
  }, [location.pathname]);

  const clan = config.data?.clan_name ?? graph?.clan ?? "Gia phả";
  const nav = [
    { to: base, label: "Cây gia phả", icon: Network, end: true },
    { to: `${base}/danh-sach`, label: "Danh sách", icon: List },
    { to: `${base}/ngay-gio`, label: "Ngày giỗ", icon: CalendarHeart },
    { to: `${base}/pha-ky`, label: "Phả ký", icon: BookOpen },
  ];
  const goPerson = (id: number) => navigate(`${base}/p/${id}`);
  const logout = async () => {
    await post("/api/auth/logout").catch(() => {});
    qc.clear();
    navigate("/admin/login");
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    clsx(
      "flex min-h-10 items-center gap-2 whitespace-nowrap rounded-lg px-3 font-semibold transition-colors",
      isActive ? "bg-brand-800 text-white" : "text-stone-700 hover:bg-stone-200/70",
    );

  return (
    <header className="relative z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-14 items-center gap-2 px-2 sm:px-4">
        <NavLink to={base} end className="flex min-w-0 items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-9 shrink-0" />
          <span className="truncate text-lg font-bold text-brand-800">{clan}</span>
        </NavLink>
        {admin && <span className="hidden whitespace-nowrap rounded bg-gold-400 px-2 py-0.5 text-sm font-bold 2xl:inline">Quản trị</span>}
        <nav className={clsx("ml-2 hidden items-center gap-1", admin ? "xl:flex" : "lg:flex")}>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
              <n.icon className="size-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex-1" />
        <PersonSearch graph={graph} onPick={(p) => goPerson(p.id)} className="hidden w-56 md:block 2xl:w-72" compact placeholder="Tìm người trong cây…" />
        <div className="hidden sm:block">
          <MeChip graph={graph} meLabel={kin.meLabel} onFocusMe={() => kin.meId != null && goPerson(kin.meId)} />
        </div>
        {admin && (
          <div className="relative hidden xl:block">
            <button className="flex min-h-10 items-center gap-1 rounded-lg px-3 font-semibold text-stone-700 hover:bg-stone-200/70" onClick={() => setAdminOpen((v) => !v)}>
              <Settings className="size-4" /> Quản trị <ChevronDown className="size-4" />
            </button>
            {adminOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-xl">
                {ADMIN_LINKS.map((l) => (
                  <NavLink key={l.to} to={l.to} className={linkCls}>
                    <l.icon className="size-4" /> {l.label}
                  </NavLink>
                ))}
                <button onClick={logout} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 font-semibold text-red-700 hover:bg-red-50">
                  <LogOut className="size-4" /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        )}
        <button className={clsx("inline-flex size-11 items-center justify-center rounded-lg hover:bg-stone-200/70", admin ? "xl:hidden" : "lg:hidden")} onClick={() => setMobileOpen((v) => !v)} aria-label="Menu">
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {mobileOpen && (
        <div className={clsx("absolute inset-x-0 top-full max-h-[80vh] overflow-y-auto border-b border-stone-200 bg-white p-3 shadow-xl", admin ? "xl:hidden" : "lg:hidden")}>
          <PersonSearch graph={graph} onPick={(p) => goPerson(p.id)} className="mb-3 md:hidden" placeholder="Tìm người trong cây…" />
          <div className="mb-3 sm:hidden">
            <MeChip graph={graph} meLabel={kin.meLabel} onFocusMe={() => kin.meId != null && goPerson(kin.meId)} />
          </div>
          <nav className="grid gap-1">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
                <n.icon className="size-5" /> {n.label}
              </NavLink>
            ))}
            {admin && (
              <>
                <div className="my-2 border-t border-stone-200" />
                {ADMIN_LINKS.map((l) => (
                  <NavLink key={l.to} to={l.to} className={linkCls}>
                    <l.icon className="size-5" /> {l.label}
                  </NavLink>
                ))}
                <button onClick={logout} className="flex min-h-10 items-center gap-2 rounded-lg px-3 font-semibold text-red-700">
                  <LogOut className="size-5" /> Đăng xuất
                </button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}

function Footer() {
  const { data } = useConfig();
  if (!data || (!data.contact_phone && !data.contact_zalo)) return null;
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-stone-200 bg-white px-3 py-1.5 text-[15px] text-stone-700">
      <span>Báo sai sót cho {data.contact_name || "người giữ gia phả"}:</span>
      {data.contact_phone && (
        <a href={`tel:${data.contact_phone}`} className="inline-flex items-center gap-1 font-semibold text-brand-700">
          <Phone className="size-4" /> {data.contact_phone}
        </a>
      )}
      {data.contact_zalo && (
        <a href={`https://zalo.me/${data.contact_zalo.replace(/\D/g, "")}`} target="_blank" rel="noreferrer noopener" className="font-semibold text-brand-700">
          Zalo {data.contact_zalo}
        </a>
      )}
    </footer>
  );
}

/** Đếm lượt xem ẩn danh: chỉ biết có chọn "Tôi là ai" hay không, không biết chọn ai (PRD mục 10).
 *  Gửi một lần mỗi phiên, với trạng thái cuối cùng: khi rời trang hoặc sau 60 giây. */
function VisitBeacon({ src }: { src: Source }) {
  const { graph, rules } = useTree();
  const kin = useKinship(graph, rules);
  const withMe = useRef(false);
  withMe.current = !!kin.ego;
  const ready = !!graph;
  useEffect(() => {
    if (!ready || src.mode !== "public") return;
    const key = `gp-visit-${src.token}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      /* chế độ riêng tư: vẫn đếm */
    }
    let sent = false;
    const send = () => {
      if (sent) return;
      sent = true;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* bỏ qua */
      }
      void fetch(`${src.api}/visit`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ with_me: withMe.current }),
      }).catch(() => {});
    };
    const onHide = () => document.visibilityState === "hidden" && send();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    const t = setTimeout(send, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
      clearTimeout(t);
    };
  }, [ready, src.mode, src.token, src.api]);
  return null;
}

function Frame({ src }: { src: Source }) {
  return (
    <SourceContext.Provider value={src}>
      <div className="flex h-full flex-col">
        <TopBar admin={src.mode === "admin"} base={src.base} />
        <main className="relative min-h-0 flex-1">
          <Outlet />
        </main>
        <Footer />
        <VisitBeacon src={src} />
      </div>
    </SourceContext.Provider>
  );
}

export function PublicShell() {
  const { token } = useParams();
  const src = publicSource(token ?? "");
  return (
    <SourceContext.Provider value={src}>
      <PublicGate src={src} />
    </SourceContext.Provider>
  );
}

function PublicGate({ src }: { src: Source }) {
  const config = useConfig();
  if (config.isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-10 text-brand-800" />
      </div>
    );
  if (config.error) return <NotFound />;
  return <Frame src={src} />;
}

export function AdminShell() {
  const me = useMe();
  if (me.isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-10 text-brand-800" />
      </div>
    );
  if (me.error && (me.error as ApiError).status === 401) return <Navigate to="/admin/login" replace />;
  return <Frame src={adminSource} />;
}
