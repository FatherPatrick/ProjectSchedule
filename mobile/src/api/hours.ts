import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./client";
import { useAuth } from "@/auth/AuthContext";
import type {
  DayHours,
  HoursResponse,
  HoursScheduleResponse,
} from "@shared/api-types";

export type { DayHours, HoursOverride } from "@shared/api-types";

export function useHours() {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: ["hours"],
    enabled: status === "signedIn",
    queryFn: async () => {
      const res = await api.get<HoursResponse>(`/api/admin/hours`);
      return res.data.days;
    },
  });
}

export function useSaveHours() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (days: DayHours[]) => {
      await api.put(`/api/admin/hours`, { days });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hours"] });
    },
  });
}

export function useHoursSchedule() {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: ["hours-schedule"],
    enabled: status === "signedIn",
    queryFn: async () => {
      const res = await api.get<HoursScheduleResponse>(
        `/api/admin/hours/schedule`
      );
      return res.data;
    },
  });
}

export function useDeleteHoursOverride() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (effectiveFrom: string) => {
      await api.del(
        `/api/admin/hours/schedule/${encodeURIComponent(effectiveFrom)}`
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["hours-schedule"] });
    },
  });
}
