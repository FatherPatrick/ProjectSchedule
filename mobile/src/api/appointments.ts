import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client";
import { useAuth } from "@/src/auth/AuthContext";

export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type AppointmentDTO = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
  client: { id: string; name: string; email: string; phone: string };
  service: {
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
  };
};

type ListResponse = { data: AppointmentDTO[] };

/**
 * Fetch the appointments overlapping `[from, to)`. Pass JS Date objects;
 * they're serialized to ISO before sending.
 */
export function useAppointments(range: { from: Date; to: Date }) {
  const auth = useAuth();
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  return useQuery({
    queryKey: ["appointments", fromIso, toIso],
    enabled: auth.status === "signedIn",
    queryFn: async () => {
      const res = await apiFetch<ListResponse>(
        auth,
        `/api/admin/appointments?from=${encodeURIComponent(
          fromIso
        )}&to=${encodeURIComponent(toIso)}`
      );
      return res.data;
    },
  });
}

/**
 * Optimistically updates the matching appointment row in every cached query
 * to `nextStatus`, then issues `POST path`. On error the previous cache state
 * is restored. After settle (success or error) all `appointments` queries are
 * invalidated to re-sync from the server.
 */
function useAppointmentMutation<V extends { id: string }>(opts: {
  path: (vars: V) => string;
  body?: (vars: V) => unknown;
  nextStatus: AppointmentStatus;
}) {
  const auth = useAuth();
  const qc = useQueryClient();

  return useMutation<
    void,
    Error,
    V,
    { snapshots: [readonly unknown[], AppointmentDTO[] | undefined][] }
  >({
    mutationFn: async (vars) => {
      await apiFetch(auth, opts.path(vars), {
        method: "POST",
        body: opts.body ? opts.body(vars) : {},
      });
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["appointments"] });
      const snapshots = qc.getQueriesData<AppointmentDTO[]>({
        queryKey: ["appointments"],
      });
      for (const [key, list] of snapshots) {
        if (!list) continue;
        qc.setQueryData<AppointmentDTO[]>(
          key,
          list.map((a) =>
            a.id === vars.id ? { ...a, status: opts.nextStatus } : a
          )
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, prev] of ctx.snapshots) {
        qc.setQueryData(key, prev);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useApproveAppointment() {
  return useAppointmentMutation<{ id: string }>({
    path: ({ id }) => `/api/admin/appointments/${id}/approve`,
    nextStatus: "CONFIRMED",
  });
}

export function useCancelAppointment() {
  return useAppointmentMutation<{ id: string; message?: string }>({
    path: ({ id }) => `/api/admin/appointments/${id}/cancel`,
    body: ({ message }) =>
      message && message.trim() ? { message: message.trim() } : {},
    nextStatus: "CANCELLED",
  });
}
