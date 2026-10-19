import { useEffect, useRef, useState, type ReactNode } from "react";

/** A sliders button that opens a popover panel holding the less frequently used controls. */
export function SettingsMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on a tap outside the menu or on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="settings" ref={rootRef}>
      <button
        className={`icon-button${open ? " active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="More settings"
        aria-expanded={open}
        title="More settings"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M3 17v2h6v-2H3ZM3 5v2h10V5H3Zm10 16v-2h8v-2h-8v-2h-2v6h2ZM7 9v2H3v2h4v2h2V9H7Zm14 4v-2H11v2h10Zm-6-4h2V7h4V5h-4V3h-2v6Z"
          />
        </svg>
      </button>
      {open && (
        <div className="settings-panel" role="dialog" aria-label="Settings">
          {children}
        </div>
      )}
    </div>
  );
}
