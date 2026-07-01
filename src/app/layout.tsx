import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Image from "next/image";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { BUSINESS_NAME } from "@/lib/config";
import { getSalonFromContext, type SalonContext } from "@/lib/domain/salon";
import { fontCssVar, fontVariableClassNames } from "@/lib/theme/fonts";
import { contrastTextColor, isValidHex } from "@/lib/theme/color";
import { PLATFORM_DEFAULT_APPEARANCE as PLATFORM_DEFAULT } from "@/lib/theme/defaults";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const salon = await getSalonFromContext();
  const name = salon?.name ?? BUSINESS_NAME;
  return {
    title: {
      default: name,
      template: `%s · ${name}`,
    },
    description: `Book your nail appointment at ${name}.`,
  };
}

export async function generateViewport(): Promise<Viewport> {
  const salon = await getSalonFromContext();
  const backgroundColor = salon?.backgroundColor ?? PLATFORM_DEFAULT.backgroundColor;
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: isValidHex(backgroundColor) ? backgroundColor : PLATFORM_DEFAULT.backgroundColor,
  };
}

/**
 * Builds the inline <style> that overrides the default (pink) theme with the
 * resolved salon's colors/font. Inlined in SSR <head> (not applied
 * client-side) to avoid a flash of the default theme. Every value is
 * strict-hex/allow-list validated here as a second guard, on top of write-time
 * validation, before it reaches this template string.
 */
function themeStyle(salon: SalonContext | null): string {
  const brand = salon && isValidHex(salon.brandColor) ? salon.brandColor : PLATFORM_DEFAULT.brandColor;
  const accent = salon && isValidHex(salon.accentColor) ? salon.accentColor : PLATFORM_DEFAULT.accentColor;
  const background =
    salon && isValidHex(salon.backgroundColor) ? salon.backgroundColor : PLATFORM_DEFAULT.backgroundColor;
  const fontVar = fontCssVar(salon?.fontKey ?? PLATFORM_DEFAULT.fontKey);

  return (
    `:root{` +
    `--color-brand:${brand};--color-brand-contrast:${contrastTextColor(brand)};` +
    `--color-accent:${accent};--color-accent-contrast:${contrastTextColor(accent)};` +
    `--background:${background};` +
    `--font-heading:var(${fontVar});--font-body:var(${fontVar});` +
    `}`
  );
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const salon = await getSalonFromContext();
  const displayName = salon?.name ?? BUSINESS_NAME;

  return (
    <html
      lang="en"
      className={`${fontVariableClassNames()} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyle(salon) }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-neutral-900">
        {/* Skip link: visually hidden until focused, lets keyboard users
            jump past the persistent header on every page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-contrast focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-soft"
        >
          Skip to main content
        </a>
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
          <nav
            aria-label="Primary"
            className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between"
          >
            <Link
              href="/"
              className="font-semibold tracking-tight flex items-center gap-2 min-w-0"
            >
              {salon?.logoUrl ? (
                <Image
                  src={salon.logoUrl}
                  alt={displayName}
                  width={160}
                  height={40}
                  className="h-8 w-auto max-w-[10rem] object-contain"
                  priority
                />
              ) : (
                <span className="truncate">{displayName}</span>
              )}
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/book" className="font-medium text-brand">
                Book
              </Link>
              <Link
                href="/admin"
                className="text-neutral-500 hover:text-neutral-900"
              >
                Admin
              </Link>
            </div>
          </nav>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 mx-auto w-full max-w-3xl px-4 py-6 focus:outline-none"
        >
          {children}
        </main>

        <footer className="border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-neutral-500 flex flex-wrap gap-x-6 gap-y-2 justify-between">
            <span>
              © {new Date().getFullYear()} {displayName}
            </span>
            <div className="flex gap-4">
              <Link href="/policies">Policies</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/cancellation-policy">Cancellation</Link>
            </div>
          </div>
        </footer>

        <Analytics />
      </body>
    </html>
  );
}
