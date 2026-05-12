"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UnsavedChangesGuardProps {
  /** id of the <form> to monitor for changes. */
  formId: string;
  /** Optional message shown in the modal. */
  message?: string;
}

/**
 * Watches a target form for any value changes and:
 *  - Asks the browser to confirm a refresh / tab-close (beforeunload).
 *  - Intercepts clicks on in-app <a href> links and shows a pretty
 *    "are you sure?" modal before allowing the navigation.
 *
 * The form is considered "clean" again as soon as it is submitted.
 */
export function UnsavedChangesGuard({
  formId,
  message = "You have unsaved changes. If you leave now, those changes will be lost.",
}: UnsavedChangesGuardProps) {
  const [dirty, setDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const initialSnapshot = useRef<string>("");

  const snapshotForm = useCallback((form: HTMLFormElement) => {
    const data = new FormData(form);
    const entries: [string, string][] = [];
    data.forEach((v, k) => entries.push([k, String(v)]));
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return JSON.stringify(entries);
  }, []);

  // Establish the initial snapshot once the form is in the DOM.
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    initialSnapshot.current = snapshotForm(form);

    function recompute() {
      const f = document.getElementById(formId) as HTMLFormElement | null;
      if (!f) return;
      const now = snapshotForm(f);
      setDirty((prev) => {
        const next = now !== initialSnapshot.current;
        return prev === next ? prev : next;
      });
    }
    function onSubmit() {
      // Treat submit as "saved" — clear dirty so the resulting navigation is
      // allowed without prompting.
      setDirty(false);
      // Update the baseline so a soft revalidation that re-renders the page
      // doesn't immediately re-flag dirty.
      requestAnimationFrame(() => {
        const f = document.getElementById(formId) as HTMLFormElement | null;
        if (f) initialSnapshot.current = snapshotForm(f);
      });
    }

    form.addEventListener("input", recompute);
    form.addEventListener("change", recompute);
    form.addEventListener("submit", onSubmit);

    // Some custom controls (e.g. styled <select> popups that write into a
    // hidden input) update value imperatively without firing an input/change
    // event the form can hear. Watch the DOM subtree for attribute mutations
    // on inputs as a safety net.
    const observer = new MutationObserver(recompute);
    observer.observe(form, {
      attributes: true,
      attributeFilter: ["value", "checked"],
      subtree: true,
      childList: true,
    });

    // Last-resort: a low-frequency poll catches anything the above misses
    // (e.g. controls that don't go through the DOM at all). 500ms is cheap.
    const intervalId = window.setInterval(recompute, 500);

    return () => {
      form.removeEventListener("input", recompute);
      form.removeEventListener("change", recompute);
      form.removeEventListener("submit", onSubmit);
      observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, [formId, snapshotForm]);

  // Browser-level guard for refresh / tab close / external nav.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Intercept clicks on anchors inside the document (covers <Link> in App
  // Router, since they render <a href>). We don't try to block router.push()
  // calls — those are rare in this admin UI.
  useEffect(() => {
    if (!dirty) return;
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      // Ignore in-page anchors and external/new-tab links.
      if (href.startsWith("#")) return;
      if (anchor.target && anchor.target !== "_self") return;
      // Same URL – nothing to navigate to.
      if (
        anchor.href ===
        window.location.origin + window.location.pathname + window.location.search
      ) {
        return;
      }
      e.preventDefault();
      setPendingHref(anchor.href);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  function confirmLeave() {
    const href = pendingHref;
    setPendingHref(null);
    setDirty(false); // bypass beforeunload for this navigation
    if (href) {
      // Use a microtask so beforeunload listener removal lands first.
      setTimeout(() => {
        window.location.href = href;
      }, 0);
    }
  }

  function cancelLeave() {
    setPendingHref(null);
  }

  if (!pendingHref) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancelLeave();
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-pink-200 bg-white p-5 shadow-2xl">
        <h2
          id="unsaved-title"
          className="text-lg font-semibold text-neutral-900"
        >
          Leave without saving?
        </h2>
        <p className="mt-2 text-sm text-neutral-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelLeave}
            className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Stay on page
          </button>
          <button
            type="button"
            onClick={confirmLeave}
            className="rounded-full bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-rose-600 hover:to-pink-700"
          >
            Discard changes
          </button>
        </div>
      </div>
    </div>
  );
}
