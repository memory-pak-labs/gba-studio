export interface AsepriteFrame {
  name: string;
  frame: { x: number; y: number; width: number; height: number };
  durationMs: number;
}

export interface AsepriteImport {
  image: string;
  durationMs: number;
  frames: AsepriteFrame[];
  tags: Array<{ name: string; from: number; to: number; direction: string }>;
  slices: Array<{ name: string; keys: Array<{ frame: number; bounds: { x: number; y: number; w: number; h: number } }> }>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseAsepriteExport(value: unknown): AsepriteImport {
  const source = record(value);
  const meta = record(source.meta);
  const frameEntries = Array.isArray(source.frames)
    ? source.frames.map((frame, index) => [String(index), frame] as const)
    : Object.entries(record(source.frames));
  const frames = frameEntries.map(([name, raw]) => {
    const item = record(raw);
    const bounds = record(item.frame);
    return {
      name: string(item.filename) || name,
      frame: {
        x: number(bounds.x),
        y: number(bounds.y),
        width: number(bounds.w),
        height: number(bounds.h)
      },
      durationMs: number(item.duration)
    };
  });
  const tags = (Array.isArray(meta.frameTags) ? meta.frameTags : []).map((raw) => {
    const item = record(raw);
    return {
      name: string(item.name),
      from: number(item.from),
      to: number(item.to),
      direction: string(item.direction) || "forward"
    };
  });
  const slices = (Array.isArray(meta.slices) ? meta.slices : []).map((raw) => {
    const item = record(raw);
    return {
      name: string(item.name),
      keys: (Array.isArray(item.keys) ? item.keys : []).map((rawKey) => {
        const key = record(rawKey);
        const bounds = record(key.bounds);
        return {
          frame: number(key.frame),
          bounds: {
            x: number(bounds.x),
            y: number(bounds.y),
            w: number(bounds.w),
            h: number(bounds.h)
          }
        };
      })
    };
  });
  return {
    image: string(meta.image),
    durationMs: frames.reduce((total, frame) => total + frame.durationMs, 0),
    frames,
    tags,
    slices
  };
}

function attributes(source: string): Record<string, string> {
  return Object.fromEntries(
    [...source.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map((match) => [match[1], match[2]])
  );
}

function integerAttribute(values: Record<string, string>, key: string, fallback = 0): number {
  const parsed = Number.parseInt(values[key] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface TiledTsxImport {
  name: string;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  columns: number;
  image: { source: string; width: number; height: number } | null;
  tiles: Array<{ id: number; animation: Array<{ tileID: number; durationMs: number }> }>;
  wangSets: Array<{
    name: string;
    type: string;
    colors: Array<{ name: string; color: string; tileID: number; probability: number }>;
  }>;
}

export function parseTiledTsx(xml: string): TiledTsxImport {
  const tileset = attributes(xml.match(/<tileset\b([^>]*)>/i)?.[1] ?? "");
  const imageAttributes = xml.match(/<image\b([^>]*)\/?>/i);
  const image = imageAttributes
    ? (() => {
      const item = attributes(imageAttributes[1]);
      return {
        source: item.source ?? "",
        width: integerAttribute(item, "width"),
        height: integerAttribute(item, "height")
      };
    })()
    : null;
  const tiles = [...xml.matchAll(/<tile\b([^>]*)>([\s\S]*?)<\/tile>/gi)].map((match) => {
    const tile = attributes(match[1]);
    const animation = [...match[2].matchAll(/<frame\b([^>]*)\/?>/gi)].map((frameMatch) => {
      const frame = attributes(frameMatch[1]);
      return { tileID: integerAttribute(frame, "tileid"), durationMs: integerAttribute(frame, "duration") };
    });
    return { id: integerAttribute(tile, "id"), animation };
  });
  const wangSets = [...xml.matchAll(/<wangset\b([^>]*)>([\s\S]*?)<\/wangset>/gi)].map((match) => {
    const wangSet = attributes(match[1]);
    const colors = [...match[2].matchAll(/<wangcolor\b([^>]*)\/?>/gi)].map((colorMatch) => {
      const color = attributes(colorMatch[1]);
      return {
        name: color.name ?? "",
        color: color.color ?? "",
        tileID: integerAttribute(color, "tile", -1),
        probability: Number.parseFloat(color.probability ?? "1")
      };
    });
    return { name: wangSet.name ?? "", type: wangSet.type ?? "mixed", colors };
  });
  return {
    name: tileset.name ?? "",
    tileWidth: integerAttribute(tileset, "tilewidth"),
    tileHeight: integerAttribute(tileset, "tileheight"),
    tileCount: integerAttribute(tileset, "tilecount"),
    columns: integerAttribute(tileset, "columns"),
    image,
    tiles,
    wangSets
  };
}
