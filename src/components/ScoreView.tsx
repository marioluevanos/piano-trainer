import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { buildSteps } from "../score/buildSteps";
import type { Step } from "../engine/types";

export interface ScoreInfo {
  steps: Step[];
  measureCount: number;
  title: string;
}

interface ScoreViewProps {
  /** MusicXML text, or a Blob holding a compressed .mxl file. */
  source: string | Blob;
  /** Step whose notes the cursor should highlight. */
  cursorStep: number;
  onReady: (info: ScoreInfo) => void;
  onError?: (message: string) => void;
}

export function ScoreView({
  source,
  cursorStep,
  onReady,
  onError,
}: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorPosRef = useRef(0);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const cursorStepRef = useRef(cursorStep);
  cursorStepRef.current = cursorStep;
  const infoRef = useRef<HTMLDivElement>(null);
  const [credits, setCredits] = useState<string[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);

  const syncCursor = () => {
    const osmd = osmdRef.current;
    if (!osmd || !readyRef.current) return;
    const target = cursorStepRef.current;
    const cursor = osmd.cursor;
    let pos = cursorPosRef.current;
    if (target < pos) {
      cursor.reset();
      pos = 0;
    }
    while (pos < target && !cursor.Iterator.EndReached) {
      cursor.next();
      pos++;
    }
    cursorPosRef.current = pos;
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let disposed = false;
    readyRef.current = false;
    setCredits([]);
    setInfoOpen(false);

    const accent = getComputedStyle(el).getPropertyValue("--accent").trim();
    const osmd = new OpenSheetMusicDisplay(el, {
      autoResize: true,
      backend: "svg",
      // Credits are shown in the info popover instead, to save vertical space.
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawCredits: false,
      drawPartNames: false,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: accent, alpha: 0.45, follow: true }],
    });
    osmdRef.current = osmd;

    osmd
      .load(source)
      .then(() => {
        if (disposed) return;
        osmd.render();
        osmd.cursor.show();
        const sheet = osmd.Sheet;
        setCredits(
          [
            sheet.TitleString,
            sheet.SubtitleString,
            sheet.ComposerString,
            sheet.LyricistString,
          ].filter((line): line is string => !!line?.trim()),
        );
        const steps = buildSteps(osmd);
        cursorPosRef.current = 0;
        readyRef.current = true;
        syncCursor();
        onReadyRef.current({
          steps,
          measureCount: osmd.Sheet.SourceMeasures.length,
          title: osmd.Sheet.TitleString ?? "",
        });
      })
      .catch((err: unknown) => {
        if (disposed) return;
        onErrorRef.current?.(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      osmdRef.current = null;
      el.innerHTML = "";
    };
  }, [source]);

  // Move the visual cursor to the requested step.
  useEffect(() => {
    syncCursor();
  }, [cursorStep]);

  // Close the info popover on outside press or Escape.
  useEffect(() => {
    if (!infoOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setInfoOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [infoOpen]);

  return (
    <>
      {credits.length > 0 && (
        <div className="score-info" ref={infoRef}>
          <button
            className={`score-info-button${infoOpen ? " active" : ""}`}
            onClick={() => setInfoOpen((o) => !o)}
            aria-label="Song info"
            aria-expanded={infoOpen}
            title="Song info"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z"
              />
            </svg>
          </button>
          {infoOpen && (
            <div
              className="score-info-panel"
              role="dialog"
              aria-label="Song info"
            >
              {credits.map((line, i) =>
                i === 0 ? <h2 key={i}>{line}</h2> : <p key={i}>{line}</p>,
              )}
            </div>
          )}
        </div>
      )}
      <div ref={containerRef} className="score" />
    </>
  );
}
