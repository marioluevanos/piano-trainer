import { useEffect, useRef } from "react";
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

export function ScoreView({ source, cursorStep, onReady, onError }: ScoreViewProps) {
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

    const osmd = new OpenSheetMusicDisplay(el, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: "#2dd4bf", alpha: 0.45, follow: true }],
    });
    osmdRef.current = osmd;

    osmd
      .load(source)
      .then(() => {
        if (disposed) return;
        osmd.render();
        osmd.cursor.show();
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

  return <div ref={containerRef} className="score" />;
}
