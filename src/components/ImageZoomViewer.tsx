import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImageZoomViewerProps {
  images: string[];
  index: number;
  alt: string;
  open: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 300;
const SWIPE_PX = 60;

type Point = { x: number; y: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Full-screen product photo viewer with pinch / double-tap / mouse-wheel zoom,
 * drag to pan and swipe between photos. The app viewport disables browser
 * zoom (user-scalable=no), so zooming is handled here.
 */
export function ImageZoomViewer({ images, index, alt, open, onClose, onIndexChange }: ImageZoomViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);

  // Live gesture state kept in refs so pointer handlers never read stale values.
  const scaleRef = useRef(1);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ startScale: number; startOffset: Point; startDist: number; startMid: Point; startPoint: Point; moved: boolean } | null>(null);
  const lastTap = useRef<{ time: number; point: Point } | null>(null);

  const count = images.length;

  // Point relative to the centre of the viewer (the transform origin).
  const toCentre = useCallback((clientX: number, clientY: number): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }, []);

  const apply = useCallback((nextScale: number, nextOffset: Point, smooth = false) => {
    const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const rect = containerRef.current?.getBoundingClientRect();
    const maxX = rect ? ((s - 1) * rect.width) / 2 : 0;
    const maxY = rect ? ((s - 1) * rect.height) / 2 : 0;
    const o = s === 1 ? { x: 0, y: 0 } : { x: clamp(nextOffset.x, -maxX, maxX), y: clamp(nextOffset.y, -maxY, maxY) };
    scaleRef.current = s;
    offsetRef.current = o;
    setAnimate(smooth);
    setScale(s);
    setOffset(o);
  }, []);

  // Zoom so the image point under `at` stays under `at`.
  const zoomAt = useCallback(
    (nextScale: number, at: Point, smooth = false) => {
      const s0 = scaleRef.current;
      const o0 = offsetRef.current;
      const s = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      apply(s, { x: at.x - ((at.x - o0.x) * s) / s0, y: at.y - ((at.y - o0.y) * s) / s0 }, smooth);
    },
    [apply]
  );

  const reset = useCallback(() => apply(1, { x: 0, y: 0 }, true), [apply]);

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      onIndexChange((index + delta + count) % count);
    },
    [count, index, onIndexChange]
  );

  // New photo always starts un-zoomed.
  useEffect(() => {
    apply(1, { x: 0, y: 0 });
  }, [index, open, apply]);

  const onCloseRef = useRef(onClose);
  const goRef = useRef(go);
  useEffect(() => {
    onCloseRef.current = onClose;
    goRef.current = go;
  });

  // Lock page scroll, support Esc / arrow keys, and let the phone's Back
  // button close the viewer instead of leaving the product page.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      else if (e.key === "ArrowRight") goRef.current(1);
      else if (e.key === "ArrowLeft") goRef.current(-1);
    };
    window.addEventListener("keydown", onKey);

    // Same URL and router state, just marked — so Back pops this entry first.
    const isViewerEntry = () => !!(window.history.state as { imageZoomViewer?: boolean } | null)?.imageZoomViewer;
    window.history.pushState({ ...(window.history.state ?? {}), imageZoomViewer: true }, "");
    const onPop = () => {
      if (!isViewerEntry()) onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      // Closed with the X / Esc: drop the history entry we added.
      if (isViewerEntry()) window.history.back();
    };
  }, [open]);

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const [a, b] = pts;
    gesture.current = {
      startScale: scaleRef.current,
      startOffset: { ...offsetRef.current },
      startDist: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0,
      startMid: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
      startPoint: a,
      moved: false,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, toCentre(e.clientX, e.clientY));
    startGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, toCentre(e.clientX, e.clientY));
    const g = gesture.current;
    const pts = [...pointers.current.values()];

    if (pts.length >= 2 && g.startDist > 0) {
      const [a, b] = pts;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const s = clamp((g.startScale * Math.hypot(a.x - b.x, a.y - b.y)) / g.startDist, MIN_SCALE, MAX_SCALE);
      g.moved = true;
      apply(s, {
        x: mid.x - ((g.startMid.x - g.startOffset.x) * s) / g.startScale,
        y: mid.y - ((g.startMid.y - g.startOffset.y) * s) / g.startScale,
      });
      return;
    }

    const p = pts[0];
    const dx = p.x - g.startPoint.x;
    const dy = p.y - g.startPoint.y;
    if (Math.hypot(dx, dy) > 8) g.moved = true;
    if (scaleRef.current > 1) {
      apply(scaleRef.current, { x: g.startOffset.x + dx, y: g.startOffset.y + dy });
    } else {
      // Not zoomed: follow the finger sideways as a swipe preview.
      setAnimate(false);
      setOffset({ x: dx, y: 0 });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const end = toCentre(e.clientX, e.clientY);
    const g = gesture.current;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);

    if (pointers.current.size > 0) {
      // One finger lifted from a pinch: continue as a pan from here (never a tap).
      startGesture();
      if (gesture.current) gesture.current.moved = true;
      return;
    }
    gesture.current = null;
    if (!g || !wasSingle) return;

    if (!g.moved) {
      const now = Date.now();
      const prev = lastTap.current;
      if (prev && now - prev.time < DOUBLE_TAP_MS && Math.hypot(end.x - prev.point.x, end.y - prev.point.y) < 30) {
        lastTap.current = null;
        if (scaleRef.current > 1) reset();
        else zoomAt(DOUBLE_TAP_SCALE, end, true);
      } else {
        lastTap.current = { time: now, point: end };
      }
      return;
    }

    if (scaleRef.current === 1) {
      const dx = end.x - g.startPoint.x;
      if (count > 1 && dx <= -SWIPE_PX) go(1);
      else if (count > 1 && dx >= SWIPE_PX) go(-1);
      else reset();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    zoomAt(scaleRef.current * factor, toCentre(e.clientX, e.clientY));
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={`${alt} photos`}>
      <div className="safe-area-pt flex items-center justify-between px-3 py-2">
        <span className="text-sm text-white/80">{count > 1 ? `${index + 1} / ${count}` : ""}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Close photo viewer"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 select-none overflow-hidden"
        style={{ touchAction: "none", cursor: scale > 1 ? "grab" : "zoom-in" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img
          src={images[index]}
          alt={alt}
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: animate ? "transform 200ms ease-out" : "none",
          }}
        />

        {count > 1 && (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 md:flex"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => go(-1)}
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 md:flex"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => go(1)}
              aria-label="Next photo"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>

      <p className="safe-area-pb px-4 py-3 text-center text-xs text-white/60">
        Pinch or double-tap to zoom{count > 1 ? " · swipe for more photos" : ""}
      </p>
    </div>,
    document.body
  );
}
