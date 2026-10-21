import { useEffect, useRef, useState } from "react";
import {
  OpenSheetMusicDisplay,
  PointF2D,
  type GraphicalMeasure,
} from "opensheetmusicdisplay";
import { buildSteps } from "../../score/buildSteps";
import { Button } from "../Button/Button";
import { createSmoothScroller, type SmoothScroller } from "./smoothScroller";
import type { EndingSet, Step } from "../../engine/types";
import "./ScoreView.css";

/** Where a click landed on the score. */
export interface ScoreClick {
  /** Source measure index. */
  measure: number;
  /** Absolute timestamp (whole notes) of the clicked note, or null if the click missed every note. */
  timestamp: number | null;
}

export interface ScoreInfo {
  steps: Step[];
  measureCount: number;
  /** The alternate endings of each repeat that has more than one. */
  endings: EndingSet[];
  title: string;
}

interface ScoreViewProps {
  /** Resolves to MusicXML text, or a Blob holding a compressed .mxl file. */
  source: Promise<string | Blob>;
  /** Step whose notes the cursor should highlight. */
  cursorStep: number;
  onReady: (info: ScoreInfo) => void;
  /** Called with the source measure index when the user clicks a measure. */
  /** Called when the user clicks the score, with the measure and note clicked. */
  onScoreClick?: (target: ScoreClick) => void;
  onError?: (message: string) => void;
}

