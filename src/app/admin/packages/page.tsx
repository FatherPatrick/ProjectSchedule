import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { adminAction } from "@/lib/admin/serverAction";
import { getAdminSalonId } from "@/lib/domain/salon";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { TextInput } from "@/components/TextInput";
import { PrettySelect } from "@/components/PrettySelect";
import { UnsavedChangesGuard } from "@/components/UnsavedChangesGuard";
import { ServiceRow } from "../services/ServiceRow";

export const dynamic = "force-dynamic";

function parsePackageForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  const totalSessions = Number(formData.get("totalSessions"));
  const priceDollars = Number(formData.get("priceDollars"));
  if (!name) throw new Error("Enter a package name.");
  if (!serviceId) throw new Error("Choose a service.");
  if (!Number.isInteger(totalSessions) || totalSessions < 2) {
    throw new Error("Sessions must be a whole number of 2 or more.");
  }
  if (!Number.isFinite(priceDollars) || priceDollars <= 0) {
    throw new Error("Enter a valid price.");
  }
  return { name, serviceId, totalSessions, priceCents: Math.round(priceDollars * 100) };
}

async function createPackage(formData: FormData) {
  "use server";
  await adminAction("/admin/packages", "created", async () => {
    const salonId = await getAdminSalonId();
    const data = parsePackageForm(formData);
    const service = await prisma.service.findUnique({ where: { id: data.serviceId } });
    if (!service || service.salonId !== salonId) {
      throw new Error("Choose a valid service.");
    }
    await prisma.package.create({ data: { ...data, salonId } });
  });
}

async function togglePackage(id: string, active: boolean) {
  "use server";
  await adminAction("/admin/packages", "toggled", async () => {
    await prisma.package.update({ where: { id }, data: { active } });
  });
}

async function deletePackage(id: string) {
  "use server";
  await adminAction("/admin/packages", "deleted", async () => {
    await prisma.package.delete({ where: { id } });
  });
}

export default async function PackagesAdmin() {
  const salonId = await getAdminSalonId();
  const [packages, services] = await Promise.all([
    prisma.package.findMany({
      where: { salonId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { service: { select: { name: true } }, _count: { select: { clientPackages: true } } },
    }),
    prisma.service.findMany({
      where: { salonId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Packages</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Prepaid bundles clients can buy (e.g. &ldquo;5 Gel Manicures for
          $200&rdquo;). Sell one to a client from their{" "}
          <Link href="/admin/clients" className="underline">
            client page
          </Link>
          . Each booking for that service automatically draws down a
          session; cancelling gives it back.
        </p>
      </div>

      {services.length === 0 ? (
        <Card as="section" className="text-sm text-neutral-500">
          Add an active service before creating a package.
        </Card>
      ) : (
        <Card as="form" id="new-package-form" action={createPackage} className="space-y-2">
          <UnsavedChangesGuard />
          <div className="grid sm:grid-cols-2 gap-2">
            <TextInput
              name="name"
              aria-label="Package name"
              placeholder="Name (e.g. 5-Pack Gel Manicure)"
              required
            />
            <PrettySelect
              name="serviceId"
              ariaLabel="Service"
              defaultValue={services[0]?.id ?? ""}
              options={services.map((s) => ({ value: s.id, label: s.name }))}
            />
            <TextInput
              name="totalSessions"
              type="number"
              min={2}
              step={1}
              defaultValue={5}
              aria-label="Number of sessions"
              placeholder="Sessions"
              required
            />
            <TextInput
              name="priceDollars"
              type="number"
              min={0}
              step="0.01"
              aria-label="Bundle price in US dollars"
              placeholder="Bundle price (USD)"
              required
            />
          </div>
          <Button type="submit">Add package</Button>
        </Card>
      )}

      <ul className="divide-y divide-neutral-200 rounded-2xl bg-white border border-neutral-200">
        {packages.map((p) => (
          <ServiceRow
            key={p.id}
            name={p.name}
            active={p.active}
            description={null}
            meta={`${p.service.name} · ${p.totalSessions} sessions · ${formatPrice(p.priceCents)}${
              p._count.clientPackages > 0
                ? ` · sold to ${p._count.clientPackages} client${p._count.clientPackages === 1 ? "" : "s"}`
                : ""
            }`}
            actions={
              <>
                <form action={togglePackage.bind(null, p.id, !p.active)}>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    aria-label={`${p.active ? "Deactivate" : "Activate"} ${p.name}`}
                  >
                    {p.active ? "Deactivate" : "Activate"}
                  </Button>
                </form>
                {p._count.clientPackages === 0 && (
                  <form action={deletePackage.bind(null, p.id)}>
                    <Button type="submit" variant="danger" size="sm" aria-label={`Delete ${p.name}`}>
                      Delete
                    </Button>
                  </form>
                )}
              </>
            }
          />
        ))}
        {packages.length === 0 && (
          <li className="p-4 text-sm text-neutral-500">
            No packages yet. Add your first one above.
          </li>
        )}
      </ul>
    </div>
  );
}
