import { prepareInterfaceFontPreview } from "./interfaceFontPreview";
import { dialogueFontCharacter, dialogueFontRows, normalizeDialogueText, wrapDialogueText } from "../shared/dialogueFont";
import { useEffect, useMemo, useRef } from "react";
import {
  buildEngineDialogueWrapColumns,
  buildEngineDialogueWrapLines,
  dialoguePreviewLayoutForSettings,
  dialoguePreviewPortraitSourceRect,
  dialoguePreviewViewport,
  type DialoguePreviewLayout,
  type DialogueUiSettingsContract
} from "../shared/sceneRuntimeExport";

interface DialoguePreviewSnapshotProps {
  settings: DialogueUiSettingsContract;
  speaker: string;
  portraitSlot: string;
  text: string;
  choices: string[];
  boxImageURL: string | null;
  selectorImageURL: string | null;
  fontImageURL: string | null;
  portraitImageURL: string | null;
  portraitFrameWidth?: number;
  portraitFrameHeight?: number;
  emoteImageURL: string | null;
  portraitAlt: string;
  emoteAlt: string;
  boxSource: string | null;
  noDialogueLabel: string;
  overflowLabel: string;
  className?: string;
  transparentBackground?: boolean;
  maxTextRows?: number;
  pageIndex?: number;
  visibleCharacters?: number;
}

interface PreviewImage {
  image: HTMLImageElement | null;
  source: string | null;
}

const TILE_SIZE = dialoguePreviewViewport.tileSize;
const FONT_ATLAS_COLUMNS = 16;
const MAX_VISIBLE_CHOICES = 2;

export interface DialoguePreviewTextLayout {
  columns: number;
  lines: string[];
  overflow: boolean;
  rows: number;
}
function loadPreviewImage(source: string | null): Promise<PreviewImage> {
  if (!source || typeof Image === "undefined") return Promise.resolve({ image: null, source });
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ image, source });
    image.onerror = () => resolve({ image: null, source });
    image.src = source;
  });
}

export function dialogueFontSourceRect(character: string): { x: number; y: number; width: number; height: number } {
  const codepoint = dialogueFontCharacter(character).codePointAt(0) ?? 32;
  const index = codepoint - 32;
  return { x: (index % FONT_ATLAS_COLUMNS) * TILE_SIZE, y: Math.floor(index / FONT_ATLAS_COLUMNS) * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE };
}

function limitedRuntimeText(text: string, columns: number): string {
  return Array.from(normalizeDialogueText(text || "")).slice(0, Math.max(0, columns)).join("");
}

export function deriveDialoguePreviewTextLayout(
  settings: DialogueUiSettingsContract,
  layout: DialoguePreviewLayout,
  speaker: string,
  text: string,
  choices: string[],
  portraitColumns = 0,
  maxTextRows?: number
): DialoguePreviewTextLayout {
  const settingsRecord = settings as unknown as Record<string, unknown>;
  const configuredColumns = buildEngineDialogueWrapColumns(settingsRecord);
  const columns = Math.max(8, Math.min(configuredColumns, 26) - portraitColumns);
  const rows = Math.min(
    buildEngineDialogueWrapLines(settingsRecord),
    Math.max(1, Math.floor(layout.text.height / TILE_SIZE))
  );
  const textLines = settings.showCharacterName && settings.nameLabelMode === "inline" && speaker.trim()
    ? wrapDialogueText(`${speaker}:
${text}`, columns)
    : wrapDialogueText(text, columns);
  const visibleChoices = choices.slice(0, MAX_VISIBLE_CHOICES);
  const choiceColumns = Math.max(1, columns - 2);
  const choiceLines = visibleChoices.map((choice, index) => {
    const prefix = index === 0 ? "! " : "- ";
    return `${prefix}${limitedRuntimeText(choice, choiceColumns)}`;
  });
  const choiceOverflow = choices.length > visibleChoices.length
    || visibleChoices.some((choice) => Array.from(choice).length > choiceColumns);
  const availableTextRows = Math.max(1, Math.min(rows - choiceLines.length, maxTextRows ?? Infinity));
  const visibleTextLines = textLines.slice(0, availableTextRows);
  const textOverflow = textLines.length > visibleTextLines.length;
  const lines = [
    ...visibleTextLines,
    ...choiceLines.slice(0, Math.max(0, rows - visibleTextLines.length))
  ];

  if (textOverflow && visibleTextLines.length > 0) {
    const marker = "...";
    const lastTextLineIndex = visibleTextLines.length - 1;
    lines[lastTextLineIndex] = `${limitedRuntimeText(lines[lastTextLineIndex], columns - marker.length)}${marker}`;
  }

  return {
    columns,
    lines,
    overflow: textOverflow || choiceOverflow,
    rows
  };
}

