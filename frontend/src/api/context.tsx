import { createContext, useContext } from "react";

export interface Source {
  mode: "public" | "admin";
  token?: string;
  /** Gốc API: /api/public/{token} hoặc /api/admin */
  api: string;
  /** Gốc đường dẫn giao diện: /t/{token} hoặc /admin */
  base: string;
}

export const SourceContext = createContext<Source | null>(null);

export function useSource(): Source {
  const s = useContext(SourceContext);
  if (!s) throw new Error("Thiếu SourceContext");
  return s;
}

export function useIsAdmin(): boolean {
  return useSource().mode === "admin";
}

export function publicSource(token: string): Source {
  return { mode: "public", token, api: `/api/public/${encodeURIComponent(token)}`, base: `/t/${token}` };
}

export const adminSource: Source = { mode: "admin", api: "/api/admin", base: "/admin" };
