import clsx from "clsx";
import {
  Download,
  FileImage,
  FileSpreadsheet,
  Filter,
  GitCompare,
  Info,
  Maximize,
  Minus,
  Plus,
  Printer,
  Route,
  Share2,
  Tags,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { patch } from "@/api/client";
import { useSource } from "@/api/context";
import { useTree } from "@/api/hooks";
import { CompareDialog } from "@/components/CompareDialog";
import { useMutate } from "@/components/mutate";
import { NodeMenu, type NodeAction } from "@/components/NodeMenu";
import { PersonDrawer } from "@/components/PersonDrawer";
import type { AddMode } from "@/components/QuickAdd";
import { Button, Empty, IconButton, Spinner, Toggle } from "@/components/ui";
import { useKinship } from "@/components/useKinship";
import { WhoAmIBanner } from "@/components/WhoAmI";
import { computeLayout, NODE_W, type LNode } from "@/lib/layout";
import { computeNetworkLayout } from "@/lib/network";
import { capitalize } from "@/lib/text";
import { useUI } from "@/store/ui";
import { buildSVG, downloadPNG, downloadSVG, printTree } from "@/tree/exportTree";
import { Minimap } from "@/tree/Minimap";
import type { Badge } from "@/tree/renderer";
import { TreeCanvas, type ScreenRect, type TreeCanvasHandle } from "@/tree/TreeCanvas";

// Các thành phần chỉ admin dùng: tải khi cần để người xem tải trang nhanh hơn
const PersonForm = lazy(() => import("@/components/PersonForm").then((m) => ({ default: m.PersonForm })));
const QuickAdd = lazy(() => import("@/components/QuickAdd").then((m) => ({ default: m.QuickAdd })));
const DeleteDialog = lazy(() => import("@/components/DeleteDialog").then((m) => ({ default: m.DeleteDialog })));
const ReorderDialog = lazy(() => import("@/components/ReorderDialog").then((m) => ({ default: m.ReorderDialog })));

type Panel = { kind: "view" | "edit"; id: number } | null;
type Modal =
  | { kind: "add"; mode: AddMode; id: number | null }
  | { kind: "delete"; id: number }
  | { kind: "reorder"; id: number }
  | { kind: "compare"; id: number | null }
  | null;

const RADIUS = [
  { v: 1, label: "Gia đình gần (cha mẹ, anh chị em, vợ chồng, con)" },
  { v: 2, label: "Mở rộng (ông bà, cô chú, cháu, nhà vợ/chồng)" },
  { v: 3, label: "Rộng" },
  { v: 4, label: "Rất rộng" },
];

function Legend({ network }: { network?: boolean }) {
  const Sw = ({ cls, label }: { cls: string; label: string }) => (
    <li className="flex items-center gap-2">
      <span className={clsx("inline-block h-5 w-8 rounded-md border-2", cls)} />
      {label}
    </li>
  );
  return (
    <ul className="space-y-1.5 text-[15px] text-stone-700">
      <Sw cls="border-blue-700 bg-blue-100" label="Nam trong dòng họ" />
      <Sw cls="border-pink-700 bg-pink-100" label="Nữ trong dòng họ" />
      <Sw cls="border-blue-300 bg-white" label="Dâu / rể (nền nhạt)" />
      <Sw cls="border-dashed border-blue-700 bg-blue-100" label="Dòng ngoại (viền nét đứt)" />
      {network && <Sw cls="border-dotted border-blue-300 bg-white" label="Nhà thông gia (viền chấm)" />}
      <li className="flex items-center gap-2">
        <span className="relative inline-block h-5 w-8 overflow-hidden rounded-md border-2 border-stone-400 bg-white">
          <span className="absolute -right-2 -top-2 size-4 rotate-45 bg-stone-700" />
        </span>
        Đã mất (góc băng tang)
      </li>
      <li className="flex items-center gap-2">
        <span className="rounded-full bg-brand-800 px-2 text-sm font-bold text-white">Bác</span>
        Cách bạn gọi người đó
      </li>
    </ul>
  );
}

/**
 * Trang cây gia phả. Với `network`, cùng trang này hiển thị mạng lưới quan hệ lấy một người làm tâm
 * (gồm cả nhà thông gia) — dùng chung menu, hồ sơ, thêm/sửa/xóa với cây dòng họ.
 */
export default function TreePage({ network = false }: { network?: boolean }) {
  const src = useSource();
  const admin = src.mode === "admin";
  const navigate = useNavigate();
  const params = useParams();
  const parsedId = Number(params.personId);
  const routeId = params.personId && Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;

  const { graph, rules, isLoading, error } = useTree();
  const ui = useUI();
  const kin = useKinship(graph, rules);
  const run = useMutate();

  const canvasRef = useRef<TreeCanvasHandle>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ id: number; rect: ScreenRect } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [rename, setRename] = useState<{ id: number; rect: ScreenRect; value: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [size, setSize] = useState({ w: 1024, h: 768 });
  const pendingFocus = useRef<number | null>(null);
  const didInitialFit = useRef(false);
  const lastCenter = useRef<number | null>(null);

  const collapsed = useMemo(() => new Set(ui.collapsed), [ui.collapsed]);
  // Tâm của mạng lưới: người trên đường dẫn, rồi "tôi", rồi thủy tổ
  const center = network && graph ? ([routeId, kin.meId, graph.rootId].find((id) => id != null && graph.get(id)) ?? null) : null;
  const layout = useMemo(() => {
    if (!graph) return null;
    if (network) {
      if (center == null) return null;
      return computeNetworkLayout(graph, center, { radius: ui.netRadius, include: ui.highlight ?? undefined });
    }
    return computeLayout(graph, { collapsed, hideNgoai: ui.hideNgoai, branch: ui.branch });
  }, [graph, network, center, ui.netRadius, ui.highlight, collapsed, ui.hideNgoai, ui.branch]);

  // Huy hiệu cách gọi trên mọi nút (FR-51), hoặc "người này gọi tôi là gì" (FR-53)
  const badges = useMemo(() => {
    if (!ui.showBadges || !kin.relations) return null;
    const m = new Map<number, Badge>();
    for (const [id, r] of kin.relations) {
      if (r.key === "self" || r.key === "unknown") continue;
      const text = ui.reverse ? capitalize(r.xung) : r.label;
      if (text) m.set(id, { text, uncertain: r.uncertain });
    }
    return m;
  }, [kin.relations, ui.showBadges, ui.reverse]);

  const selectedId = panel?.id ?? menu?.id ?? (network ? center : routeId);
  const selectedRelation = selectedId != null ? kin.relations?.get(selectedId) ?? null : null;
  const lineToRoot = useMemo(
    () => (graph && kin.meId != null && !network ? new Set(graph.lineToRoot(kin.meId)) : null),
    [graph, kin.meId, network],
  );
  const path = useMemo(() => {
    if (ui.highlight) return new Set(ui.highlight);
    if (selectedRelation && selectedRelation.path.length > 1) return new Set(selectedRelation.path);
    return null;
  }, [ui.highlight, selectedRelation]);

  const renderState = {
    layout,
    graph,
    badges,
    meId: kin.meId,
    selectedId,
    path,
    lineToRoot,
  };

  // ---- định vị --------------------------------------------------------
  const focus = useCallback((id: number, flash = true) => canvasRef.current?.focus(id, flash) ?? false, []);
  const netPath = (id: number) => `${src.base}/mang-luoi/${id}`;
  const ensureVisible = useCallback(
    (id: number) => {
      if (!graph) return;
      if (network) {
        if (!layout?.byPerson.has(id)) navigate(`${src.base}/mang-luoi/${id}`);
        pendingFocus.current = id;
        return;
      }
      // Nhà thông gia không có chỗ trên cây dòng họ → xem ở mạng lưới
      if (graph.get(id)?.kind === "extended") {
        navigate(`${src.base}/mang-luoi/${id}`);
        return;
      }
      // mở các nhánh đang thu gọn che người này
      const ancestors = graph.lineToRoot(id).slice(1);
      const blocking = ancestors.filter((a) => collapsed.has(a));
      if (blocking.length) ui.set({ collapsed: ui.collapsed.filter((x) => !blocking.includes(x)) });
      if (ui.branch && graph.get(id)?.branch !== ui.branch) ui.set({ branch: null });
      if (ui.hideNgoai && graph.get(id)?.ngoai) ui.set({ hideNgoai: false });
      pendingFocus.current = id;
    },
    [graph, collapsed, ui, network, layout, navigate, src.base],
  );

  useEffect(() => {
    if (!layout) return;
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const r = canvasRef.current?.renderer;
      if (!r || !r.width) {
        if (tries++ < 60) frame = requestAnimationFrame(apply);
        return;
      }
      r.setState({ layout });
      if (pendingFocus.current != null && layout.byPerson.has(pendingFocus.current)) {
        r.focus(pendingFocus.current, { flash: true });
        pendingFocus.current = null;
        if (network) lastCenter.current = center;
      } else if (network) {
        if (center != null && lastCenter.current !== center) {
          r.focus(center, { animate: didInitialFit.current, flash: didInitialFit.current });
          lastCenter.current = center;
          didInitialFit.current = true;
        }
      } else if (!didInitialFit.current) {
        didInitialFit.current = true;
        if (routeId != null && layout.byPerson.has(routeId)) {
          r.focus(routeId, { animate: false, flash: true });
          setPanel({ kind: "view", id: routeId });
        } else if (kin.meId != null && layout.byPerson.has(kin.meId)) r.focus(kin.meId, { animate: false });
        else if (r.fitTransform().k < 0.35 && graph?.rootId != null && layout.byPerson.has(graph.rootId)) {
          // Cây quá rộng so với màn hình (nhất là điện thoại): mở ở thủy tổ với cỡ chữ đọc được
          r.focus(graph.rootId, { animate: false, zoom: 0.75 });
        } else r.fit(false);
      }
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [layout]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!container) return;
    const update = () => setSize({ w: container.clientWidth, h: container.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);

  // Link riêng của một người thuộc nhà thông gia → mở ở mạng lưới
  useEffect(() => {
    if (!network && routeId != null && graph?.get(routeId)?.kind === "extended") navigate(netPath(routeId), { replace: true });
  }, [routeId, graph, network]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mở link riêng của một thành viên (FR-11)
  useEffect(() => {
    if (network || routeId == null || !graph || !graph.get(routeId) || !didInitialFit.current) return;
    if (panel?.id !== routeId) {
      setMenu(null);
      ensureVisible(routeId);
      setPanel({ kind: "view", id: routeId });
      if (!focus(routeId)) pendingFocus.current = routeId;
    }
  }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPerson = (id: number, kind: "view" | "edit" = "view") => {
    setMenu(null);
    setPanel({ kind, id });
    if (!network) navigate(`${src.base}/p/${id}`, { replace: true });
  };
  const closePanel = () => {
    setPanel(null);
    if (routeId != null && !network) navigate(src.base, { replace: true });
  };
  const goTo = (id: number) => {
    if (network) {
      // Trong mạng lưới: bấm vào người thân trong hồ sơ là chuyển tâm sang người đó
      setMenu(null);
      setPanel({ kind: "view", id });
      if (id !== center) navigate(netPath(id));
      return;
    }
    if (graph?.get(id)?.kind === "extended") {
      navigate(netPath(id));
      return;
    }
    ensureVisible(id);
    openPerson(id);
    setTimeout(() => focus(id), 60);
  };
  const highlightPath = (path: number[]) => {
    ui.set({ highlight: path });
    const onTree = !network && path.every((id) => layout?.byPerson.has(id));
    if (onTree || (network && path[0] === center)) {
      setTimeout(() => focus(path[path.length - 1], false), 50);
      return;
    }
    // Đường nối đi qua nhà thông gia (không có trên cây) → xem ở mạng lưới, lấy người A làm tâm
    pendingFocus.current = path[path.length - 1];
    navigate(netPath(path[0]));
  };

  const onAction = (a: NodeAction) => {
    if (!menu || !graph) return;
    const id = menu.id;
    const p = graph.get(id)!;
    switch (a) {
      case "view":
        return openPerson(id);
      case "edit":
        return openPerson(id, "edit");
      case "me":
        ui.setMe({ id });
        setMenu(null);
        toast.success(`Bạn đã chọn: ${p.name}`);
        return;
      case "compare":
        setMenu(null);
        return setModal({ kind: "compare", id });
      case "toggle":
        ui.toggleCollapsed(id);
        return setMenu(null);
      case "copy":
        void navigator.clipboard?.writeText(`${location.origin}${src.base}/p/${id}`);
        return setMenu(null);
      case "network":
        setMenu(null);
        return navigate(netPath(id));
      case "addChild":
      case "addSpouse":
      case "addSibling":
      case "addParents":
        setMenu(null);
        return setModal({
          kind: "add",
          mode: ({ addChild: "child", addSpouse: "spouse", addSibling: "sibling", addParents: "parents" } as const)[a],
          id,
        });
      case "reorder":
        setMenu(null);
        return setModal({ kind: "reorder", id });
      case "delete":
        setMenu(null);
        return setModal({ kind: "delete", id });
    }
  };

  const onNodeClick = (n: LNode, rect: ScreenRect) => {
    setRename(null);
    if (n.id == null) {
      if (admin) toast.info("Ô “không rõ tên”: dùng “Thêm vợ/chồng” trên người còn lại để điền tên.");
      return;
    }
    if (ui.highlight) ui.set({ highlight: null });
    setMenu({ id: n.id, rect });
  };

  const onRenameStart = (n: LNode, rect: ScreenRect) => {
    if (!admin || n.id == null || !graph) return;
    setMenu(null);
    setRename({ id: n.id, rect, value: graph.get(n.id)!.name });
  };
  const commitRename = async () => {
    if (!rename || !graph) return;
    const p = graph.get(rename.id);
    const value = rename.value.trim();
    setRename(null);
    if (!p || !value || value === p.name) return;
    await run("Đã đổi tên", () => patch(`/api/admin/persons/${p.id}`, { version: p.version, full_name: value }));
  };

  const exportName = `${network ? "mang-luoi" : "gia-pha"}-${(graph?.clan ?? "").replace(/\s+/g, "-").toLowerCase() || "dong-ho"}`;
  const exportTitle = network && center != null ? `Mạng lưới quan hệ của ${graph?.get(center)?.name}` : `Gia phả ${graph?.clan}`;

  // ---- hiển thị -------------------------------------------------------
  if (isLoading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-10 text-brand-800" />
      </div>
    );
  if (error || !graph)
    return <Empty title="Không tải được cây gia phả">{(error as Error)?.message}</Empty>;
  if (network && graph.persons.size > 0 && center == null)
    return <Empty title="Chưa có ai để làm tâm mạng lưới">Hãy chọn một người bằng ô tìm kiếm.</Empty>;

  if (graph.persons.size === 0) {
    return (
      <>
        <Empty title="Cây gia phả chưa có dữ liệu">
          {admin ? (
            <Button variant="primary" size="lg" onClick={() => setModal({ kind: "add", mode: "root", id: null })}>
              Tạo thủy tổ
            </Button>
          ) : (
            <p>Admin của dòng họ chưa nhập dữ liệu.</p>
          )}
        </Empty>
        {modal?.kind === "add" && (
          <Suspense fallback={null}>
            <QuickAdd graph={graph} mode={modal.mode} personId={modal.id} onClose={() => setModal(null)} onCreated={() => {}} />
          </Suspense>
        )}
      </>
    );
  }

  const showBanner = !kin.ego && !ui.bannerDismissed;

  return (
    <div ref={setContainer} className="relative h-full overflow-hidden" onPointerDown={() => (showExport || showFilters) && (setShowExport(false), setShowFilters(false))}>
      <TreeCanvas
        ref={canvasRef}
        state={renderState}
        onNodeClick={onNodeClick}
        onToggle={(n) => n.id != null && ui.toggleCollapsed(n.id)}
        onBackground={() => {
          setMenu(null);
          setRename(null);
          if (ui.highlight) ui.set({ highlight: null });
        }}
        onNameDoubleClick={admin ? onRenameStart : undefined}
        onViewChange={() => {
          setTick((t) => t + 1);
          if (menu) setMenu(null);
        }}
      />

      {/* thanh công cụ trên cùng */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-2 sm:items-start sm:pl-24">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-xl border border-stone-200 bg-white/95 p-1 shadow-md backdrop-blur">
          <Button size="sm" variant={ui.showBadges ? "primary" : "ghost"} icon={<Tags className="size-4" />} onClick={() => ui.set({ showBadges: !ui.showBadges })} disabled={!kin.ego}>
            Cách gọi
          </Button>
          {kin.ego && ui.showBadges && (
            <Button size="sm" variant={ui.reverse ? "gold" : "ghost"} onClick={() => ui.set({ reverse: !ui.reverse })} title="Người này gọi tôi là gì">
              {ui.reverse ? "Họ gọi tôi" : "Tôi gọi họ"}
            </Button>
          )}
          {network && center != null && (
            <span className="flex items-center gap-1 px-2 text-[15px] font-semibold text-brand-800">
              <Share2 className="size-4" /> {graph.get(center)?.name}
            </span>
          )}
          <div className="relative">
            <Button size="sm" variant={!network && (ui.hideNgoai || ui.branch) ? "gold" : "ghost"} icon={<Filter className="size-4" />} onClick={(e) => { e.stopPropagation(); setShowFilters((v) => !v); setShowExport(false); }}>
              {network ? "Phạm vi" : "Lọc"}
            </Button>
            {showFilters && network && (
              <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border border-stone-200 bg-white p-4 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
                <p className="mb-2 font-semibold text-stone-700">Hiện người thân trong phạm vi</p>
                <div className="grid gap-1" role="radiogroup">
                  {RADIUS.map((r) => (
                    <label key={r.v} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 hover:bg-stone-100">
                      <input type="radio" name="radius" checked={ui.netRadius === r.v} onChange={() => ui.set({ netRadius: r.v })} className="size-4 accent-brand-800" />
                      <span>{r.v} bước · {r.label}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-sm text-stone-500">Bấm vào một người rồi chọn “Đặt làm tâm mạng lưới” để đi tiếp sang họ hàng của người đó.</p>
                <div className="mt-4 border-t border-stone-200 pt-3">
                  <p className="mb-2 flex items-center gap-1 font-semibold text-stone-700"><Info className="size-4" /> Chú giải</p>
                  <Legend network />
                </div>
              </div>
            )}
            {showFilters && !network && (
              <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border border-stone-200 bg-white p-4 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
                <Toggle checked={ui.hideNgoai} onChange={(v) => ui.set({ hideNgoai: v })} label="Chỉ xem nội tộc" description="Ẩn các nhánh dòng ngoại (con của con gái)" />
                {graph.branches.length > 0 && (
                  <label className="mt-3 block">
                    <span className="text-[15px] font-semibold text-stone-700">Chi / phái</span>
                    <select className="mt-1 min-h-11 w-full rounded-lg border border-stone-300 px-2" value={ui.branch ?? ""} onChange={(e) => ui.set({ branch: e.target.value || null })}>
                      <option value="">Tất cả</option>
                      {graph.branches.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="mt-4 border-t border-stone-200 pt-3">
                  <p className="mb-2 flex items-center gap-1 font-semibold text-stone-700"><Info className="size-4" /> Chú giải</p>
                  <Legend />
                </div>
                {ui.collapsed.length > 0 && (
                  <Button size="sm" className="mt-3 w-full" onClick={() => ui.set({ collapsed: [] })}>
                    Mở rộng tất cả nhánh ({ui.collapsed.length})
                  </Button>
                )}
              </div>
            )}
          </div>
          {!network && (
            <Button size="sm" variant="ghost" icon={<Share2 className="size-4" />} onClick={() => navigate(netPath(selectedId ?? kin.meId ?? graph.rootId ?? 0))}>
              <span className="hidden sm:inline">Mạng lưới</span>
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<GitCompare className="size-4" />} onClick={() => setModal({ kind: "compare", id: kin.meId })}>
            <span className="hidden sm:inline">Tra cứu quan hệ</span>
          </Button>
          <div className="relative">
            <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={(e) => { e.stopPropagation(); setShowExport((v) => !v); setShowFilters(false); }}>
              <span className="hidden sm:inline">Xuất</span>
            </Button>
            {showExport && layout && (
              <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-stone-200 bg-white p-2 shadow-xl sm:left-0 sm:right-auto" onPointerDown={(e) => e.stopPropagation()}>
                {[
                  { icon: <Printer className="size-5" />, label: "In / Lưu PDF", fn: () => printTree(buildSVG(layout, graph, badges, exportTitle), exportTitle) || toast.error("Trình duyệt chặn cửa sổ mới") },
                  { icon: <FileImage className="size-5" />, label: "Ảnh PNG", fn: () => void downloadPNG(layout, graph, badges, exportName) },
                  { icon: <FileImage className="size-5" />, label: "Ảnh vector SVG", fn: () => downloadSVG(buildSVG(layout, graph, badges, exportTitle), exportName) },
                  ...(admin ? [{ icon: <FileSpreadsheet className="size-5" />, label: "Danh sách Excel", fn: () => window.open("/api/admin/export/persons.xlsx", "_blank") }] : []),
                ].map((x) => (
                  <button key={x.label} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-stone-100" onClick={() => { setShowExport(false); x.fn(); }}>
                    {x.icon} {x.label}
                  </button>
                ))}
                <p className="px-3 pt-1 text-sm text-stone-500">Xuất theo bộ lọc và các nhánh đang mở.</p>
              </div>
            )}
          </div>
        </div>
        {ui.highlight && (
          <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-gold-400 px-3 py-1 font-semibold shadow">
            <Route className="size-4" /> Đang làm nổi đường nối
            <IconButton label="Bỏ làm nổi" className="size-8" onClick={() => ui.set({ highlight: null })}>
              <X className="size-4" />
            </IconButton>
          </div>
        )}
        {showBanner && (
          <WhoAmIBanner
            graph={graph}
            onPicked={(p) => {
              ensureVisible(p.id);
              setTimeout(() => focus(p.id), 60);
            }}
          />
        )}
      </div>

      {/* điều khiển phóng to thu nhỏ */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
        {size.w >= 640 && <Minimap layout={layout} renderer={canvasRef.current?.renderer ?? null} tick={tick} />}
        <div className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-md">
          <IconButton label="Phóng to" onClick={() => canvasRef.current?.zoomIn()}><Plus className="size-5" /></IconButton>
          <IconButton label="Thu nhỏ" onClick={() => canvasRef.current?.zoomOut()}><Minus className="size-5" /></IconButton>
          <IconButton label="Vừa màn hình" onClick={() => canvasRef.current?.fit()}><Maximize className="size-5" /></IconButton>
        </div>
      </div>

      {menu && (
        <NodeMenu
          graph={graph}
          rules={rules}
          personId={menu.id}
          rect={menu.rect}
          container={size}
          admin={admin}
          ego={kin.ego}
          relation={kin.relations?.get(menu.id) ?? null}
          collapsed={collapsed.has(menu.id)}
          networkMode={network}
          isCenter={menu.id === center}
          onAction={onAction}
          onClose={() => setMenu(null)}
        />
      )}

      {rename && (
        <input
          autoFocus
          className="absolute z-20 rounded-md border-2 border-gold-500 bg-white px-2 text-[15px] font-semibold shadow-lg outline-none"
          style={{ left: rename.rect.x + 62 * (rename.rect.w / NODE_W), top: rename.rect.y + 12 * (rename.rect.w / NODE_W), width: Math.max(160, rename.rect.w - 66), height: 34 }}
          value={rename.value}
          onChange={(e) => setRename({ ...rename, value: e.target.value })}
          onBlur={() => void commitRename()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitRename();
            if (e.key === "Escape") setRename(null);
          }}
          aria-label="Sửa nhanh tên"
        />
      )}

      {panel?.kind === "view" && graph.get(panel.id) && (
        <PersonDrawer
          graph={graph}
          rules={rules}
          personId={panel.id}
          ego={kin.ego}
          relation={kin.relations?.get(panel.id) ?? null}
          shareUrl={`${location.origin}${src.base}/p/${panel.id}`}
          onClose={closePanel}
          onOpen={goTo}
          onEdit={() => setPanel({ kind: "edit", id: panel.id })}
          onNetwork={network && panel.id === center ? undefined : () => navigate(netPath(panel.id))}
        />
      )}
      <Suspense fallback={null}>
      {panel?.kind === "edit" && admin && graph.get(panel.id) && (
        <PersonForm graph={graph} personId={panel.id} onClose={() => setPanel({ kind: "view", id: panel.id })} />
      )}

      {modal?.kind === "add" && (
        <QuickAdd
          graph={graph}
          mode={modal.mode}
          personId={modal.id}
          onClose={() => setModal(null)}
          onCreated={(id) => {
            if (id != null) pendingFocus.current = id;
            if (modal.id != null && collapsed.has(modal.id)) ui.toggleCollapsed(modal.id);
          }}
        />
      )}
      {modal?.kind === "delete" && (
        <DeleteDialog personId={modal.id} kind={graph.get(modal.id)?.kind} onClose={() => setModal(null)} onDeleted={() => panel?.id === modal.id && closePanel()} />
      )}
      {modal?.kind === "reorder" && <ReorderDialog graph={graph} personId={modal.id} onClose={() => setModal(null)} />}
      </Suspense>
      {modal?.kind === "compare" && (
        <CompareDialog
          graph={graph}
          rules={rules}
          initialA={modal.id}
          onClose={() => setModal(null)}
          onHighlight={highlightPath}
        />
      )}
    </div>
  );
}

