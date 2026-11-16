import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { FamilyGraph } from "@/lib/graph";
import { mergeRules, type Rules } from "@/lib/kinshipRules";
import { get } from "./client";
import { useSource } from "./context";
import type { AdminInfo, Anniversary, PersonDetail, PublicConfig, RawTree } from "./types";

export function useTree() {
  const src = useSource();
  const q = useQuery({
    queryKey: ["tree", src.mode, src.token],
    queryFn: () => get<RawTree>(`${src.api}/tree`),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
  const graph = useMemo(() => (q.data ? new FamilyGraph(q.data) : null), [q.data]);
  const rules: Rules = useMemo(() => mergeRules(q.data?.kinship), [q.data?.kinship]);
  return { ...q, graph, rules };
}

export function useConfig() {
  const src = useSource();
  return useQuery({
    queryKey: ["config", src.mode, src.token],
    queryFn: () => get<PublicConfig>(src.mode === "admin" ? "/api/admin/settings" : `${src.api}/config`),
    staleTime: 60_000,
  });
}

export function usePerson(id: number | null) {
  const src = useSource();
  return useQuery({
    queryKey: ["person", src.mode, id],
    queryFn: () => get<PersonDetail>(`${src.api}/persons/${id}`),
    enabled: id != null && id > 0,
  });
}

export function useAnniversaries(days: number) {
  const src = useSource();
  return useQuery({
    queryKey: ["anniversaries", src.mode, days],
    queryFn: () => get<{ today: string; items: Anniversary[] }>(`${src.api}/anniversaries?days=${days}`),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => get<AdminInfo>("/api/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

/** Làm mới mọi thứ phụ thuộc vào dữ liệu cây sau một thao tác sửa. */
export function useRefreshTree() {
  const qc = useQueryClient();
  return async (personId?: number) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["tree"] }),
      qc.invalidateQueries({ queryKey: ["anniversaries"] }),
      personId != null
        ? qc.invalidateQueries({ queryKey: ["person", "admin", personId] })
        : qc.invalidateQueries({ queryKey: ["person"] }),
      qc.invalidateQueries({ queryKey: ["audit"] }),
      qc.invalidateQueries({ queryKey: ["trash"] }),
    ]);
  };
}
