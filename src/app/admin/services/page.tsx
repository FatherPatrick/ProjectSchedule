import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { assertAdmin } from "@/lib/admin";
import { parseServiceCreateForm } from "@/lib/validation/admin";
import { formatDuration, formatPrice } from "@/lib/utils";
import { UnsavedChangesGuard } from "@/app/components/UnsavedChangesGuard";
import { ServiceRow } from "./ServiceRow";

export const dynamic = "force-dynamic";

async function createService(formData: FormData) {
  "use server";
  await assertAdmin();
  const data = parseServiceCreateForm(formData);
  await prisma.service.create({ data });
  revalidatePath("/admin/services");
  redirect("/admin/services?saved=created");
}

async function toggleService(id: string, active: boolean) {
  "use server";
  await assertAdmin();
  await prisma.service.update({ where: { id }, data: { active } });
  revalidatePath("/admin/services");
  redirect("/admin/services?saved=toggled");
}

async function deleteService(id: string) {
  "use server";
  await assertAdmin();
  await prisma.service.delete({ where: { id } });
  revalidatePath("/admin/services");
  redirect("/admin/services?saved=deleted");
}

export default async function ServicesAdmin() {
  const services = await prisma.service.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Services</h1>

      <form
        id="new-service-form"
        action={createService}
        className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2"
      >
        <UnsavedChangesGuard formId="new-service-form" />
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            name="name"
            placeholder="Name (e.g. Gel Manicure)"
            required
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
          <div className="flex items-stretch gap-2">
            <label className="flex-1 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2">
              <input
                name="durationHours"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="w-full bg-transparent outline-none"
              />
              <span className="text-sm text-neutral-500">hr</span>
            </label>
            <label className="flex-1 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2">
              <input
                name="durationMinutes"
                type="number"
                min={0}
                max={59}
                step={5}
                defaultValue={30}
                className="w-full bg-transparent outline-none"
              />
              <span className="text-sm text-neutral-500">min</span>
            </label>
          </div>
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
          <ServiceRow
            key={s.id}
            name={s.name}
            active={s.active}
            description={s.description}
            meta={`${formatDuration(s.durationMinutes)} · ${formatPrice(s.priceCents)}`}
            actions={
              <>
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
              </>
            }
          />
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
