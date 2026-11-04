/**
 * Customizable <select> lists (Chromium 135+): dark panel, roomy touch-sized options, a check on the
 * chosen one. Browsers without support ignore the whole block and keep the native list.
 * Injected as a plain <style> (see layout.tsx) because the CSS build drops ::picker() rules.
 */
export const SELECT_CSS = `@supports (appearance: base-select) {
  select,
  ::picker(select) {
    appearance: base-select;
  }
  select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    text-align: start;
    cursor: pointer;
  }
  select::picker-icon {
    color: var(--accent);
    transition: rotate 150ms ease-out;
  }
  select:open::picker-icon {
    rotate: 180deg;
  }
  select:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
  ::picker(select) {
    min-inline-size: anchor-size(width);
    max-block-size: min(20rem, 60dvh);
    margin-block: 0.375rem;
    padding: 0.375rem;
    border: 1px solid color-mix(in srgb, var(--primary) 55%, transparent);
    border-radius: 1rem;
    background: var(--surface);
    box-shadow:
      0 12px 32px -8px rgb(0 0 0 / 0.7),
      0 0 0 1px rgb(0 0 0 / 0.2);
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity 150ms ease-out,
      transform 150ms ease-out,
      display 150ms allow-discrete,
      overlay 150ms allow-discrete;
  }
  @starting-style {
    ::picker(select):popover-open {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-block-size: 2.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.75rem;
    font-size: 0.9375rem;
    cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  option:hover,
  option:focus-visible {
    background: var(--neutral-bg);
    outline: none;
  }
  option:checked {
    background: color-mix(in srgb, var(--primary) 22%, transparent);
    color: var(--accent);
    font-weight: 600;
  }
  option::checkmark {
    order: 1;
    margin-inline-start: auto;
    color: var(--accent);
  }
  option:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
@media (prefers-reduced-motion: reduce) {
  ::picker(select),
  select::picker-icon,
  option {
    transition: none;
  }
}
`;
