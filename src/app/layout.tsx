import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { BUSINESS_NAME } from "@/lib/config";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: BUSINESS_NAME,
    template: `%s · ${BUSINESS_NAME}`,
  },
  description: `Book your nail appointment at ${BUSINESS_NAME}.`,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdf2f8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-pink-50 text-neutral-900">
        {/* Skip link: visually hidden until focused, lets keyboard users
            jump past the persistent header on every page. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-pink-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-pink-300"
        >
          Skip to main content
        </a>
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-neutral-200">
          <nav
            aria-label="Primary"
            className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between"
          >
            <Link href="/" className="font-semibold tracking-tight">
              {BUSINESS_NAME}
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/book" className="font-medium text-pink-700">
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
              © {new Date().getFullYear()} {BUSINESS_NAME}
            </span>
            <div className="flex gap-4">
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