/** Paginated visual review; regular text keeps every wrapped line, choices keep their runtime row budget. */
export function deriveDialoguePreviewPages(
  settings: DialogueUiSettingsContract, layout: DialoguePreviewLayout,
  speaker: string, text: string, choices: string[], portraitColumns = 0
): DialoguePreviewTextLayout[] {
  const first = deriveDialoguePreviewTextLayout(settings, layout, speaker, text, [], portraitColumns);
  if (choices.length) {
    return Array.from({ length: Math.ceil(choices.length / MAX_VISIBLE_CHOICES) }, (_, index) =>
      deriveDialoguePreviewTextLayout(settings, layout, speaker, text,
        choices.slice(index * MAX_VISIBLE_CHOICES, (index + 1) * MAX_VISIBLE_CHOICES), portraitColumns));
  }
  const lines = wrapDialogueText(settings.showCharacterName && settings.nameLabelMode === "inline" && speaker.trim()
    ? `${speaker}:\n${text}` : text, first.columns);
  return Array.from({ length: Math.max(1, Math.ceil(lines.length / first.rows)) }, (_, index) => ({
    columns: first.columns, rows: first.rows, overflow: false,
    lines: lines.slice(index * first.rows, (index + 1) * first.rows)
  }));
}

function reviewTextLayout(settings: DialogueUiSettingsContract, layout: DialoguePreviewLayout, speaker: string,
  text: string, choices: string[], portraitColumns: number, maxTextRows?: number, pageIndex?: number,
  visibleCharacters?: number): DialoguePreviewTextLayout {
  const pages = pageIndex === undefined ? null : deriveDialoguePreviewPages(settings, layout, speaker, text, choices, portraitColumns);
  const result = pages ? pages[Math.max(0, Math.min(pages.length - 1, pageIndex ?? 0))]
    : deriveDialoguePreviewTextLayout(settings, layout, speaker, text, choices, portraitColumns, maxTextRows);
  if (visibleCharacters === undefined) return result;
  let remaining = visibleCharacters;
  return { ...result, lines: result.lines.map(line => {
    const visible = Array.from(line).slice(0, Math.max(0, remaining)).join("");
    remaining -= Array.from(line).length;
    return visible;
  }) };
}

export function renderSkin(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  rect: { x: number; y: number; width: number; height: number }
): void {
  if (!image) {
    context.fillStyle = "#111c2c";
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.strokeStyle = "#e3d5a4";
    context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    return;
  }
  for (let y = 0; y < rect.height; y += TILE_SIZE) {
    for (let x = 0; x < rect.width; x += TILE_SIZE) {
      const column = x === 0 ? 0 : x + TILE_SIZE >= rect.width ? 2 : 1;
      const row = y === 0 ? 0 : y + TILE_SIZE >= rect.height ? 2 : 1;
      const width = Math.min(TILE_SIZE, rect.width - x);
      const height = Math.min(TILE_SIZE, rect.height - y);
      context.drawImage(image, column * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE, rect.x + x, rect.y + y, width, height);
    }
  }
}

function drawGlyph(
  context: CanvasRenderingContext2D,
  font: HTMLImageElement | HTMLCanvasElement | null,
  character: string,
  x: number,
  y: number
): void {
  if (!font) {
    context.fillStyle = "#d8d0b0";
    dialogueFontRows(character).forEach((row, dy) => {
      for (let dx = 0; dx < 8; dx += 1) if (row & (1 << (7 - dx))) context.fillRect(x + dx, y + dy, 1, 1);
    });
    return;
  }
  const source = dialogueFontSourceRect(character);
  context.drawImage(font, source.x, source.y, source.width, source.height, x, y, TILE_SIZE, TILE_SIZE);
}

function drawTextLines(
  context: CanvasRenderingContext2D,
  font: HTMLImageElement | HTMLCanvasElement | null,
  lines: string[],
  rect: { x: number; y: number; width: number; height: number },
  selector: HTMLImageElement | null
): void {
  const columns = Math.max(1, Math.floor(rect.width / TILE_SIZE));
  const rows = Math.max(1, Math.floor(rect.height / TILE_SIZE));
  lines.slice(0, rows).forEach((line, lineIndex) => {
    Array.from(line).slice(0, columns).forEach((character, columnIndex) => {
      const x = rect.x + columnIndex * TILE_SIZE;
      const y = rect.y + lineIndex * TILE_SIZE;
      if (selector && lineIndex > 0 && columnIndex === 0 && character === "!") {
        context.drawImage(selector, 0, 0, selector.naturalWidth || TILE_SIZE, selector.naturalHeight || TILE_SIZE, x, y, TILE_SIZE, TILE_SIZE);
        return;
      }
      drawGlyph(context, font, character, x, y);
    });
  });
}

