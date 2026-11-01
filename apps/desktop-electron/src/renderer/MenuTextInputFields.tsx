import type { MenuTextInputConfig } from "../shared/menuScene";
import { InspectorNumber, InspectorSection, InspectorToggle } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

export function MenuTextInputFields({ value, onChange, disabled = false }: {
  value: MenuTextInputConfig; onChange(value: MenuTextInputConfig): void; disabled?: boolean;
}) {
  const ui = useStudioUiText();
  const update = (patch: Partial<MenuTextInputConfig>) => {
    if (Object.entries(patch).every(([key, next]) => JSON.stringify(value[key as keyof MenuTextInputConfig]) === JSON.stringify(next))) return;
    onChange({ ...value, ...patch });
  };
  const keyboard = value.keyboard;
  const bottomGrid = keyboard?.controlLayout === "bottom_grid";
  return <fieldset disabled={disabled} className="room-menu-text-input-fields">
    <label><span>{ui("Variável de texto")}</span><input aria-label={ui("Variável de texto")}
      key={value.variableName} defaultValue={value.variableName} onBlur={event => {
        const name = event.currentTarget.value.trim();
        if (name) update({ variableName: name }); else event.currentTarget.value = value.variableName;
      }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
    <InspectorSection title={ui("Campo do nome")}>
      <InspectorNumber label={ui("Máximo de caracteres")} value={value.maxLength} min={1} max={16} onChange={maxLength => update({ maxLength })} />
      <div className="room-menu-text-input-position">
        <InspectorNumber label={ui("Campo X")} value={value.x} min={0} max={30 - value.width} unit="tiles" onChange={x => update({ x })} />
        <InspectorNumber label={ui("Campo Y")} value={value.y} min={0} max={19} unit="tiles" onChange={y => update({ y })} />
      </div>
      <InspectorNumber label={ui("Largura do campo")} value={value.width} min={1} max={30 - value.x} unit="tiles" onChange={width => update({ width })} />
    </InspectorSection>
    <InspectorSection title={ui("Teclado")}>
      <InspectorToggle checked={keyboard?.layout === "grid"} label={ui("Teclado na tela")} onChange={enabled => update({ keyboard: {
        x: 4, y: 8, width: 22, height: 6, allowLowercase: true, ...keyboard, layout: enabled ? "grid" : "hidden"
      } })} />
      {keyboard?.layout === "grid" ? <>
        <p className="muted">{bottomGrid ? ui("8 colunas · 4 linhas · DEL, Aa e OK abaixo das letras") : ui("Teclado de entrada de texto da cena")}</p>
        {bottomGrid && keyboard.surface === "background" ? <p className="muted">{ui("A moldura e as teclas vêm do fundo da cena. Estes controles posicionam o campo, as letras e os comandos.")}</p> : null}
        <div className="room-menu-text-input-position">
          <InspectorNumber label={ui("Teclado X")} value={keyboard.x} min={0} max={30 - Math.max(keyboard.width, bottomGrid ? 17 : 22)} unit="tiles" onChange={x => update({ keyboard: { ...keyboard, x } })} />
          <InspectorNumber label={ui("Teclado Y")} value={keyboard.y} min={0} max={20 - keyboard.height} unit="tiles" onChange={y => update({ keyboard: { ...keyboard, y } })} />
        </div>
        <InspectorToggle checked={keyboard.allowLowercase} label={ui("Aceitar minúsculas")} onChange={allowLowercase => update({ keyboard: { ...keyboard, allowLowercase } })} />
      </> : null}
    </InspectorSection>
  </fieldset>;
}
