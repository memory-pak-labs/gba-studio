import { useEffect, useRef, useState } from "react";
import { blendScanlineColors, defaultScanlineControls, normalizeSceneRasterEffects, rasterScanline, sceneScanlineControls, scanlineLayers, SCANLINE_SECOND_TARGETS, type SceneRasterEffects, type SceneScanlineControls } from "../shared/sceneRasterEffects";
import { InspectorNumber, InspectorRange, InspectorSelect, InspectorToggle } from "./InspectorControls";
import { useStudioUiText } from "./studioUiText";

function ScanlineBandFields({ label, top, bottom, onChange }: {
  label: string; top: number; bottom: number; onChange(patch: { top: number } | { bottom: number }): void;
}) {
  const ui = useStudioUiText();
  return <div className="scene-composition-number-grid">
    <InspectorNumber label={ui("{0} · linha inicial", { 0: label })} min={0} max={158} value={top} onChange={top => onChange({ top })} />
    <InspectorNumber label={ui("{0} · linha final", { 0: label })} min={2} max={160} value={bottom} onChange={bottom => onChange({ bottom })} />
  </div>;
}

export function SceneRasterEffectsEditor({ value, enabled, videoMode, onChange }: { value?: SceneRasterEffects; enabled: boolean; videoMode: number; onChange(value: SceneRasterEffects): void }) {
  const ui = useStudioUiText();
  const effects = normalizeSceneRasterEffects(value), { ripple, gradient } = effects;
  const { palette, alpha, mask } = { ...defaultScanlineControls, ...effects };
  const layers = scanlineLayers(videoMode);
  const layerOptions = layers.map(layer => ({ label: layer, value: layer }));
  const secondOptions = SCANLINE_SECOND_TARGETS.filter(layer => layer === "BACKDROP" || layers.includes(layer))
    .map(layer => ({ label: layer === "BACKDROP" ? ui("Cor de fundo") : layer, value: layer }));
  const changeControl = <K extends keyof SceneScanlineControls>(key: K, patch: Partial<SceneScanlineControls[K]>) => {
    onChange({ ...effects, [key]: { ...(effects[key] ?? defaultScanlineControls[key]), ...patch } });
  };
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
    // A backdrop and a single indexed plane make the mask and alpha visible even in an empty scene.
    const hasControls = enabled && (palette.enabled || alpha.enabled || mask.enabled);
    for (let y=0;y<160;++y) {
      const scan = rasterScanline(effects, y, frame);
      const { paletteColor, alpha: opacity, left, right } = sceneScanlineControls(effects, y);
      for (let x=0;x<240;++x) {
        const shifted = (x+(enabled?scan.offset:0)+240)%240;
        let color = enabled && gradient.enabled ? scan.color : 0x5167;
        if (y >= (hasControls ? 40 : 80) && (!enabled || (x >= left && x < right))) {
          const alternate = (Math.floor(shifted / 8) + Math.floor(y / 8)) % 2;
          const foreground = alternate ? (enabled ? paletteColor ?? 0x4566 : 0x4566) : 0x3923;
          color = enabled && opacity !== undefined ? blendScanlineColors(foreground, color, opacity) : foreground;
        }
        const index=(y*240+x)*4;
        for (let c=0;c<3;++c) image.data[index+c]=Math.round(((color>>(c*5))&31)*255/31);
        image.data[index+3]=255;
      }
    }
    context.putImageData(image,0,0);
  }, [JSON.stringify(effects), enabled, frame]);
  return <fieldset className="scene-composition-effect-card scene-raster-editor">
    <legend>{ui("Efeitos por linha")}</legend>
    {!enabled ? <p className="inspector-field-description">{ui("Ative a composição avançada para aplicar os efeitos na cena.")}</p> : null}
    <div className="scene-raster-preview">
      <canvas ref={canvas} width={240} height={160} aria-label={ui("Prévia demonstrativa dos efeitos por linha")} />
      <div><strong>{ui("Prévia demonstrativa · 240 × 160")}</strong><p className="inspector-field-description">{ui("A amostra usa uma camada sobre a cor de fundo. Use Testar cena para conferir as camadas e a paleta do projeto na ROM.")}</p>
        {enabled && ripple.enabled && ripple.speed > 0 ? <button type="button" className="inspector-action" onClick={() => setPlaying(!playing)}>{ui(playing ? "Pausar prévia" : "Reproduzir prévia")}</button> : null}
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
    <InspectorToggle checked={palette.enabled} label={ui("Paleta por linha")} onChange={enabled => changeControl("palette", { enabled })} />
    {palette.enabled ? <>
      <p className="inspector-field-description">{ui("Altera uma entrada da paleta de fundos. As cores inicial e final continuam antes e depois da faixa.")}</p>
      <div className="scene-composition-number-grid">
        <InspectorNumber label={ui("Índice da cor BG")} min={1} max={223} value={palette.index} onChange={index => changeControl("palette", { index })} />
        <label className="inspector-field"><span>{ui("Cor inicial")}</span><input aria-label={ui("Cor inicial da paleta")} type="color" value={palette.from} onChange={event => changeControl("palette", { from: event.currentTarget.value })} /></label>
        <label className="inspector-field"><span>{ui("Cor final")}</span><input aria-label={ui("Cor final da paleta")} type="color" value={palette.to} onChange={event => changeControl("palette", { to: event.currentTarget.value })} /></label>
      </div>
      <ScanlineBandFields label={ui("Paleta")} {...palette} onChange={patch => changeControl("palette", patch)} />
    </> : null}
    <InspectorToggle checked={alpha.enabled} label={ui("Transparência por linha")} onChange={enabled => changeControl("alpha", { enabled })} />
    {alpha.enabled ? <>
      <p className="inspector-field-description">{ui("Mistura duas camadas sobrepostas. 0 mostra a inferior e 16 mantém a superior opaca.")}</p>
      <div className="scene-composition-number-grid">
        <InspectorSelect label={ui("Camada superior")} options={layerOptions} value={alpha.first} onChange={first => changeControl("alpha", { first: first as typeof alpha.first })} />
        <InspectorSelect label={ui("Camada inferior")} options={secondOptions} value={alpha.second} onChange={second => changeControl("alpha", { second: second as typeof alpha.second })} />
        <InspectorNumber label={ui("Opacidade inicial")} min={0} max={16} value={alpha.from} onChange={from => changeControl("alpha", { from })} />
        <InspectorNumber label={ui("Opacidade final")} min={0} max={16} value={alpha.to} onChange={to => changeControl("alpha", { to })} />
      </div>
      <ScanlineBandFields label={ui("Transparência")} {...alpha} onChange={patch => changeControl("alpha", patch)} />
    </> : null}
    <InspectorToggle checked={mask.enabled} label={ui("Máscara por linha")} onChange={enabled => changeControl("mask", { enabled })} />
    {mask.enabled ? <>
      <p className="inspector-field-description">{ui("Recorta a camada entre duas bordas horizontais dentro da faixa. Fora da faixa, a camada aparece inteira.")}</p>
      <InspectorSelect label={ui("Camada da máscara")} options={layerOptions} value={mask.layer} onChange={layer => changeControl("mask", { layer: layer as typeof mask.layer })} />
      <div className="scene-composition-number-grid">
        <InspectorNumber label={ui("Esquerda na linha inicial")} min={0} max={239} value={mask.leftTop} onChange={leftTop => changeControl("mask", { leftTop })} />
        <InspectorNumber label={ui("Direita na linha inicial")} min={1} max={240} value={mask.rightTop} onChange={rightTop => changeControl("mask", { rightTop })} />
        <InspectorNumber label={ui("Esquerda na linha final")} min={0} max={239} value={mask.leftBottom} onChange={leftBottom => changeControl("mask", { leftBottom })} />
        <InspectorNumber label={ui("Direita na linha final")} min={1} max={240} value={mask.rightBottom} onChange={rightBottom => changeControl("mask", { rightBottom })} />
      </div>
      <ScanlineBandFields label={ui("Máscara")} {...mask} onChange={patch => changeControl("mask", patch)} />
    </> : null}
  </fieldset>;
}
