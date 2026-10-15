import { useEffect } from "react";

/** Largest share of the viewport the phone's chart card may take. */
const MAX_SHARE = 0.5;

/** CSS variable on the pane: the height the chart card adds to its base. */
export const CHART_EXTRA_VAR = "--chart-extra";

/**
 * On a phone the free height of the features pane goes to the chart card.
 * The free height is measured with the chart's current growth taken out
 * again, so applying it does not change the next measurement (no
 * oscillation). The river-state slot keeps its minimum height.
 */
export function useChartGrow(pane: HTMLElement | null, enabled: boolean) {
  useEffect(() => {
    if (!pane) return;
    if (!enabled) {
      pane.style.removeProperty(CHART_EXTRA_VAR);
      return;
    }
    let current = 0;
    const observed = new Set<Element>();
    const measure = () => {
      const chart = pane.querySelector<HTMLElement>(
        '[data-testid="chart-card"]',
      );
      const slot = pane.querySelector<HTMLElement>(
        '[data-testid="river-state-slot"]',
      );
      let next = 0;
      if (chart && slot) {
        const style = getComputedStyle(pane);
        const slotMin =
          Number.parseFloat(getComputedStyle(slot).minHeight) || 0;
        const top = pane.getBoundingClientRect().top - pane.scrollTop;
        let bottom = 0;
        for (const el of Array.from(pane.children)) {
          if (el === slot) continue;
          bottom = Math.max(bottom, el.getBoundingClientRect().bottom - top);
        }
        const used =
          bottom + slotMin + (Number.parseFloat(style.paddingBottom) || 0);
        const free = pane.clientHeight - used + current;
        const base = chart.offsetHeight - current;
        const cap = window.innerHeight * MAX_SHARE - base;
        next = Math.max(0, Math.floor(Math.min(free, cap)));
      }
      if (next !== current) {
        current = next;
        pane.style.setProperty(CHART_EXTRA_VAR, `${next}px`);
      }
      for (const el of [pane, ...Array.from(pane.children)]) {
        if (observed.has(el)) continue;
        observed.add(el);
        ro.observe(el);
      }
    };
    const ro = new ResizeObserver(measure);
    const mo = new MutationObserver(measure);
    mo.observe(pane, { childList: true });
    measure();
    return () => {
      ro.disconnect();
      mo.disconnect();
      pane.style.removeProperty(CHART_EXTRA_VAR);
    };
  }, [pane, enabled]);
}
