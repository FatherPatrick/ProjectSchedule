import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useAuth } from "@/src/auth/AuthContext";

export type AppSettingsDTO = {
  slotGranularityMin: number;
  allowStartAtClose: boolean;
};

type SettingsResponse = { data: AppSettingsDTO };

export function useSettings() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["settings"],
    enabled: auth.status === "signedIn",
    queryFn: async () => {
      const res = await apiFetch<SettingsResponse>(auth, `/api/admin/settings`);
      return res.data;
    },
  });
}

export function useUpdateSettings() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettingsDTO>) => {
      const res = await apiFetch<SettingsResponse>(auth, `/api/admin/settings`, {
        method: "PUT",
        body: patch,
      });
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData<AppSettingsDTO>(["settings"], data);
    },
  });
}
