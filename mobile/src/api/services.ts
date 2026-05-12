import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useAuth } from "@/auth/AuthContext";

export type ServiceDTO = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  sortOrder: number;
};

type ListResponse = { data: ServiceDTO[] };

export function useServices() {
  const auth = useAuth();
  return useQuery({
    queryKey: ["services"],
    enabled: auth.status === "signedIn",
    queryFn: async () => {
      const res = await apiFetch<ListResponse>(
        auth,
        `/api/admin/services?includeInactive=true`
      );
      return res.data;
    },
  });
}

export type ServiceCreateInput = {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
  active?: boolean;
};

export function useCreateService() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceCreateInput) => {
      await apiFetch(auth, `/api/admin/services`, {
        method: "POST",
        body: input,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export type ServiceUpdateInput = Partial<ServiceCreateInput>;

export function useUpdateService() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; patch: ServiceUpdateInput }) => {
      await apiFetch(auth, `/api/admin/services/${vars.id}`, {
        method: "PATCH",
        body: vars.patch,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useDeleteService() {
  const auth = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(auth, `/api/admin/services/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
