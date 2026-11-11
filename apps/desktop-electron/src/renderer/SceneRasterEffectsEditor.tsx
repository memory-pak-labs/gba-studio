import { useEffect, useRef, useState } from "react";
import { normalizeSceneRasterEffects, rasterScanline, type SceneRasterEffects } from "../shared/sceneRasterEffects";
import { InspectorNumber, InspectorRange, InspectorSelect, InspectorToggle } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

export function SceneRasterEffectsEditor({ value, enabled, onChange }: { value?: SceneRasterEffects; enabled: boolean; onChange(value: SceneRasterEffects): void }) {
  const ui = useStudioUiText();
  const effects = normalizeSceneRasterEffects(value), { ripple, gradient } = effects;
  const [playing, setPlaying] = useState(true), [frame, setFrame] = useState(0);
  const [visible, setVisible] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const changeRipple = (patch: Partial<typeof ripple>) => onChange({ ...effects, ripple: { ...ripple, ...patch } });
  const changeGradient = (patch: Partial<typeof gradient>) => onChange({ ...effects, gradient: { ...gradient, ...patch } });
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    // Collapsed or scrolled-out previews must not keep repainting the inspector.
    if (!visible || !playing || !enabled || !ripple.enabled || ripple.speed === 0) return;
    let id = 0, initial: number | undefined;
    const tick = (time: number) => { initial ??= time; setFrame(Math.floor((time-initial)*59.7275/1000)); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id);
  }, [visible, playing, enabled, ripple.enabled, ripple.speed]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d"); if (!context) return;
    const image = context.createImageData(240, 160);
    // Transparent sky and a tiled water pattern demonstrate the two effects.
    // This is deliberately labeled as a sample, not a rendering of the scene.
    for (let y=0;y<160;++y) {
      const scan = rasterScanline(effects, y, frame);
      for (let x=0;x<240;++x) {
        const shifted = (x+(enabled?scan.offset:0)+240)%240;
        let color = enabled && gradient.enabled ? scan.color : 0x5167;
        if (y>=80) color = ((Math.floor(shifted/8)+Math.floor(y/8))%2 ? 0x4566 : 0x3923);
        const index=(y*240+x)*4;
        for (let c=0;c<3;++c) image.data[index+c]=Math.round(((color>>(c*5))&31)*255/31);
        image.data[index+3]=255;
      }
    }
    context.putImageData(image,0,0);
  }, [JSON.stringify(effects), enabled, frame]);
  return <fieldset className="scene-composition-effect-card scene-raster-editor">
    <legend>{ui("Ondulação e gradiente")}</legend>
    {!enabled ? <p className="inspector-field-description">{ui("Ative a composição avançada para aplicar os efeitos na cena.")}</p> : null}
    <div className="scene-raster-preview">
      <canvas ref={canvas} width={240} height={160} aria-label={ui("Prévia demonstrativa de ondulação e gradiente")} />
      <div><strong>{ui("Prévia demonstrativa · 240 × 160")}</strong><p className="inspector-field-description">{ui("O padrão de água e céu demonstra os parâmetros. Use Testar cena para conferir a arte e as camadas do seu projeto na ROM.")}</p>
        <button type="button" className="inspector-action" onClick={()=>setPlaying(!playing)}>{ui(playing?"Pausar prévia":"Reproduzir prévia")}</button>
      </div>
    </div>
    <InspectorToggle checked={ripple.enabled} label={ui("Ondulação")} onChange={enabled=>changeRipple({enabled})} />
    {ripple.enabled ? <>
      <InspectorSelect ariaLabel={ui("Camada da ondulação")} label={ui("Camada do cenário")} value={ripple.layer} options={[{label:"BG1",value:"BG1"},{label:"BG2",value:"BG2"},{label:"BG3",value:"BG3"}]} onChange={layer=>changeRipple({layer:layer as typeof ripple.layer})}/>
      <InspectorRange showNumber={false} label={ui("Intensidade da ondulação")} min={0} max={16} step={1} value={ripple.amplitude} unit="px" onChange={amplitude=>changeRipple({amplitude})}/>
      <InspectorRange showNumber={false} label={ui("Tamanho da onda")} min={8} max={160} step={1} value={ripple.wavelength} unit="px" onChange={wavelength=>changeRipple({wavelength})}/>
      <InspectorRange showNumber={false} label={ui("Velocidade da ondulação")} min={0} max={8} step={1} value={ripple.speed} onChange={speed=>changeRipple({speed})}/>
      <div className="scene-composition-number-grid"><InspectorNumber label={ui("Ondulação · linha inicial")} min={0} max={159} value={ripple.top} onChange={top=>changeRipple({top})}/><InspectorNumber label={ui("Ondulação · linha final")} min={1} max={160} value={ripple.bottom} onChange={bottom=>changeRipple({bottom})}/></div>
    </> : null}
    <InspectorToggle checked={gradient.enabled} label={ui("Gradiente de fundo")} onChange={enabled=>changeGradient({enabled})}/>
    {gradient.enabled ? <>
      <p className="inspector-field-description">{ui("Preenche a cor de fundo visível nas áreas transparentes. Preserva as cores opacas da arte e dos atores.")}</p>
      <div className="scene-composition-number-grid">
        <label className="inspector-field"><span>{ui("Cor inicial")}</span><input aria-label={ui("Cor inicial do gradiente")} type="color" value={gradient.from} onChange={e=>changeGradient({from:e.currentTarget.value})}/></label>
        <label className="inspector-field"><span>{ui("Cor final")}</span><input aria-label={ui("Cor final do gradiente")} type="color" value={gradient.to} onChange={e=>changeGradient({to:e.currentTarget.value})}/></label>
        <InspectorNumber label={ui("Gradiente · linha inicial")} min={0} max={158} value={gradient.top} onChange={top=>changeGradient({top})}/>
        <InspectorNumber label={ui("Gradiente · linha final")} min={2} max={160} value={gradient.bottom} onChange={bottom=>changeGradient({bottom})}/>
      </div>
    </> : null}
  </fieldset>;
}
