import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/auth";
import { formatDuration, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function assertAdmin() {
  const s = await auth();
  if (!s?.user || s.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
}

async function createService(formData: FormData) {
  "use server";
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const durationMinutes = Number(formData.get("durationMinutes"));
  const priceDollars = Number(formData.get("priceDollars"));
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!name || !durationMinutes || Number.isNaN(priceDollars)) return;
  await prisma.service.create({
    data: {
      name,
      description,
      durationMinutes,
      priceCents: Math.round(priceDollars * 100),
    },
  });
  revalidatePath("/admin/services");
}

async function toggleService(id: string, active: boolean) {
  "use server";
  await assertAdmin();
  await prisma.service.update({ where: { id }, data: { active } });
  revalidatePath("/admin/services");
}

async function deleteService(id: string) {
  "use server";
  await assertAdmin();
  await prisma.service.delete({ where: { id } });
  revalidatePath("/admin/services");
}

export default async function ServicesAdmin() {
  const services = await prisma.service.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Services</h1>

      <form
        action={createService}
        className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2"
      >
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            name="name"
            placeholder="Name (e.g. Gel Manicure)"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <input
            name="durationMinutes"
            type="number"
            min={5}
            step={5}
            placeholder="Duration (minutes)"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <input
            name="priceDollars"
            type="number"
            min={0}
            step="0.01"
            placeholder="Price (USD)"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <input
            name="description"
            placeholder="Short description (optional)"
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <button className="rounded-full bg-pink-600 text-white px-4 py-2 font-medium">
          Add service
        </button>
      </form>

      <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
        {services.map((s) => (
          <li key={s.id} className="p-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium">
                {s.name}{" "}
                {!s.active && <span className="text-xs text-neutral-500">(inactive)</span>}
              </div>
              <div className="text-sm text-neutral-500">
                {formatDuration(s.durationMinutes)} · {formatPrice(s.priceCents)}
              </div>
            </div>
            <div className="flex gap-2">
              <form action={toggleService.bind(null, s.id, !s.active)}>
                <button className="text-sm rounded-full border border-neutral-300 px-3 py-1">
                  {s.active ? "Deactivate" : "Activate"}
                </button>
              </form>
              <form action={deleteService.bind(null, s.id)}>
                <button className="text-sm rounded-full border border-red-200 text-red-700 px-3 py-1 hover:bg-red-50">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
        {services.length === 0 && (
          <li className="p-4 text-sm text-neutral-500">
            No services yet. Add your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}
