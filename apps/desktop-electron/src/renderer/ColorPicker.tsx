import { useCallback, useEffect, useRef, useState } from "react";
import { decodeRgb555, formatRgb555Hex, parseRgb555Hex } from "../shared/rgb555.js";

interface ColorPickerProps {
  rgb555Value: number;
  onChange(rgb555: number): void;
}

interface HSB {
  h: number;
  s: number;
  b: number;
}

function rgb555ToRgb(value: number): [number, number, number] {
  return decodeRgb555(value);
}

function rgbToHsb(r: number, g: number, b: number): HSB {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const bl = max;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, b: bl * 100 };
}

function hsbToRgb(h: number, s: number, b: number): [number, number, number] {
  const hn = h / 360;
  const sn = s / 100;
  const bn = b / 100;
  let r: number;
  let g: number;
  let bl: number;
  const i = Math.floor(hn * 6);
  const f = hn * 6 - i;
  const p = bn * (1 - sn);
  const q = bn * (1 - f * sn);
  const t = bn * (1 - (1 - f) * sn);
  switch (i % 6) {
    case 0: r = bn; g = t; bl = p; break;
    case 1: r = q; g = bn; bl = p; break;
    case 2: r = p; g = bn; bl = t; break;
    case 3: r = p; g = q; bl = bn; break;
    case 4: r = t; g = p; bl = bn; break;
    default: r = bn; g = p; bl = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)];
}

function rgbToRgb555(r: number, g: number, b: number): number {
  return ((r >> 3) & 0x1f) | (((g >> 3) & 0x1f) << 5) | (((b >> 3) & 0x1f) << 10);
}

function hsbToRgb555(h: number, s: number, b: number): number {
  const [r, g, bl] = hsbToRgb(h, s, b);
  return rgbToRgb555(r, g, bl);
}

function rgbToCss(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function GradientBar({
  gradient,
  value,
  max,
  onChange
}: {
  gradient: string;
  value: number;
  max: number;
  onChange(value: number): void;
}): React.ReactElement {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateValue = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onChange(Math.round(ratio * max));
  }, [max, onChange]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => updateValue(e.clientX);
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, updateValue]);

  const ratio = max > 0 ? value / max : 0;

  return (
    <div
      ref={trackRef}
      className="color-picker-gradient"
      style={{ background: gradient }}
      onMouseDown={(e) => { setDragging(true); updateValue(e.clientX); }}
    >
      <div
        className="color-picker-gradient-thumb"
        style={{ left: `${ratio * 100}%` }}
      />
    </div>
  );
}

export function ColorPicker({ rgb555Value, onChange }: ColorPickerProps): React.ReactElement {
  const [r, g, b] = rgb555ToRgb(rgb555Value);
  const hsb = rgbToHsb(r, g, b);
  const [hexInput, setHexInput] = useState(formatRgb555Hex(rgb555Value));

  useEffect(() => {
    setHexInput(formatRgb555Hex(rgb555Value));
  }, [rgb555Value]);

  const handleHueChange = useCallback((h: number) => {
    onChange(hsbToRgb555(h, hsb.s, hsb.b));
  }, [hsb.s, hsb.b, onChange]);

  const handleSaturationChange = useCallback((s: number) => {
    onChange(hsbToRgb555(hsb.h, s, hsb.b));
  }, [hsb.h, hsb.b, onChange]);

  const handleBrightnessChange = useCallback((b: number) => {
    onChange(hsbToRgb555(hsb.h, hsb.s, b));
  }, [hsb.h, hsb.s, onChange]);

  const handleHexApply = useCallback(() => {
    const parsed = parseRgb555Hex(hexInput);
    if (parsed !== null) onChange(parsed);
  }, [hexInput, onChange]);

  const hueGradient = "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)";
  const satGradient = `linear-gradient(to right, ${rgbToCss(...hsbToRgb(hsb.h, 0, hsb.b))}, ${rgbToCss(...hsbToRgb(hsb.h, 100, hsb.b))})`;
  const brightGradient = `linear-gradient(to right, #000000, ${rgbToCss(...hsbToRgb(hsb.h, hsb.s, 100))})`;

  return (
    <div className="color-picker">
      <div className="color-picker-preview">
        <div
          className="color-picker-preview-swatch"
          style={{ backgroundColor: rgbToCss(r, g, b) }}
        />
        <div className="color-picker-hex-row">
          <input
            className="color-picker-hex-input"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleHexApply(); }}
            onBlur={handleHexApply}
            maxLength={4}
          />
        </div>
      </div>
      <div className="color-picker-sliders">
        <div className="color-picker-slider-row">
          <span className="color-picker-slider-label">H</span>
          <GradientBar gradient={hueGradient} value={Math.round(hsb.h)} max={360} onChange={handleHueChange} />
          <span className="color-picker-slider-value">{Math.round(hsb.h)}°</span>
        </div>
        <div className="color-picker-slider-row">
          <span className="color-picker-slider-label">S</span>
          <GradientBar gradient={satGradient} value={Math.round(hsb.s)} max={100} onChange={handleSaturationChange} />
          <span className="color-picker-slider-value">{Math.round(hsb.s)}%</span>
        </div>
        <div className="color-picker-slider-row">
          <span className="color-picker-slider-label">B</span>
          <GradientBar gradient={brightGradient} value={Math.round(hsb.b)} max={100} onChange={handleBrightnessChange} />
          <span className="color-picker-slider-value">{Math.round(hsb.b)}%</span>
        </div>
        <div className="color-picker-slider-row">
          <span className="color-picker-slider-label">R</span>
          <GradientBar gradient={`linear-gradient(to right, rgb(0,${g},${b}), rgb(255,${g},${b}))`} value={r} max={255} onChange={(v) => onChange(rgbToRgb555(v, g, b))} />
          <span className="color-picker-slider-value">{r}</span>
        </div>
        <div className="color-picker-slider-row">
          <span className="color-picker-slider-label">G</span>
          <GradientBar gradient={`linear-gradient(to right, rgb(${r},0,${b}), rgb(${r},255,${b}))`} value={g} max={255} onChange={(v) => onChange(rgbToRgb555(r, v, b))} />
          <span className="color-picker-slider-value">{g}</span>
        </div>
        <div className="color-picker-slider-row">
          <span className="color-picker-slider-label">B</span>
          <GradientBar gradient={`linear-gradient(to right, rgb(${r},${g},0), rgb(${r},${g},255))`} value={b} max={255} onChange={(v) => onChange(rgbToRgb555(r, g, v))} />
          <span className="color-picker-slider-value">{b}</span>
        </div>
      </div>
    </div>
  );
}
