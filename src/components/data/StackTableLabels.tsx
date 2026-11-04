"use client";

import * as React from "react";

/**
 * On phones a wide table is shown as one card per row (see `.stack-table` in globals.css), and each
 * value needs the name of its column beside it. This copies every header cell's text onto the matching
 * body cells as `data-label`. A table is opted in by putting `stack-table` on the element that wraps it.
 *
 * It only touches a cell after React has hydrated it (React tags hydrated nodes with a `__reactFiber$…`
 * key). An attribute added earlier would not be in the server HTML and React would report a hydration
 * mismatch. Hydration of a streamed section has no event to wait for, so it checks again every 250 ms
 * while any labelled cell is still waiting, and stops when there is nothing left to do.
 */
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

function labelTables(): boolean {
  let waiting = false;
  for (const table of document.querySelectorAll<HTMLTableElement>(".stack-table table")) {
    const heads = Array.from(
      table.querySelectorAll("thead th"),
      (th) => th.textContent?.trim() ?? "",
    );
    for (const row of table.querySelectorAll("tbody tr")) {
      Array.from(row.children).forEach((cell, i) => {
        const text = heads[i];
        if (!text || cell.getAttribute("data-label") === text) return;
        if (hydrated(cell)) cell.setAttribute("data-label", text);
        else waiting = true;
      });
    }
  }
  return waiting;
}

export function StackTableLabels() {
  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const run = () => {
      if (labelTables()) timer ??= setInterval(run, 250);
      else if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    run();
    // New rows or tables (a page change, a refresh) start the check again.
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }, []);
  return null;
}
