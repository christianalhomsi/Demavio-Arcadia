"use client";

import * as React from "react";

/**
 * Lifts bottom-anchored UI above the on-screen keyboard. While mounted it publishes two CSS variables on
 * <html>: `--kb-inset` (height of the keyboard covering the layout viewport) and `--vvh` (visible height).
 * It also scrolls the focused field into view once the keyboard has finished opening.
 */
export function useKeyboardInset(active = true) {
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const root = document.documentElement;
    let timer: number | undefined;

    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty("--kb-inset", `${inset}px`);
      root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    };
    const reveal = () => {
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]")) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    const onResize = () => {
      update();
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, 120);
    };
    const onFocusIn = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, 350); // after the keyboard animation
    };

    update();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.clearTimeout(timer);
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--vvh");
    };
  }, [active]);
}
