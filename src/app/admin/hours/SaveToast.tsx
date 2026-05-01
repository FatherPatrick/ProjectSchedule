"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type SaveStatus = "success" | "error";

export default function SaveToast({ status }: { status: SaveStatus }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const hideTimer = window.setTimeout(() => setVisible(false), 4000);
    const clearParamTimer = window.setTimeout(() => {
      router.replace("/admin/hours", { scroll: false });
    }, 4300);

    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(clearParamTimer);
    };
  }, [router]);

  if (!visible) return null;

  const isSuccess = status === "success";

  return (
    <div className="fixed right-4 top-4 z-50">
      <div
        role="status"
        aria-live="polite"
        className={[
          "rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition",
          isSuccess
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-red-200 bg-red-50 text-red-900",
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium">
            {isSuccess ? "Hours saved successfully." : "Could not save hours."}
          </p>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="text-xs underline underline-offset-2"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
