import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { BUSINESS_NAME } from "@/lib/config";
import { formatDuration, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  let services: Awaited<ReturnType<typeof prisma.service.findMany>> = [];
  try {
    services = await prisma.service.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  } catch {
    // DB not configured yet — render landing without services list.
  }

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-white p-6 sm:p-10 shadow-sm border border-pink-100">
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          Book your next nail appointment
        </h1>
        <p className="mt-3 text-neutral-600">
          Welcome to {BUSINESS_NAME}. Pick a service, choose a time that
          works for you, and we&apos;ll send confirmation by email and text.
        </p>
        <div className="mt-6">
          <Link
            href="/book"
            className="inline-flex items-center justify-center rounded-full bg-pink-600 text-white px-6 py-3 font-medium hover:bg-pink-700"
          >
            Book an appointment
          </Link>
        </div>
      </section>

      {services.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-3">Services</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl bg-white border border-neutral-200 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium">{s.name}</h3>
                    {s.description && (
                      <p className="text-sm text-neutral-600 mt-1">
                        {s.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium">
                      {formatPrice(s.priceCents)}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {formatDuration(s.durationMinutes)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
