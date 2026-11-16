import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Ego } from "@/lib/kinship";

interface UIState {
  /** "Tôi là ai" — chỉ lưu trên trình duyệt (localStorage), không gửi về máy chủ */
  me: Ego | null;
  bannerDismissed: boolean;
  showBadges: boolean;
  /** FR-53: xem "người này gọi tôi là gì" */
  reverse: boolean;
  hideNgoai: boolean;
  branch: string | null;
  collapsed: number[];
  compare: { a: number | null; b: number | null } | null;
  highlight: number[] | null;
  /** Mạng lưới: số bước quan hệ tính từ người ở tâm */
  netRadius: number;

  setMe: (me: Ego | null) => void;
  dismissBanner: () => void;
  set: (patch: Partial<Omit<UIState, "set" | "setMe" | "dismissBanner" | "toggleCollapsed">>) => void;
  toggleCollapsed: (id: number) => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = "__gp_test__";
    localStorage.setItem(k, k);
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (n: string) => mem.get(n) ?? null,
      setItem: (n: string, v: string) => void mem.set(n, v),
      removeItem: (n: string) => void mem.delete(n),
    };
  }
});

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      me: null,
      bannerDismissed: false,
      showBadges: true,
      reverse: false,
      hideNgoai: false,
      branch: null,
      collapsed: [],
      compare: null,
      highlight: null,
      netRadius: 2,
      setMe: (me) => set({ me, bannerDismissed: true, highlight: null }),
      dismissBanner: () => set({ bannerDismissed: true }),
      set: (patch) => set(patch),
      toggleCollapsed: (id) =>
        set((s) => ({
          collapsed: s.collapsed.includes(id) ? s.collapsed.filter((x) => x !== id) : [...s.collapsed, id],
        })),
    }),
    {
      name: "giapha-ui",
      storage: safeStorage,
      partialize: (s) => ({ me: s.me, bannerDismissed: s.bannerDismissed, showBadges: s.showBadges, collapsed: s.collapsed, netRadius: s.netRadius }),
    },
  ),
);
