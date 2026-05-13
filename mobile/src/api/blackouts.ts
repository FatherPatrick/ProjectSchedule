import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./client";
import { useAuth } from "@/auth/AuthContext";
import type {
  BlackoutCreateInput,
  BlackoutsListResponse,
} from "@shared/api-types";

export type { BlackoutDTO, BlackoutCreateInput } from "@shared/api-types";

export function useBlackouts() {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: ["blackouts"],
    enabled: status === "signedIn",
    queryFn: async () => {
      const res = await api.get<BlackoutsListResponse>(`/api/admin/blackouts`);
      return res.data;
    },
  });
}

export function useCreateBlackout() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlackoutCreateInput) => {
      await api.post(`/api/admin/blackouts`, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blackouts"] });
    },
  });
}

export function useDeleteBlackout() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/admin/blackouts/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blackouts"] });
    },
  });
}
