import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useAuth } from "@/src/auth/AuthContext";

export type DayHours = {
  dayOfWeek: number;
  openMin: number;
  closeMin: number;
  active: boolean;
};

type HoursResponse = { data: { days: DayHours[] } };

export function useHours() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["hours"],
    enabled: auth.status === "signedIn",
    queryFn: async () => {
      const res = await apiFetch<HoursResponse>(auth, `/api/admin/hours`);
      return res.data.days;
    },
  });
}

export function useSaveHours() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days: DayHours[]) => {
      await apiFetch(auth, `/api/admin/hours`, {
        method: "PUT",
        body: { days },
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hours"] });
    },
  });
}

export type HoursOverride = {
  effectiveFrom: string; // YYYY-MM-DD
  note: string | null;
  days: DayHours[];
};

type ScheduleResponse = { data: HoursOverride[] };

export function useHoursSchedule() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["hours-schedule"],
    enabled: auth.status === "signedIn",
    queryFn: async () => {
      const res = await apiFetch<ScheduleResponse>(
        auth,
        `/api/admin/hours/schedule`
      );
      return res.data;
    },
  });
}

export function useDeleteHoursOverride() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (effectiveFrom: string) => {
      await apiFetch(
        auth,
        `/api/admin/hours/schedule/${encodeURIComponent(effectiveFrom)}`,
        { method: "DELETE" }
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hours-schedule"] });
    },
  });
}
