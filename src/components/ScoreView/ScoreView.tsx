import { useEffect, useRef, useState } from "react";
import {
  OpenSheetMusicDisplay,
  PointF2D,
  type GraphicalMeasure,
} from "opensheetmusicdisplay";
import { buildSteps } from "../../score/buildSteps";
import { Button } from "../Button/Button";
import { createSmoothScroller, type SmoothScroller } from "./smoothScroller";
import type { EndingSet, LoopRange, Step } from "../../engine/types";
import { InfoIcon } from "../Icons/InfoIcon";
import "./ScoreView.css";

/** Where a click landed on the score. */
export interface ScoreClick {
  /** Source measure index. */
  measure: number;
  /** Absolute timestamp (whole notes) of the note nearest the click, or null if the measure has no notes. */
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
  /** Whether the score area uses the dark palette; the notation is redrawn when it changes. */
  dark?: boolean;
  /** The loop to shade on the score, or null for none. */
  loop?: LoopRange | null;
  onReady: (info: ScoreInfo) => void;
  /** Called with the source measure index when the user clicks a measure. */
  /** Called when the user clicks the score, with the measure and note clicked. */
  onScoreClick?: (target: ScoreClick) => void;
  onError?: (message: string) => void;
}

export function ScoreView({
  source,
  cursorStep,
  dark = false,
  loop = null,
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
  const loopLayerRef = useRef<HTMLDivElement>(null);
  const [loopBands, setLoopBands] = useState<LoopBand[]>([]);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const measureLoopRef = useRef(() => {});
  measureLoopRef.current = () => {
    const osmd = osmdRef.current;
    const layer = loopLayerRef.current;
    const current = loopRef.current;
    setLoopBands(
      osmd && layer && readyRef.current && current
        ? loopBandsFor(osmd, current, layer)
        : [],
    );
  };

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
    osmd.EngravingRules.PageBottomMargin = 1;
    osmd.EngravingRules.PageLeftMargin = 2;
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
        measureLoopRef.current();
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

  // Redraw in the new colors when the dark score setting changes. The parent's
  // class has already switched, so --score-text holds the new color.
  // render() keeps the cursor where it was.
  useEffect(() => {
    const osmd = osmdRef.current;
    const el = containerRef.current;
    if (!osmd || !el || !readyRef.current) return;
    applyScoreColors(osmd, el);
    osmd.render();
  }, [dark]);

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
  // when the phone rotates.
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

  // Shade the loop. OSMD redraws the whole SVG on every render (resizing,
  // rotating, zooming, a color scheme change), so the bands are measured again
  // whenever the score's DOM changes, once per frame at most.
  useEffect(() => {
    measureLoopRef.current();
  }, [loop]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measureLoopRef.current());
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
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
            <InfoIcon size={18} />
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
      {/* Before the score so the notes paint over the shading. */}
      <div ref={loopLayerRef} className="score-loop" aria-hidden="true">
        {loopBands.map((b, i) => (
          <div
            key={i}
            className={`score-loop-band${b.start ? " start" : ""}${b.end ? " end" : ""}`}
            style={{
              left: b.left,
              top: b.top,
              width: b.width,
              height: b.height,
            }}
          />
        ))}
      </div>
      <div ref={containerRef} className="score" onClick={handleClick} />
    </>
  );
}

/**
 * Screens that get the single horizontal line instead of wrapped systems:
 * phones held in landscape. Portrait phones and tablets keep the page layout.
 */
const HORIZONTAL_QUERY =
  "(pointer: coarse) and (orientation: landscape) and (max-height: 600px)";

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

/** Colors the notation with --score-text, which follows the dark score setting. */
function applyScoreColors(osmd: OpenSheetMusicDisplay, el: HTMLElement) {
  const color = getComputedStyle(el).getPropertyValue("--score-text").trim();
  osmd.setOptions({ defaultColorMusic: color });
}

/** Extra hit area above and below each system, in OSMD units (10px each). */
const SYSTEM_PADDING = 2;

/**
 * Measure and note under a click, or null. A measure spans every staff of its
 * system, so clicks between the treble and bass staves count too. The click
 * snaps to the nearest note in the measure by horizontal position, so a finger
 * that lands between notes, or above or below a chord, still selects one.
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

/** One shaded rectangle of the loop, in px from the loop layer's origin. */
interface LoopBand {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Holds the loop's first note, so it gets the start edge. */
  start: boolean;
  /** Holds the loop's last note, so it gets the end edge. */
  end: boolean;
}

/** How far the shading reaches past the staves and notes, in OSMD units. */
const LOOP_PADDING_Y = 2;
// Half the width of OSMD's cursor, so a mid-measure edge clears the cursor on its note.
const LOOP_PADDING_X = 1.5;
const TIMESTAMP_EPSILON = 1e-6;

