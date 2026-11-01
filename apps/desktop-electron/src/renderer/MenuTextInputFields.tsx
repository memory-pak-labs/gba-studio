import type { MenuTextInputConfig, MenuTextInputKeyboardGeometry } from "../shared/menuScene";
import { configureMenuKeyboard, DEFAULT_NAME_KEYBOARD_GEOMETRY, menuTextInputLayout, moveMenuTextInput, useCustomMenuKeyboard, type MenuTextInputPart } from "../shared/menuTextInputLayout";
import { InspectorNumber, InspectorSection, InspectorToggle } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

export function MenuTextInputFields({ value, onChange, disabled = false, selectedPart, onSelectPart }: {
  value: MenuTextInputConfig; onChange(value: MenuTextInputConfig): void; disabled?: boolean;
  selectedPart?: MenuTextInputPart | null; onSelectPart?(part: MenuTextInputPart | null): void;
}) {
  const ui=useStudioUiText(),keyboard=value.keyboard;
  const apply=(next:MenuTextInputConfig)=>{if(JSON.stringify(value)!==JSON.stringify(next))onChange(next);};
  const update=(patch:Partial<MenuTextInputConfig>)=>apply({...value,...patch});
  const bottomGrid=keyboard?.controlLayout==="bottom_grid";
  const geometry=keyboard?.geometry??DEFAULT_NAME_KEYBOARD_GEOMETRY;
  const custom=Boolean(geometry.keys),layout=menuTextInputLayout(value);
  const selectedIndex=selectedPart?.startsWith("key:")?Number(selectedPart.slice(4)):-1;
  const selectedKey=layout?.keys[selectedIndex];
  const editGeometry=(patch:Partial<MenuTextInputKeyboardGeometry>)=>{
    if(Object.entries(patch).every(([key,v])=>geometry[key as keyof MenuTextInputKeyboardGeometry]===v))return;
    apply(configureMenuKeyboard(value,patch));
  };
  const bounds=layout?.keyboardBounds;
  return <fieldset disabled={disabled} className="room-menu-text-input-fields">
    <label><span>{ui("Variável de texto")}</span><input aria-label={ui("Variável de texto")} key={value.variableName} defaultValue={value.variableName}
      onBlur={event=>{const name=event.currentTarget.value.trim();if(name)update({variableName:name});else event.currentTarget.value=value.variableName;}}
      onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}} /></label>
    <InspectorSection title={ui("Campo do nome")}>
      <InspectorNumber label={ui("Máximo de caracteres")} value={value.maxLength} min={1} max={16} onChange={maxLength=>{
        const width=Math.max(value.width,maxLength);update({maxLength,width,x:Math.min(value.x,30-width)});
      }}/>
      <div className="room-menu-text-input-position">
        <InspectorNumber label={ui("Campo X")} value={value.x} min={0} max={30-value.width} unit="tiles" onChange={x=>update({x})}/>
        <InspectorNumber label={ui("Campo Y")} value={value.y} min={0} max={19} unit="tiles" onChange={y=>update({y})}/>
      </div>
      <InspectorNumber label={ui("Largura do campo")} value={value.width} min={value.maxLength} max={30-value.x} unit="tiles" onChange={width=>update({width})}/>
      <p className="muted">{ui("Arraste a alça à direita do campo para ajustar a largura. A largura mínima acompanha o limite de caracteres.")}</p>
    </InspectorSection>
    <InspectorSection title={ui("Teclado")}>
      <InspectorToggle checked={keyboard?.layout==="grid"} label={ui("Teclado na tela")} onChange={enabled=>update({keyboard:{x:4,y:8,width:22,height:6,allowLowercase:true,...keyboard,layout:enabled?"grid":"hidden"}})}/>
      {keyboard?.layout==="grid"?<>
        {bottomGrid?<label className="room-menu-text-input-choice"><span>{ui("Composição do teclado")}</span><select aria-label={ui("Composição do teclado")} value={custom?"custom":"grid"} onChange={event=>{
          apply(event.currentTarget.value==="custom"?useCustomMenuKeyboard(value):configureMenuKeyboard(value,{keys:undefined}));onSelectPart?.("keyboard");
        }}><option value="grid">{ui("Grade configurável")}</option><option value="custom">{ui("Teclas livres")}</option></select></label>:null}
        {bottomGrid&&!custom?<>
          <div className="room-menu-text-input-position">
            <InspectorNumber label={ui("Colunas do teclado")} value={geometry.columns} min={4} max={13} onChange={columns=>editGeometry({columns})}/>
            <InspectorNumber label={ui("Linhas do teclado")} value={geometry.rows} min={Math.ceil(26/geometry.columns)} max={9} onChange={rows=>editGeometry({rows})}/>
          </div>
          <div className="room-menu-text-input-position">
            <InspectorNumber label={ui("Espaço horizontal")} value={geometry.columnGap*8} min={0} max={Math.min(4,Math.floor((30-geometry.columns*2)/(geometry.columns-1)))*8} step={8} unit="px" onChange={v=>editGeometry({columnGap:v/8})}/>
            <InspectorNumber label={ui("Espaço vertical")} value={geometry.rowGap*8} min={0} max={Math.min(4,Math.floor((18-geometry.rows*2)/geometry.rows))*8} step={8} unit="px" onChange={v=>editGeometry({rowGap:v/8})}/>
          </div>
        </>:null}
        {custom&&layout?<>
          <p className="muted">{ui("Selecione e arraste cada tecla. Use o rótulo Mover teclado para deslocar o conjunto.")}</p>
          <label className="room-menu-text-input-choice"><span>{ui("Tecla selecionada")}</span><select aria-label={ui("Tecla selecionada")} value={selectedIndex<0?"":selectedIndex} onChange={event=>onSelectPart?.(`key:${event.currentTarget.value}` as MenuTextInputPart)}>
            <option value="" disabled>{ui("Selecione uma tecla")}</option>
            {layout.keys.map(key=><option key={key.index} value={key.index}>{key.label}</option>)}
          </select></label>
          {selectedKey?<div className="room-menu-text-input-position">
            <InspectorNumber label={ui("Tecla X")} value={selectedKey.x/8} min={0} max={30-selectedKey.width/8} unit="tiles" onChange={x=>apply(moveMenuTextInput(value,`key:${selectedIndex}`,(x-selectedKey.x/8)*8,0))}/>
            <InspectorNumber label={ui("Tecla Y")} value={selectedKey.y/8} min={0} max={18} unit="tiles" onChange={y=>apply(moveMenuTextInput(value,`key:${selectedIndex}`,0,(y-selectedKey.y/8)*8))}/>
          </div>:null}
        </>:null}
        <div className="room-menu-text-input-position">
          <InspectorNumber label={ui("Teclado X")} value={keyboard.x} min={bounds?keyboard.x-bounds.x/8:0} max={bounds?keyboard.x+(240-bounds.x-bounds.width)/8:30-keyboard.width} unit="tiles" onChange={x=>apply(moveMenuTextInput(value,"keyboard",(x-keyboard.x)*8,0))}/>
          <InspectorNumber label={ui("Teclado Y")} value={keyboard.y} min={bounds?keyboard.y-bounds.y/8:0} max={bounds?keyboard.y+(160-bounds.y-bounds.height)/8:20-keyboard.height} unit="tiles" onChange={y=>apply(moveMenuTextInput(value,"keyboard",0,(y-keyboard.y)*8))}/>
        </div>
        {bottomGrid&&keyboard.surface==="background"?<p className="muted">{ui("A moldura e as teclas vêm do fundo da cena. Estes controles posicionam o campo, as letras e os comandos.")}</p>:null}
        <InspectorToggle checked={keyboard.allowLowercase} label={ui("Aceitar minúsculas")} onChange={allowLowercase=>update({keyboard:{...keyboard,allowLowercase}})}/>
      </>:null}
    </InspectorSection>
  </fieldset>;
}