function drawPortrait(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  slot: DialoguePreviewLayout["portraitSlot"],
  frameWidth?: number,
  frameHeight?: number
): void {
  if (!image) return;
  const source = dialoguePreviewPortraitSourceRect(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    frameWidth,
    frameHeight
  );
  if (source.width === 0 || source.height === 0) return;
  const width = Math.min(slot.width, source.width);
  const height = Math.min(slot.height, source.height);
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    slot.x + Math.floor((slot.width - width) / 2),
    slot.y + Math.floor((slot.height - height) / 2),
    width,
    height
  );
}

function renderDialogueSnapshot(
  canvas: HTMLCanvasElement,
  layout: DialoguePreviewLayout,
  settings: DialogueUiSettingsContract,
  speaker: string,
  text: string,
  choices: string[],
  images: { box: HTMLImageElement | null; selector: HTMLImageElement | null; font: HTMLImageElement | null; portrait: HTMLImageElement | null },
  portraitFrame: { width?: number; height?: number },
  transparentBackground = false,
  maxTextRows?: number,
  pageIndex?: number,
  visibleCharacters?: number
): void {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return;
  }
  if (!context) return;
  if (images.portrait) {
    const source = dialoguePreviewPortraitSourceRect(images.portrait.naturalWidth || images.portrait.width,
      images.portrait.naturalHeight || images.portrait.height, portraitFrame.width, portraitFrame.height);
    layout = dialoguePreviewLayoutForSettings(settings, speaker, layout.portraitOnRight ? "right" : "left", true, source);
  }
  const previewFont = prepareInterfaceFontPreview(images.font, images.box);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, dialoguePreviewViewport.width, dialoguePreviewViewport.height);
  if (!transparentBackground) {
    context.fillStyle = "#3c6b60";
    context.fillRect(0, 0, dialoguePreviewViewport.width, dialoguePreviewViewport.height);
  }

  if (settings.showPortrait && settings.portraitLayout === "fixed_slots" && images.portrait) {
    renderSkin(context, images.box, layout.portraitSlot);
    drawPortrait(context, images.portrait, layout.portraitSlot, portraitFrame.width, portraitFrame.height);
  }
  if (settings.showCharacterName && settings.nameLabelMode === "above" && speaker.trim()) {
    renderSkin(context, images.box, layout.nameLabel);
    drawTextLines(context, previewFont, [speaker], {
      x: layout.nameLabel.x + TILE_SIZE,
      y: layout.nameLabel.y + TILE_SIZE,
      width: Math.max(TILE_SIZE, layout.nameLabel.width - TILE_SIZE * 2),
      height: TILE_SIZE
    }, null);
  }

  renderSkin(context, images.box, layout.box);
  if (settings.showPortrait && settings.portraitLayout === "inline") {
    drawPortrait(context, images.portrait, layout.portraitSlot, portraitFrame.width, portraitFrame.height);
  }

  const portraitSource = images.portrait
    ? dialoguePreviewPortraitSourceRect(
        images.portrait.naturalWidth || images.portrait.width,
        images.portrait.naturalHeight || images.portrait.height,
        portraitFrame.width,
        portraitFrame.height
      )
    : null;
  const portraitColumns = settings.showPortrait && settings.portraitLayout === "inline" && (!layout.portraitOnRight || pageIndex !== undefined) && portraitSource
    ? Math.ceil(Math.min(layout.box.width, portraitSource.width) / TILE_SIZE)
    : 0;
  const previewText = reviewTextLayout(settings, layout, speaker, text, choices, portraitColumns, maxTextRows, pageIndex, visibleCharacters);
  drawTextLines(context, previewFont, previewText.lines, layout.text, images.selector);
}

