// @vitest-environment jsdom
/**
 * Behavioural tests for the admin tab bar's mobile scroll affordance.
 *
 * The chevrons are always in the DOM; visibility is driven by `tabIndex`
 * (and opacity) based on whether the scroller actually overflows. jsdom
 * reports 0 for every layout dimension, so we stub the scroller's
 * scrollWidth/clientWidth/scrollLeft and fire a `scroll` event to exercise
 * the real `updateHints` logic.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminNav from "@/app/admin/AdminNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/calendar" }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={typeof href === "string" ? href : ""} {...props}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  // AdminNav observes the scroller with a ResizeObserver, which jsdom lacks.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(cleanup);

function getScroller() {
  const nav = document.querySelector("nav");
  if (!nav) throw new Error("nav not found");
  return nav;
}

function setDims(
  el: Element,
  dims: { scrollWidth: number; clientWidth: number; scrollLeft: number }
) {
  Object.defineProperty(el, "scrollWidth", {
    configurable: true,
    value: dims.scrollWidth,
  });
  Object.defineProperty(el, "clientWidth", {
    configurable: true,
    value: dims.clientWidth,
  });
  Object.defineProperty(el, "scrollLeft", {
    configurable: true,
    writable: true,
    value: dims.scrollLeft,
  });
}

const rightChevron = () => screen.getByLabelText("Scroll tabs right");
const leftChevron = () => screen.getByLabelText("Scroll tabs left");

describe("AdminNav scroll chevrons", () => {
  it("hides both chevrons when the tabs fit (no overflow)", () => {
    render(<AdminNav />);
    expect(rightChevron().getAttribute("tabindex")).toBe("-1");
    expect(leftChevron().getAttribute("tabindex")).toBe("-1");
  });

  it("shows the right chevron when tabs overflow off the right edge", () => {
    render(<AdminNav />);
    setDims(getScroller(), { scrollWidth: 600, clientWidth: 200, scrollLeft: 0 });
    fireEvent.scroll(getScroller());

    expect(rightChevron().getAttribute("tabindex")).toBe("0");
    // Nothing is hidden to the left yet.
    expect(leftChevron().getAttribute("tabindex")).toBe("-1");
  });

  it("swaps to the left chevron once scrolled to the end", () => {
    render(<AdminNav />);
    // Scrolled fully right: scrollLeft + clientWidth === scrollWidth.
    setDims(getScroller(), {
      scrollWidth: 600,
      clientWidth: 200,
      scrollLeft: 400,
    });
    fireEvent.scroll(getScroller());

    expect(leftChevron().getAttribute("tabindex")).toBe("0");
    expect(rightChevron().getAttribute("tabindex")).toBe("-1");
  });

  it("scrolls the strip when a chevron is clicked", () => {
    render(<AdminNav />);
    const scroller = getScroller();
    setDims(scroller, { scrollWidth: 600, clientWidth: 200, scrollLeft: 0 });
    fireEvent.scroll(scroller);

    const scrollBy = vi.fn();
    (scroller as unknown as { scrollBy: typeof scrollBy }).scrollBy = scrollBy;
    fireEvent.click(rightChevron());

    expect(scrollBy).toHaveBeenCalledWith({ left: 140, behavior: "smooth" });
  });
});
