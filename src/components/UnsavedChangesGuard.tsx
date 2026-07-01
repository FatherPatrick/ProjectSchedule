"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UnsavedChangesGuardProps {
  /** Optional message shown in the modal. */
  message?: string;
}

/**
 * Watches its enclosing `<form>` for any value changes and:
 *  - Asks the browser to confirm a refresh / tab-close (beforeunload).
 *  - Intercepts clicks on in-app `<a href>` links and shows a pretty
 *    "are you sure?" modal before allowing the navigation.
 *
 * Usage:
 *
 *   <form action={save}>
 *     <UnsavedChangesGuard />
 *     ...inputs...
 *   </form>
 *
 * The guard locates its parent form by walking up the DOM from a tiny
 * sentinel `<span>` it renders. This removes the by-`formId` coupling
 * the previous version had — there's no more `document.getElementById`
 * call, and the page no longer has to coordinate a unique ID between
 * the form and the guard. Render multiple guards in different forms on
 * the same page freely; each one only watches its own ancestor form.
 *
 * The form is considered "clean" again as soon as it is submitted.
 */
export function UnsavedChangesGuard({
  message = "You have unsaved changes. If you leave now, those changes will be lost.",
}: UnsavedChangesGuardProps) {
  const [dirty, setDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLSpanElement | null>(null);
  const initialSnapshot = useRef<string>("");

  const snapshotForm = useCallback((form: HTMLFormElement) => {
    const data = new FormData(form);
    const entries: [string, string][] = [];
    data.forEach((v, k) => entries.push([k, String(v)]));
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return JSON.stringify(entries);
  }, []);

  // Establish the initial snapshot once the sentinel is in the DOM.
  useEffect(() => {
    const form = sentinelRef.current?.closest("form");
    if (!form) {
      // Nothing to guard. The component was rendered outside a <form>;
      // log once so it's diagnosable but otherwise no-op.
      console.warn(
        "[UnsavedChangesGuard] No ancestor <form> found — guard is inert."
      );
      return;
    }
    initialSnapshot.current = snapshotForm(form);

    function recompute() {
      if (!form) return;
      const now = snapshotForm(form);
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
        if (form) initialSnapshot.current = snapshotForm(form);
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
  }, [snapshotForm]);

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

  // Sentinel marker so we can locate the enclosing <form> via ref.
  // It renders nothing visible and has no layout impact.
  const sentinel = (
    <span ref={sentinelRef} aria-hidden="true" style={{ display: "none" }} />
  );

  if (!pendingHref) return sentinel;

  return (
    <>
      {sentinel}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) cancelLeave();
        }}
      >
        <div className="w-full max-w-md rounded-2xl border border-brand-soft bg-white p-5 shadow-2xl">
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
              className="rounded-full bg-gradient-to-r from-brand-hover to-brand px-4 py-2 text-sm font-semibold text-brand-contrast shadow-sm hover:brightness-95"
            >
              Discard changes
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