export function ScoreView({
  source,
  cursorStep,
  onReady,
  onScoreClick,
  onError,
}: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorPosRef = useRef(0);
  const scrollerRef = useRef<SmoothScroller | null>(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onScoreClickRef = useRef(onScoreClick);
  onScoreClickRef.current = onScoreClick;
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
    // Step the iterator directly and redraw once at the end. cursor.next()
    // redraws and scrolls on every call, which stalls the page on long jumps
    // such as a loop wrapping back to its start.
    const from = pos;
    while (pos < target && !cursor.Iterator.EndReached) {
      cursor.Iterator.moveToNextVisibleVoiceEntry(false);
      pos++;
    }
    if (pos !== from) cursor.update();
    const moved = pos !== cursorPosRef.current;
    cursorPosRef.current = pos;
    if (moved) followCursor();
  };

  /** In the horizontal layout, eases the score area to keep the cursor in view. */
  const followCursor = () => {
    const osmd = osmdRef.current;
    if (!osmd?.EngravingRules.RenderSingleHorizontalStaffline) return;
    scrollerRef.current?.follow(osmd.cursor.cursorElement);
  };

  /** Lets OSMD scroll to the cursor only in the page layout; the horizontal one eases instead. */
  const updateFollowMode = (osmd: OpenSheetMusicDisplay) => {
    osmd.FollowCursor = !osmd.EngravingRules.RenderSingleHorizontalStaffline;
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
      // Phones get one long line that scrolls sideways, so the next measures
      // are always in view ahead of the cursor.
      renderSingleHorizontalStaffline:
        window.matchMedia(HORIZONTAL_QUERY).matches,
      followCursor: true,
      cursorsOptions: [{ type: 0, color: accent, alpha: 0.45, follow: true }],
    });
    // OSMD's default page margins are 5 units (50px) per side, which wastes a
    // third of a phone's width. The .score padding already keeps notes off the edge.
    osmd.EngravingRules.PageTopMargin = 1;
    osmd.EngravingRules.PageLeftMargin = 4;
    osmd.EngravingRules.PageRightMargin = 1;
    osmdRef.current = osmd;

    source
      .then((data) => (disposed ? undefined : osmd.load(data)))
      .then(() => {
        if (disposed) return;
        applyScoreColors(osmd, el);
        updateFollowMode(osmd);
        osmd.render();
        fitToHeight(osmd, el);
        osmd.cursor.show();
        followCursor();
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
          endings: osmd.Sheet.Repetitions.map((r) =>
            r.EndingParts.map((p) => ({
              start: p.part.startIndex,
              end: p.part.endIndex,
            })),
          ).filter((set) => set.length > 1),
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

  const handleClick = (e: React.MouseEvent) => {
    const osmd = osmdRef.current;
    if (!osmd || !readyRef.current || !onScoreClickRef.current) return;
    const target = clickTarget(osmd, e.clientX, e.clientY);
    if (target) onScoreClickRef.current(target);
  };

  // Redraw in the new colors when the system switches between light and dark.
  // render() keeps the cursor where it was.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const osmd = osmdRef.current;
      const el = containerRef.current;
      if (!osmd || !el || !readyRef.current) return;
      applyScoreColors(osmd, el);
      osmd.render();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Switch between the horizontal and page layouts when the screen changes,
  // e.g. a tablet rotating or a desktop window narrowing to phone size.
  useEffect(() => {
    const query = window.matchMedia(HORIZONTAL_QUERY);
    const onChange = () => {
      const osmd = osmdRef.current;
      if (!osmd || !readyRef.current) return;
      osmd.setOptions({ renderSingleHorizontalStaffline: query.matches });
      updateFollowMode(osmd);
      osmd.render();
      fitToHeight(osmd, containerRef.current);
      osmd.cursor.update();
      followCursor();
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Refit the horizontal line when the score area changes height, e.g. when
  // the phone rotates or the toolbar opens.
  useEffect(() => {
    const area = containerRef.current?.parentElement;
    if (!area) return;
    const observer = new ResizeObserver(() => {
      const osmd = osmdRef.current;
      if (!osmd || !readyRef.current) return;
      if (fitToHeight(osmd, containerRef.current)) {
        osmd.cursor.update();
        followCursor();
      }
    });
    observer.observe(area);
    scrollerRef.current = createSmoothScroller(area);
    return () => {
      observer.disconnect();
      scrollerRef.current?.dispose();
      scrollerRef.current = null;
    };
  }, []);

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
          <Button
            className="score-info-button"
            size="xs"
            icon
            round
            active={infoOpen}
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
          </Button>
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
      <div ref={containerRef} className="score" onClick={handleClick} />
    </>
  );
}

/**
 * Screens that get the single horizontal line instead of wrapped systems:
 * touch devices that are phone-sized in either orientation.
 */
const HORIZONTAL_QUERY =
  "(pointer: coarse) and (max-width: 600px), (pointer: coarse) and (max-height: 600px)";

/**
 * In the horizontal layout, zooms the score so its single line fills the
 * score area's height exactly, with no vertical scrolling. In the page layout
 * it restores the default zoom. Returns whether it re-rendered.
 */
function fitToHeight(
  osmd: OpenSheetMusicDisplay,
  el: HTMLElement | null,
): boolean {
  const area = el?.parentElement;
  const svg = el?.querySelector("svg");
  if (!area || !svg) return false;
  let zoom = 1;
  if (osmd.EngravingRules.RenderSingleHorizontalStaffline) {
    const height = svg.getBoundingClientRect().height;
    if (!height || !area.clientHeight) return false;
    zoom = (osmd.Zoom * area.clientHeight) / height;
  }
  // Skip tiny changes so a refit doesn't trigger another one.
  if (Math.abs(zoom - osmd.Zoom) < 0.01) return false;
  osmd.Zoom = zoom;
  osmd.render();
  return true;
}

/** Colors the notation with --score-text, which follows the system color scheme. */
function applyScoreColors(osmd: OpenSheetMusicDisplay, el: HTMLElement) {
  const color = getComputedStyle(el).getPropertyValue("--score-text").trim();
  osmd.setOptions({ defaultColorMusic: color });
}

/** Extra hit area above and below each system, in OSMD units (10px each). */
const SYSTEM_PADDING = 2;

/** How far left or right of a note's center a click still selects it, in OSMD units. */
const NOTE_HIT_RADIUS = 1.5;

/**
 * Measure and note under a click, or null. A measure spans every staff of its
 * system, so clicks between the treble and bass staves count too. The note is
 * matched by horizontal position only, so a click above or below a chord
 * still selects it.
 */
function clickTarget(
  osmd: OpenSheetMusicDisplay,
  clientX: number,
  clientY: number,
): ScoreClick | null {
  const sheet = osmd.GraphicSheet;
  const { x, y } = sheet.svgToOsmd(
    sheet.domToSvg(new PointF2D(clientX, clientY)),
  );
  for (const staffMeasures of sheet.MeasureList) {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    let index: number | null = null;
    for (const gm of staffMeasures) {
      if (!gm) continue;
      const box = gm.PositionAndShape;
      const pos = box.AbsolutePosition;
      left = Math.min(left, pos.x + box.BorderLeft);
      right = Math.max(right, pos.x + box.BorderRight);
      top = Math.min(top, pos.y + box.BorderTop);
      bottom = Math.max(bottom, pos.y + box.BorderBottom);
      index = gm.parentSourceMeasure.measureListIndex;
    }
    if (
      index !== null &&
      x >= left &&
      x <= right &&
      y >= top - SYSTEM_PADDING &&
      y <= bottom + SYSTEM_PADDING
    ) {
      return { measure: index, timestamp: noteAt(staffMeasures, x) };
    }
  }
  return null;
}

/** Absolute timestamp of the note nearest to x across a measure's staves, if close enough. */
function noteAt(staffMeasures: GraphicalMeasure[], x: number): number | null {
  let best: number | null = null;
  let bestDistance = NOTE_HIT_RADIUS;
  for (const gm of staffMeasures) {
    for (const entry of gm?.staffEntries ?? []) {
      const box = entry.PositionAndShape;
      const center =
        box.AbsolutePosition.x + (box.BorderLeft + box.BorderRight) / 2;
      const distance = Math.abs(center - x);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = entry.getAbsoluteTimestamp().RealValue;
      }
    }
  }
  return best;
}
