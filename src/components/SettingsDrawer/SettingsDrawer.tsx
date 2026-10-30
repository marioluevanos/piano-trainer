import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "../Button/Button";
import { CloseIcon } from "../Icons/CloseIcon";
import "./SettingsDrawer.css";

/** The drawer's two tabs: what changes every session, and what is set once. */
export type SettingsTab = "practice" | "display";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "practice", label: "Practice" },
  { id: "display", label: "Display & Sound" },
];

interface Props {
  open: boolean;
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  /** The Practice tab's contents. */
  practice: ReactNode;
  /** The Display & Sound tab's contents. */
  display: ReactNode;
}

/**
 * The settings, in a drawer along the right edge so the score stays legible
 * while a loop is set. Tapping the scrim, the close button or Escape closes it.
 */
export function SettingsDrawer({
  open,
  tab,
  onTabChange,
  onClose,
  practice,
  display,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<Element | null>(null);

  // Escape closes; focus moves into the drawer and back to the opener after.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-drawer-title"
      >
        <header className="drawer-header">
          <h2 id="settings-drawer-title">Settings</h2>
          <Button
            ref={closeRef}
            icon
            variant="ghost"
            size="lg"
            onClick={onClose}
            aria-label="Close settings"
            title="Close"
          >
            <CloseIcon size={24} />
          </Button>
        </header>
        <div className="drawer-tabs" role="tablist" aria-label="Settings">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className={`drawer-tab${tab === t.id ? " selected" : ""}`}
              onClick={() => onTabChange(t.id)}
              onKeyDown={(e) => {
                // Arrow keys move between the tabs.
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const i = TABS.findIndex((x) => x.id === tab);
                const next =
                  TABS[
                    (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) %
                      TABS.length
                  ];
                onTabChange(next.id);
                document.getElementById(`settings-tab-${next.id}`)?.focus();
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          className="drawer-body"
          role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
        >
          {tab === "practice" ? practice : display}
        </div>
      </aside>
    </div>
  );
}

/** A group of settings with a small caps heading, e.g. KEYBOARD. */
export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-group">
      <h3 className="settings-group-title">{title}</h3>
      <div className="settings-list">{children}</div>
    </section>
  );
}