export function DialoguePreviewSnapshot({
  settings,
  speaker,
  portraitSlot,
  text,
  choices,
  boxImageURL,
  selectorImageURL,
  fontImageURL,
  portraitImageURL,
  portraitFrameWidth,
  portraitFrameHeight,
  emoteImageURL,
  portraitAlt,
  emoteAlt,
  boxSource,
  noDialogueLabel,
  overflowLabel,
  className,
  transparentBackground = false,
  maxTextRows,
  pageIndex,
  visibleCharacters
}: DialoguePreviewSnapshotProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const portraitVisible = settings.showPortrait && Boolean(portraitImageURL);
  const layout = useMemo(
    () => dialoguePreviewLayoutForSettings(settings, speaker, portraitSlot, portraitVisible,
      portraitFrameWidth && portraitFrameHeight ? { width: portraitFrameWidth, height: portraitFrameHeight } : undefined),
    [portraitSlot, portraitVisible, portraitFrameWidth, portraitFrameHeight, settings, speaker]
  );
  const previewText = useMemo(
    () => reviewTextLayout(settings, layout, speaker, text, choices,
      pageIndex !== undefined && portraitVisible && settings.portraitLayout === "inline" ? Math.ceil((portraitFrameWidth ?? 32) / TILE_SIZE) : 0,
      maxTextRows, pageIndex, visibleCharacters),
    [choices, layout, settings, speaker, text, portraitVisible, portraitFrameWidth, maxTextRows, pageIndex, visibleCharacters]
  );

  useEffect(() => {
    let cancelled = false;
    const draw = async (): Promise<void> => {
      const [box, selector, font, portrait] = await Promise.all([
        loadPreviewImage(boxImageURL),
        loadPreviewImage(selectorImageURL),
        loadPreviewImage(fontImageURL),
        loadPreviewImage(portraitImageURL)
      ]);
      if (cancelled || !canvasRef.current) return;
      renderDialogueSnapshot(canvasRef.current, layout, settings, speaker, text, choices, {
        box: box.image,
        selector: selector.image,
        font: font.image,
        portrait: portrait.image
      }, { width: portraitFrameWidth, height: portraitFrameHeight }, transparentBackground, maxTextRows, pageIndex, visibleCharacters);
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [boxImageURL, selectorImageURL, fontImageURL, portraitImageURL, portraitFrameWidth, portraitFrameHeight, layout, settings, speaker, text, choices, transparentBackground, maxTextRows, pageIndex, visibleCharacters]);

  return (
    <div
      className={[
        "dialogue-preview",
        "dialogue-preview-snapshot",
        settings.portraitLayout === "fixed_slots" && portraitVisible ? "with-fixed-portrait-slots" : "",
        !portraitVisible ? "no-visible-portrait" : "",
        layout.portraitOnRight ? "portrait-slot-right" : "portrait-slot-left",
        className
      ].filter(Boolean).join(" ")}
      data-dialogue-preview-frame={layout.frameIndex}
      data-dialogue-preview-box={`${layout.box.x},${layout.box.y},${layout.box.width},${layout.box.height}`}
      data-dialogue-preview-name-label={`${layout.nameLabel.x},${layout.nameLabel.y},${layout.nameLabel.width},${layout.nameLabel.height}`}
      data-dialogue-preview-portrait-slot={layout.portraitOnRight ? "Direita" : "Esquerda"}
      data-dialogue-preview-portrait-frame-size={portraitFrameWidth && portraitFrameHeight ? `${portraitFrameWidth}x${portraitFrameHeight}` : undefined}
      data-dialogue-preview-renderer="native-contract"
      data-dialogue-preview-size={`${dialoguePreviewViewport.width}x${dialoguePreviewViewport.height}`}
      data-dialogue-preview-overflow={previewText.overflow ? "true" : "false"}
      data-dialogue-preview-visible-lines={String(previewText.lines.length)}
      data-dialogue-preview-page={pageIndex === undefined ? undefined : String(pageIndex + 1)}
      data-dialogue-preview-text-lines={pageIndex === undefined ? undefined : previewText.lines.join("\n")}
    >
      <canvas
        aria-label={noDialogueLabel}
        className="dialogue-preview-snapshot-canvas"
        height={dialoguePreviewViewport.height}
        ref={canvasRef}
        role="img"
        width={dialoguePreviewViewport.width}
      />
      {previewText.overflow ? <small className="dialogue-preview-overflow-note" role="status">{overflowLabel}</small> : null}
      <div className="dialogue-preview-a11y" aria-hidden="true">
        <div
          className={[
            "dialogue-preview-box",
            settings.portraitLayout === "inline" && portraitVisible ? "with-portrait" : "",
            layout.portraitOnRight && settings.portraitLayout === "inline" && portraitVisible ? "portrait-right" : "",
            boxImageURL ? "with-authored-skin" : ""
          ].filter(Boolean).join(" ")}
          data-dialogue-box-source={boxSource ?? undefined}
          style={boxImageURL ? { backgroundImage: `url("${boxImageURL}")` } : undefined}
        >
          {settings.showCharacterName && settings.nameLabelMode === "above" ? <strong className="dialogue-preview-name-label">{speaker}</strong> : null}
          {settings.showCharacterName && settings.nameLabelMode === "inline" ? <strong>{speaker}</strong> : null}
          {settings.showPortrait && portraitImageURL ? (
            <span className="dialogue-preview-portrait-frame"><img alt={portraitAlt} src={portraitImageURL} /></span>
          ) : null}
          {emoteImageURL ? <img alt={emoteAlt} className="dialogue-preview-emote" src={emoteImageURL} /> : null}
          <p>{text || noDialogueLabel}</p>
          {choices.length > 0 ? (
            <ul className={selectorImageURL ? "with-authored-selector" : ""}>
              {choices.slice(0, MAX_VISIBLE_CHOICES).map((choice, index) => (
                <li key={`${choice}-${index}`}>
                  {selectorImageURL ? <img alt="" className="dialogue-preview-selector" src={selectorImageURL} /> : null}
                  <span>{choice}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
