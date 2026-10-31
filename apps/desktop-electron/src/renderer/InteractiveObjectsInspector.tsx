import { useState } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import { configureInteractiveObject, interactiveObjectKinds, type InteractiveObjectParameters } from "../shared/interactiveObjects";
import { useStudioUiText } from "./studioUiText";

export function InteractiveObjectsInspector({ data, onApply }: { data: GBAProjectData; onApply(data: GBAProjectData): void }): React.ReactElement {
  const ui = useStudioUiText();
  const rooms = (Array.isArray(data.scenas) && data.scenas.length ? data.scenas : Array.isArray(data.rooms) ? data.rooms : []) as Record<string, unknown>[];
  const actors = ((Array.isArray(data.actors) ? data.actors : []) as Record<string, unknown>[]).filter(actor => {
    const room = rooms.find(item => item.id === actor.roomID || item.name === actor.roomName);
    return room && ["topdown", "platformer"].includes(String(room.sceneType ?? room.type ?? "topdown")) && actor.isPlayer !== true && room.playerActorName !== actor.name;
  });
  const [actorID, setActorID] = useState("");
  const [parameters, setParameters] = useState<InteractiveObjectParameters>({ kind: "chest", variable: "object.open", quantity: 1 });
  const [notice, setNotice] = useState("");
  const labels: Record<typeof interactiveObjectKinds[number], string> = { door: "Porta", lever: "Alavanca", chest: "Baú", breakable: "Destrutível", "conditional-passage": "Passagem condicionada", "activated-platform": "Plataforma ativada", mission: "Missão" };
  return <details className="editor-prefab-editor" data-interactive-objects>
    <summary>{ui("Objetos interativos")}</summary>
    <div className="editor-prefab-fields">
      <p>{ui("Gera eventos e restauração usando variáveis salvas do motor.")}</p>
      <label><span>{ui("Ator")}</span><select aria-label={ui("Ator do objeto")} value={actorID} onChange={e => {
        const id = e.target.value; setActorID(id); setNotice("");
        const actor = actors.find(a => a.id === id);
        setParameters(actor?.interactiveObject as InteractiveObjectParameters ?? { kind: "chest", variable: `object.${id}`, quantity: 1 });
      }}><option value="">{ui("Selecionar")}</option>{actors.map(actor => <option key={String(actor.id)} value={String(actor.id)}>{String(actor.name ?? actor.id)}</option>)}</select></label>
      <label><span>{ui("Tipo")}</span><select aria-label={ui("Tipo do objeto")} value={parameters.kind} onChange={e => setParameters({ ...parameters, kind: e.target.value as InteractiveObjectParameters["kind"] })}>{interactiveObjectKinds.map(kind => <option key={kind} value={kind}>{ui(labels[kind])}</option>)}</select></label>
      {(["variable", "requiredItem", "rewardItem", "sound", "mapStateID", "activeVariant", "inactiveVariant"] as const).filter(key => key !== "rewardItem" || parameters.kind === "chest").filter(key => !["mapStateID", "activeVariant", "inactiveVariant"].includes(key) || ["door", "lever", "conditional-passage"].includes(parameters.kind)).map(key => {
        const label = { variable: "Variável persistente", requiredItem: "Item necessário", rewardItem: "Item recebido", sound: "Som do objeto", mapStateID: "ID do estado", activeVariant: "Variante ativa", inactiveVariant: "Variante inativa" }[key];
        return <label key={key}><span>{ui(label)}</span><input aria-label={ui(label)} value={parameters[key] ?? ""} onChange={e => setParameters({ ...parameters, [key]: e.target.value })} /></label>;
      })}
      {(parameters.kind === "chest" ? ["quantity"] as const : parameters.kind === "activated-platform" ? ["targetX", "targetY"] as const : parameters.kind === "mission" ? ["completionValue"] as const : []).map(key => <label key={key}><span>{ui({ quantity: "Quantidade", targetX: "Destino X", targetY: "Destino Y", completionValue: "Valor da missão" }[key])}</span><input aria-label={ui({ quantity: "Quantidade", targetX: "Destino X", targetY: "Destino Y", completionValue: "Valor da missão" }[key])} type="number" value={parameters[key] ?? 1} onChange={e => setParameters({ ...parameters, [key]: Number(e.target.value) })} /></label>)}
      <button type="button" disabled={!actorID} onClick={() => { try {
        const result = configureInteractiveObject(data, actorID, parameters);
        onApply({ ...result.data, eventDiagnostics: true });
        setNotice(ui("Objeto aplicado: {0} comandos, {1} variável salva.", { 0: result.cost.commands, 1: result.cost.savedVariables }));
      } catch (error) { setNotice(ui(error instanceof Error ? error.message : String(error))); } }}>{ui("Aplicar objeto")}</button>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  </details>;
}
