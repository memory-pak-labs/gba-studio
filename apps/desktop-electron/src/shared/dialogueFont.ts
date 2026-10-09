import contract from "../../../../packages/GBAStudioEngine/engine/include/gbs/dialogue_font.json" with { type: "json" };

export const dialogueFontContract = contract;
const characters = new Map(contract.glyphs.map(glyph => [glyph.character, glyph]));
const aliases: Record<string, string> = contract.aliases;

export function normalizeDialogueText(text: string): string {
  return Array.from(text.normalize("NFC").replace(/…/g, "...").replace(/\r\n?/g, "\n"))
    .map(character => aliases[character] ?? character).join("");
}

export function dialogueFontCharacter(character: string): string {
  const value = aliases[character] ?? character;
  return characters.has(value) ? value : "?";
}

export function dialogueFontRows(character: string): number[] {
  return characters.get(dialogueFontCharacter(character))!.rows;
}

export function unsupportedDialogueCharacters(text: string): string[] {
  return [...new Set(Array.from(normalizeDialogueText(text)))].filter(character =>
    character !== "\n" && !characters.has(character));
}

/** Native text remains on an 8 px grid; words move as a unit when they fit. */
export function wrapDialogueText(text: string, columns: number): string[] {
  // Keep the same scan/break rules as gbs_text_wrap_line, including explicit
  // blank lines and spaces inside a line. Count code points, never UTF-16 units.
  const characters = Array.from(normalizeDialogueText(text));
  columns = Math.max(1, Math.floor(columns) || 1);
  const lines: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let end = start;
    let next = start;
    let lastSpace = -1;
    for (; end < characters.length; end++) {
      const character = characters[end];
      if (character === "\n") { next = end + 1; break; }
      if (end - start >= columns) {
        if (character !== " " && lastSpace >= 0) end = lastSpace;
        next = end;
        while (characters[next] === " ") next++;
        break;
      }
      if (character === " " && end !== start && characters[end - 1] !== " ") lastSpace = end;
    }
    lines.push(characters.slice(start, end).join(""));
    start = end === characters.length ? end : next;
  }
  return lines.length ? lines : [""];
}
