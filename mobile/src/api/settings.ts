import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./client";
import { useAuth } from "@/auth/AuthContext";
import type {
  AppSettingsDTO,
  AppSettingsResponse,
} from "@shared/api-types";

export type { AppSettingsDTO } from "@shared/api-types";

export function useSettings() {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: ["settings"],
    enabled: status === "signedIn",
    queryFn: async () => {
      const res = await api.get<AppSettingsResponse>(`/api/admin/settings`);
      return res.data;
    },
  });
}

export function useUpdateSettings() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettingsDTO>) => {
      const res = await api.put<AppSettingsResponse>(
        `/api/admin/settings`,
        patch
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData<AppSettingsDTO>(["settings"], data);
    },
  });
}
