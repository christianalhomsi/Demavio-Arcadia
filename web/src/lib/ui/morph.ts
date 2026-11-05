"use client";

/**
 * "Button to panel": a panel (dialog, sheet, dropdown, calendar) grows out of the button that opened
 * it and shrinks back into it on close. The last pressed button's box is recorded in the capture
 * phase of every click, so no trigger has to be wired up; a panel claims it as it mounts. The motion
 * itself is CSS (see globals.css) using three variables set here: where the button is relative to the
 * panel, and how small the panel starts. It uses transform and opacity only.
 */

let last: { rect: DOMRect; at: number } | null = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest("button, a, summary, [role='button'], [role='tab']");
      if (el) last = { rect: el.getBoundingClientRect(), at: performance.now() };
    },
    true,
  );
}

/** The button pressed just now (within 600 ms), once; null when the panel was not opened by a press. */
export function takeMorphOrigin(): DOMRect | null {
  if (!last || performance.now() - last.at > 600) return null;
  const rect = last.rect;
  last = null;
  return rect;
}

/**
 * Prepares a panel that carries `data-morph="pending"`: measures it where it will rest, then turns
 * the motion on ("on") or leaves the panel's ordinary entrance ("off") when there is no button to
 * grow from or the user asked for reduced motion. Safe to call twice (React strict mode).
 */
export function applyMorph(el: HTMLElement, origin: DOMRect | null): void {
  if (el.dataset.morph !== "pending") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const to = el.getBoundingClientRect();
  if (!origin || reduce || origin.width < 1 || origin.height < 1 || to.width < 1) {
    el.dataset.morph = "off";
    return;
  }
  const dx = origin.left + origin.width / 2 - (to.left + to.width / 2);
  const dy = origin.top + origin.height / 2 - (to.top + to.height / 2);
  el.style.setProperty("--mx", `${dx}px`);
  el.style.setProperty("--my", `${dy}px`);
  el.style.setProperty("--ms", String(Math.min(0.5, Math.max(0.12, origin.width / to.width))));
  el.dataset.morph = "on";
}

/**
 * Ref callback for a panel that mounts when it opens (render it with `data-morph="pending"`). A
 * callback ref, because the element of a portal exists only after the component first renders. It
 * is a stable function, so React does not call it again on re-renders.
 */
export function morphRef(el: HTMLElement | null): void {
  if (el && el.dataset.morph === "pending") applyMorph(el, takeMorphOrigin());
}
