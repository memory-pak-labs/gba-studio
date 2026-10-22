import { readFileSync } from "node:fs";

const approved = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
const names = new Set(["council-v13-background.png", "council-v13-nara.png", "council-v13-guardian.png", "frame-council-v13.png"]);
const retired = new Set(["council-v5-background.png", "council-v5-nara.png", "council-v5-guardian.png"]);

/** Keep regeneration on the approved Council revision without changing any
 * campaign logic, shared dialogue defaults, or other scene's presentation. */
export function promoteApprovedCouncilV13(data) {
  const next = structuredClone(data);
  const room = (approved.rooms ?? approved.scenas).find(item => item.name === "conselho_guardia");
  for (const collection of [next.rooms, next.scenas, [next.scena]]) {
    for (const item of collection ?? []) if (item?.name === "conselho_guardia") {
      for (const key of ["backgroundAssetName", "interfaceThemeId", "dialoguePresentation"]) item[key] = room[key];
    }
  }
  next.assets = [...next.assets.filter(item => !names.has(item.name) && !retired.has(item.name)),
    ...structuredClone(approved.assets.filter(item => names.has(item.name)))];
  for (const speech of next.dialogues ?? []) {
    if (speech.key === "conselho") speech.portrait = "council-v13-guardian.png";
    if (speech.key === "conselho_nara") speech.portrait = "council-v13-nara.png";
  }
  for (const key of ["animations", "animationStates"]) {
    next[key] = [...(next[key] ?? []).filter(item => !names.has(item.spriteSheet) && !retired.has(item.spriteSheet)),
      ...structuredClone((approved[key] ?? []).filter(item => names.has(item.spriteSheet)))];
  }
  const themes = next.settings.interfaceThemes ??= {};
  themes.themes = [...(themes.themes ?? []).filter(item => item.id !== "council-v13"),
    structuredClone(approved.settings.interfaceThemes.themes.find(item => item.id === "council-v13"))];
  return next;
}
