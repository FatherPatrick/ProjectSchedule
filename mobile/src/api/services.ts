import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "./client";
import { useAuth } from "@/auth/AuthContext";
import type {
  ServiceCreateInput,
  ServiceUpdateInput,
  ServicesListResponse,
} from "@shared/api-types";

export type {
  ServiceDTO,
  ServiceCreateInput,
  ServiceUpdateInput,
} from "@shared/api-types";

export function useServices() {
  const api = useApi();
  const { status } = useAuth();
  return useQuery({
    queryKey: ["services"],
    enabled: status === "signedIn",
    queryFn: async () => {
      const res = await api.get<ServicesListResponse>(
        `/api/admin/services?includeInactive=true`
      );
      return res.data;
    },
  });
}

export function useCreateService() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceCreateInput) => {
      await api.post(`/api/admin/services`, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useUpdateService() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: ServiceUpdateInput }) => {
      await api.patch(`/api/admin/services/${vars.id}`, vars.patch);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useDeleteService() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.del(`/api/admin/services/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
