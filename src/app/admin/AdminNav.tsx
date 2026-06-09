"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Clock,
  LayoutDashboard,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/admin/book", label: "New booking", icon: CalendarPlus },
  { href: "/admin/services", label: "Services", icon: Sparkles },
  { href: "/admin/blackouts", label: "Blackouts", icon: CalendarOff },
  { href: "/admin/hours", label: "Hours", icon: Clock },
  { href: "/admin/admins", label: "Admins", icon: Users },
];

export default function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Admin sections"
      className="flex flex-wrap gap-1.5 rounded-full border border-pink-100 bg-white/70 p-1 shadow-sm backdrop-blur"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
              active
                ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-md shadow-pink-200/60"
                : "text-neutral-600 hover:bg-pink-50 hover:text-pink-700"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 transition-transform",
                active
                  ? "drop-shadow-sm"
                  : "text-neutral-400 group-hover:text-pink-500 group-hover:scale-110"
              )}
              aria-hidden
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
