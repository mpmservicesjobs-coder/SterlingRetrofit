"use client";
import { useEffect, useRef } from "react";

type Props = {
  label: string;
  value: { dataUrl: string; at: string } | null;
  onChange: (v: { dataUrl: string; at: string } | null) => void;
};

/** Finger signature on a canvas. Black ink on white, saved as a transparent PNG. */
export default function SignaturePad({ label, value, onChange }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const strokes = useRef(0);

  useEffect(() => {
    const c = ref.current!;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = c.offsetWidth;
    const h = c.offsetHeight;
    c.width = w * ratio;
    c.height = h * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = "#111111";
    if (value?.dataUrl) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = value.dataUrl;
      strokes.current = 1;
    }
    // Only on mount: redrawing on each change would blur the strokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function down(e: React.PointerEvent) {
    e.preventDefault();
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = ref.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    strokes.current += 1;
    onChange({ dataUrl: ref.current!.toDataURL("image/png"), at: new Date().toISOString() });
  }
  function clear() {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    strokes.current = 0;
    onChange(null);
  }

  return (
    <div className="field">
      <div className="row">
        <span className="label" style={{ marginBottom: 0 }}>
          {label}
        </span>
        <span className="spacer" />
        <button type="button" className="linkbtn" onClick={clear}>
          Clear
        </button>
      </div>
      <canvas
        ref={ref}
        className="sigpad"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <div className="hint">{value ? "Signed." : "Sign in the box with a finger."}</div>
    </div>
  );
}
