"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
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
  const scrollerRef = useRef<HTMLElement>(null);
  // Whether there are more tabs hidden off the left/right edge. Drives the
  // scroll-hint chevrons so it's obvious the strip scrolls. On `sm`+ the tabs
  // wrap instead of scrolling, so scrollWidth === clientWidth and both stay
  // false — the chevrons never show on desktop.
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateHints = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateHints();
    el.addEventListener("scroll", updateHints, { passive: true });
    const observer = new ResizeObserver(updateHints);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateHints);
      observer.disconnect();
    };
  }, [updateHints]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.7, behavior: "smooth" });
  };

  return (
    // On mobile the tabs stay on a single horizontally scrollable row so the
    // bar keeps a fixed height as more tabs are added. From `sm` up there's
    // room to wrap and show every tab at once.
    <div className="relative w-full min-w-0 sm:w-auto">
      <nav
        ref={scrollerRef}
        aria-label="Admin sections"
        className="flex flex-nowrap gap-1.5 overflow-x-auto rounded-2xl border border-pink-100 bg-white/70 p-1.5 shadow-sm backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-x-visible [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-all",
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

      {/* Scroll hints: a fade + tappable chevron on whichever side has more
          tabs. They fade out once that edge is reached. */}
      <button
        type="button"
        aria-label="Scroll tabs left"
        tabIndex={canScrollLeft ? 0 : -1}
        onClick={() => scrollByPage(-1)}
        className={cn(
          "absolute inset-y-1 left-1 flex w-12 items-center justify-start rounded-l-2xl bg-gradient-to-r from-white via-white/85 to-transparent pl-1 transition-opacity sm:hidden",
          canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-pink-600 shadow ring-1 ring-pink-100">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </span>
      </button>
      <button
        type="button"
        aria-label="Scroll tabs right"
        tabIndex={canScrollRight ? 0 : -1}
        onClick={() => scrollByPage(1)}
        className={cn(
          "absolute inset-y-1 right-1 flex w-12 items-center justify-end rounded-r-2xl bg-gradient-to-l from-white via-white/85 to-transparent pr-1 transition-opacity sm:hidden",
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-pink-600 shadow ring-1 ring-pink-100">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    </div>
  );
}