/**
 * The loop's shading: one band per system line it covers, spanning every
 * staff, with the first and last measures trimmed to the loop's start and end
 * notes when it starts or ends mid-measure. Positions come from OSMD's layout,
 * so this must run again after every render.
 */
function loopBandsFor(
  osmd: OpenSheetMusicDisplay,
  loop: LoopRange,
  layer: HTMLElement,
): LoopBand[] {
  const sheet = osmd.GraphicSheet;
  const origin = layer.getBoundingClientRect();
  // OSMD units are 10 SVG units; the SVG's own transform handles zoom and scroll.
  const toLayer = (x: number, y: number) => {
    const p = sheet.svgToDom(new PointF2D(x * 10, y * 10));
    return { x: p.x - origin.left, y: p.y - origin.top };
  };

  type Box = { left: number; right: number; top: number; bottom: number };
  const boxes: (Box & { system: unknown; start: boolean; end: boolean })[] = [];
  for (const staffMeasures of sheet.MeasureList) {
    const measures = staffMeasures.filter((gm): gm is GraphicalMeasure => !!gm);
    if (measures.length === 0) continue;
    const index = measures[0].parentSourceMeasure.measureListIndex;
    if (index < loop.startMeasure || index > loop.endMeasure) continue;

    const box: Box = {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    };
    for (const gm of measures) {
      const shape = gm.PositionAndShape;
      const pos = shape.AbsolutePosition;
      // Skip a clef, key or time signature drawn at the start of the measure.
      box.left = Math.min(
        box.left,
        pos.x + shape.BorderLeft + gm.beginInstructionsWidth,
      );
      box.right = Math.max(box.right, pos.x + shape.BorderRight);
      box.top = Math.min(box.top, pos.y + shape.BorderTop);
      box.bottom = Math.max(box.bottom, pos.y + shape.BorderBottom);
    }
    // beginInstructionsWidth can overshoot, e.g. with a start repeat after the
    // clef, so never let the band begin past the measure's first note.
    const first = entryEdge(measures, () => true);
    if (first !== null) box.left = Math.min(box.left, first - LOOP_PADDING_X);
    // A mid-measure start begins just before its note; a mid-measure end stops
    // just before the note that follows it.
    if (index === loop.startMeasure && loop.startTimestamp !== undefined) {
      const at = loop.startTimestamp;
      const left = entryEdge(
        measures,
        (t) => Math.abs(t - at) < TIMESTAMP_EPSILON,
      );
      if (left !== null) box.left = left - LOOP_PADDING_X;
    }
    if (index === loop.endMeasure && loop.endTimestamp !== undefined) {
      const at = loop.endTimestamp;
      const right = entryEdge(measures, (t) => t > at + TIMESTAMP_EPSILON);
      if (right !== null) box.right = right - LOOP_PADDING_X;
    }
    boxes.push({
      ...box,
      system: measures[0].ParentMusicSystem,
      start: index === loop.startMeasure,
      end: index === loop.endMeasure,
    });
  }

  // Measures side by side on one system line merge into a single band.
  const merged: typeof boxes = [];
  for (const b of boxes) {
    const last = merged[merged.length - 1];
    if (last && last.system === b.system) {
      last.right = b.right;
      last.top = Math.min(last.top, b.top);
      last.bottom = Math.max(last.bottom, b.bottom);
      last.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }

  return merged.map((b) => {
    const topLeft = toLayer(b.left, b.top - LOOP_PADDING_Y);
    const bottomRight = toLayer(b.right, b.bottom + LOOP_PADDING_Y);
    return {
      left: topLeft.x,
      top: topLeft.y,
      width: Math.max(0, bottomRight.x - topLeft.x),
      height: Math.max(0, bottomRight.y - topLeft.y),
      start: b.start,
      end: b.end,
    };
  });
}

/**
 * X, across a measure's staves, of the first note whose timestamp matches. This
 * is the anchor OSMD centers its cursor on; a staff entry's BorderLeft does not
 * follow the note, so it is not used.
 */
function entryEdge(
  measures: GraphicalMeasure[],
  matches: (timestamp: number) => boolean,
): number | null {
  let best: { timestamp: number; left: number } | null = null;
  for (const gm of measures) {
    for (const entry of gm.staffEntries) {
      const timestamp = entry.getAbsoluteTimestamp().RealValue;
      if (!matches(timestamp)) continue;
      const left = entry.PositionAndShape.AbsolutePosition.x;
      if (
        !best ||
        timestamp < best.timestamp - TIMESTAMP_EPSILON ||
        (Math.abs(timestamp - best.timestamp) < TIMESTAMP_EPSILON &&
          left < best.left)
      ) {
        best = { timestamp, left };
      }
    }
  }
  return best?.left ?? null;
}

/** Absolute timestamp of the note nearest to x across a measure's staves, or null for an empty measure. */
function noteAt(staffMeasures: GraphicalMeasure[], x: number): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
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
