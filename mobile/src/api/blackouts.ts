import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useAuth } from "@/src/auth/AuthContext";

export type BlackoutDTO = {
  id: string;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  reason: string | null;
};

type ListResponse = { data: BlackoutDTO[] };

export function useBlackouts() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["blackouts"],
    enabled: auth.status === "signedIn",
    queryFn: async () => {
      const res = await apiFetch<ListResponse>(auth, `/api/admin/blackouts`);
      return res.data;
    },
  });
}

/**
 * Mirrors `blackoutCreateSchema` on the server. `fromDay`/`toDay` are
 * `YYYY-MM-DD`; `startTime`/`endTime` are `HH:MM` (only used when `allDay`
 * is false).
 */
export type BlackoutCreateInput = {
  fromDay: string;
  toDay: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

export function useCreateBlackout() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlackoutCreateInput) => {
      await apiFetch(auth, `/api/admin/blackouts`, {
        method: "POST",
        body: input,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blackouts"] });
    },
  });
}

export function useDeleteBlackout() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(auth, `/api/admin/blackouts/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blackouts"] });
    },
  });
}
