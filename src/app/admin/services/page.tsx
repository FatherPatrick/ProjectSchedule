import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { assertAdmin } from "@/lib/auth/admin";
import { parseServiceCreateForm } from "@/lib/validation/admin";
import { formatDuration, formatPrice } from "@/lib/utils";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
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

      <Card
        as="form"
        id="new-service-form"
        action={createService}
        className="space-y-2"
      >
        <UnsavedChangesGuard />
        <div className="grid sm:grid-cols-2 gap-2">
          <TextInput
            name="name"
            aria-label="Service name"
            placeholder="Name (e.g. Gel Manicure)"
            required
          />
          <div className="flex items-stretch gap-2">
            <label className="flex-1 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2">
              <span className="sr-only">Duration hours</span>
              <input
                name="durationHours"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="w-full bg-transparent outline-none"
              />
              <span aria-hidden="true" className="text-sm text-neutral-500">hr</span>
            </label>
            <label className="flex-1 flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2">
              <span className="sr-only">Duration minutes</span>
              <input
                name="durationMinutes"
                type="number"
                min={0}
                max={59}
                step={5}
                defaultValue={30}
                className="w-full bg-transparent outline-none"
              />
              <span aria-hidden="true" className="text-sm text-neutral-500">min</span>
            </label>
          </div>
          <TextInput
            name="priceDollars"
            type="number"
            min={0}
            step="0.01"
            aria-label="Price in US dollars"
            placeholder="Price (USD)"
            required
          />
          <TextInput
            name="description"
            aria-label="Service description (optional)"
            placeholder="Short description (optional)"
          />
        </div>
        <Button type="submit">Add service</Button>
      </Card>

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
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    aria-label={`${s.active ? "Deactivate" : "Activate"} ${s.name}`}
                  >
                    {s.active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
                <form action={deleteService.bind(null, s.id)}>
                  <Button
                    type="submit"
                    variant="danger"
                    size="sm"
                    aria-label={`Delete ${s.name}`}
                  >
                    Delete
                  </Button>
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
