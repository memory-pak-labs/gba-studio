#!/usr/bin/env python3
"""Rebuild the original coastal score and Foley bank. Python standard library only.
MIT; Memory Pak Labs. No external recordings, samples or melodies.
Run from any directory. The project is updated separately and keeps stable IDs.
"""
import hashlib, json, math, wave
from pathlib import Path
import sys
sys.dont_write_bytecode=True
import palette as p

OUT=Path(__file__).resolve().parent
p.OUT=OUT
(OUT/'sources').mkdir(exist_ok=True)

def harmony(text):
    # bass:triad; explicit voicing supports the shared C4-root sample bank.
    return [(bar.split(':')[0],bar.split(':')[1].split(',')) for bar in text.split(';')]

def phrase(text):
    return [[(int(cell.split(':')[0]),cell.split(':')[1]) for cell in bar.split()] for bar in text.split('|')]

def song(export, title, channels, bars, frames, chords, line, mood, lead=1, driving=False):
    melody=phrase(line)
    # Four distinct phrases, an answering section, and a final tonic cadence.
    if len(melody)<bars:
        answer=[[(pos,p.note(n)+(7 if j%4==0 and pos>=8 else 0)) for pos,n in bar] for j,bar in enumerate(melody)]
        melody=(melody+answer)*4
        melody=melody[:bars]
        tonic=p.note(chords[0][1][0])+24
        melody[-1]=[(0,tonic+7),(4,tonic+2),(8,tonic)]
    entry=p.write_module(export,channels,bars,chords,melody,channels==8,frames,lead,driving)
    entry.update(exportID=export,title=title,context=mood,loop=export!='relay_light')
    return entry

def main():
    # Approved pilot scores reproduced byte-for-byte, including instrument bank.
    coastal=harmony('D2:D3,F#3,A3,E4;C#2:C#3,E3,A3,B3;B1:B2,D3,F#3,A3;G1:G2,B2,D3,F#3;E2:E3,G3,B3,D4;A1:A2,C#3,E3,G3;F#2:F#3,A3,D4,E4;A1:A2,C#3,E3,B3')
    lead=phrase('2:F#5 4:E5 7:D5 10:A4 12:B4 14:D5|0:E5 3:C#5 6:B4 10:A4 14:C#5|0:D5 4:F#5 6:E5 10:D5 14:B4|0:A4 3:B4 6:D5 10:F#5 14:E5|0:E5 4:G5 7:F#5 10:E5 14:D5|0:C#5 4:E5 8:G5 12:E5|0:F#5 3:E5 6:D5 10:B4 14:A4|0:B4 4:C#5 8:E5 10:C#5 14:D5')
    lead += [[(pos,p.note(n)+(12 if j==0 and pos==10 else 7 if j==2 and pos==10 else 0)) for pos,n in bar] for j,bar in enumerate(lead)]
    lead[-1]=[(0,'E5'),(4,'C#5'),(8,'D5')]
    coastal+=coastal[:6]+harmony('A1:A2,C#3,E3,G3;D2:D3,F#3,A3,E4')
    port=p.write_module('brisa_do_porto',12,16,coastal,lead)
    port.update(exportID='farol_enseada',title='Brisa do Porto',context='Porto Lúmen e enseada')
    minor=harmony('D2:D3,F3,A3,E4;Bb1:Bb2,D3,F3,A3;G1:G2,Bb2,D3,A3;A1:A2,C#3,E3,G3')
    quiet=phrase('4:A4 10:E5 14:D5|0:F5 6:D5 12:A4|2:G4 8:A4 12:Bb4|0:E5 8:C#5 14:A4|0:D5 6:E5 10:F5|2:A4 8:F4 12:D5|0:Bb4 6:A4 12:G4|0:E5 6:C#5 10:D5')
    memory=p.write_module('memorias_sob_agua',8,8,minor,quiet,True)
    memory.update(exportID='farol_memorias',title='Memórias sob Água',context='Prólogo, interior e lembranças')
    major=harmony('D2:D3,F#3,A3;G1:G2,B2,D3;B1:B2,D3,F#3;A1:A2,C#3,E3')
    wind=harmony('G1:G2,B2,D3;D2:D3,F#3,A3;E2:E3,G3,B3;C2:C3,E3,G3')
    storm=harmony('E2:E3,G3,B3;C2:C3,E3,G3;A1:A2,C3,E3;B1:B2,D#3,F#3')
    dorian=harmony('D2:D3,F3,A3;G1:G2,B2,D3;C2:C3,E3,G3;A1:A2,C3,E3')
    night=harmony('B1:B2,D3,F#3;G1:G2,B2,D3;E2:E3,G3,B3;F#2:F#3,A#3,C#4')
    music=[port,memory,
      song('farol_tema_principal','O Último Farol',12,16,8,major,'2:D5 5:F#5 8:A5 12:F#5 14:E5|0:D5 4:B4 8:G4 12:A4|0:B4 3:D5 6:F#5 10:E5 14:D5|0:C#5 4:B4 8:A4 12:C#5','Abertura heroica, frase do farol'),
      song('farol_falesias','Pedra e Espuma',10,16,7,wind,'2:G5 4:F#5 7:E5 10:D5 14:B4|0:A4 3:D5 6:F#5 12:E5|0:G5 4:E5 8:B4 12:D5|0:E5 4:D5 8:C5 12:G4','Falésias, travessia e horizonte'),
      song('farol_arena_tatica','Marés em Tabuleiro',10,16,9,dorian,'2:D4 6:A4 10:F4 14:E4|0:G4 6:B4 10:A4 14:G4|2:E4 4:G4 10:C5 14:B4|0:A4 4:G4 10:E4 14:D4','Estratégia: ostinato contido',2),
      song('farol_arena_mare','Guardiões da Maré',12,16,6,minor,'2:D5 4:F5 6:A5 10:G5 12:F5 14:E5|0:F5 3:D5 6:Bb4 10:D5 14:F5|0:G5 2:D5 6:Bb4 10:G4 14:A4|0:C#5 4:E5 6:G5 10:E5 14:D5','Arena: golpes e defesa',1,True),
      song('penedos_vento_de_lumen_candidato','Vento de Lúmen',10,16,7,wind,'2:B4 4:D5 7:G5 10:F#5 14:E5|0:F#5 3:A5 6:F#5 10:D5 14:A4|0:B4 4:E5 8:G5 12:F#5|0:E5 2:G5 6:E5 10:D5 14:C5','Plataforma: arpejos e saltos'),
      song('corrida_circuito_dos_farois','Circuito dos Faróis',12,16,5,major,'2:D5 4:A4 6:D5 8:F#5 10:A5 14:F#5|0:G5 2:D5 6:B4 8:D5 12:G5|0:F#5 2:B4 6:D5 10:F#5 14:E5|0:E5 2:C#5 6:B4 10:A4 14:C#5','Corrida: impulso e marcação',2,True),
      song('corrida_rota_da_mare','Rota da Maré',12,16,6,night,'2:B4 5:D5 8:F#5 10:E5 14:D5|0:G5 3:F#5 6:D5 10:B4 14:G4|0:E5 4:G5 6:B5 10:G5 14:F#5|0:F#5 2:A#5 6:F#5 10:C#5 14:A#4','Corrida: rota alternativa',1,True),
      song('tempestade_travessia','Velas na Tempestade',12,16,6,storm,'2:E5 4:G5 7:B5 10:A5 14:G5|0:E5 2:G5 6:E5 10:C5 14:D5|0:E5 3:A5 6:G5 10:E5 14:C5|0:D#5 4:F#5 8:A5 12:F#5','Voo: tensão crescente',1,True),
      song('tempestade_farol','Luz Contra o Temporal',12,16,5,minor,'2:A4 4:D5 6:F5 8:A5 10:G5 14:E5|0:F5 3:Bb5 6:A5 10:F5 14:D5|0:G5 2:Bb5 6:G5 10:D5 14:Bb4|0:E5 4:C#5 8:A4 12:C#5','Clímax aéreo',2,True),
      song('relay_pulse','Coração do Relé',12,16,7,minor,'2:D4 4:A4 8:Eb5 10:D5 14:A4|0:Bb4 4:F5 6:E5 10:D5 14:Bb4|0:G4 2:D5 6:Db5 10:Bb4 14:G4|0:A4 4:C#5 8:E5 12:G5','Chefe: pulso, cobre e vidro',2,True),
      song('relay_light','O Farol Acende',8,4,8,major,'2:D5 4:F#5 8:A5 12:F#5|0:G5 4:B5 8:G5 12:D5|0:F#5 4:D5 8:B4 12:D5|0:E5 4:C#5 8:D5','Resolução do relé, sem loop'),
      song('dungeon_tide','Galerias da Maré',8,16,10,minor,'4:D4 10:A4 14:E5|2:F4 8:Bb4 14:D5|2:G4 8:D5 12:Bb4|0:E5 6:C#5 12:A4','Dungeon: silêncio entre gotas',5),
      song('dungeon_patrol','Sentinela de Cobre',10,16,8,night,'2:B3 4:F#4 10:D5 14:C#5|0:G4 6:B4 10:D5 14:B4|0:E4 4:B4 8:G4 12:E5|0:F#4 4:A#4 10:C#5 14:F#5','Dungeon: máquina em patrulha',2),
      song('mapa_mar_aberto','Cartas de Mar Aberto',8,16,9,major,'2:F#4 6:A4 10:D5 14:E5|0:G5 6:D5 10:B4 14:A4|0:F#5 4:D5 8:B4 12:F#4|0:A4 4:C#5 8:E5 12:C#5','Mapa: navegação e descoberta')]
    # Each specification has its own timing, intervals, transients and noise.
    # (frequency, onset, length, gain, Hz/second bend, resonator)
    def b(hz,t=0,d=.18,g=.55,bend=0,kind='bell'):return (hz,t,d,g,bend,kind)
    def w(hz,t=0,d=.15,g=.55,bend=0):return b(hz,t,d,g,bend,'wood')
    specs=[
      ('farol_sfx_texto',.045,[w(760,d=.034,g=.24)],.008),
      ('farol_sfx_dialogo',.18,[b(659,d=.12,g=.42),b(880,.045,.13,.32)],0),
      ('farol_sfx_confirmar',.28,[b(587.33,d=.2,g=.65),b(880,.055,.22,.38)],0),
      ('farol_sfx_sinal',.58,[b(440,d=.35,g=.48),b(587.33,.16,.36,.38)],.012),
      ('farol_sfx_porta',.48,[w(124,d=.11,g=.70,bend=-180),w(185,.13,.28,.32,-100)],.2),
      ('farol_sfx_alarme',.65,[b(740,0,.19,.54),b(554,.21,.19,.48),b(740,.42,.19,.54)],.025),
      ('farol_sfx_vitoria',1.05,[b(587,0,.65,.5),b(740,.12,.65,.4),b(880,.24,.72,.38),b(1175,.42,.60,.3)],0),
      ('farol_sfx_tatica_cursor',.08,[w(650,d=.065,g=.3)],.008),
      ('farol_sfx_tatica_selecionar',.23,[w(440,d=.12,g=.5),b(660,.07,.15,.36)],0),
      ('farol_sfx_tatica_cancelar',.22,[w(494,d=.12,g=.5,bend=-400),w(330,.07,.14,.36)],0),
      ('farol_sfx_tatica_mover',.17,[w(145,d=.08,g=.52),w(190,.07,.08,.40)],.045),
      ('farol_sfx_tatica_ataque',.25,[w(280,d=.12,g=.58,bend=-950),w(108,.04,.18,.62)],.28),
      ('farol_sfx_tatica_impacto',.30,[w(95,d=.26,g=.82,bend=-140),b(560,.01,.12,.28)],.42),
      ('farol_sfx_tatica_turno',.48,[b(392,d=.28,g=.48),b(523,.10,.28,.4),b(784,.20,.26,.3)],0),
      ('farol_sfx_tatica_vitoria',.95,[b(392,d=.62,g=.5),b(494,.12,.62,.4),b(587,.24,.62,.38),b(784,.36,.58,.34)],0),
      ('farol_sfx_tatica_derrota',.88,[w(392,d=.45,g=.58),w(349,.16,.48,.48),w(294,.32,.5,.42)],.012),
      ('arena_impacto',.22,[w(82,d=.19,g=.85,bend=-110),w(220,.005,.11,.34)],.42),
      ('arena_defesa',.32,[w(164,d=.30,g=.80,bend=-160),b(391,.006,.12,.25,bend=-80)],.36),
      ('arena_especial',.60,[w(160,d=.26,g=.6,bend=1100),b(784,.15,.36,.45),b(1175,.24,.34,.32)],.18),
      ('arena_golpe_ar',.16,[w(360,d=.12,g=.35,bend=-1600)],.18),
      ('penedos_salto_candidato',.24,[w(280,d=.21,g=.60,bend=1900)],.035),
      ('penedos_pouso_candidato',.13,[w(90,d=.11,g=.48,bend=-100)],.17),
      ('penedos_impulso_candidato',.38,[w(240,d=.26,g=.56,bend=1850),b(880,.15,.20,.3)],.12),
      ('penedos_impacto_candidato',.26,[w(110,d=.22,g=.68,bend=-200),w(170,.03,.15,.28)],.3),
      ('penedos_item_candidato',.75,[b(587.33,d=.55,g=.55),b(739.99,.09,.50,.40),b(880,.18,.52,.38)],0),
      ('penedos_checkpoint_candidato',.63,[b(440,d=.38,g=.48),b(660,.12,.38,.38),b(880,.24,.36,.32)],0),
      ('corrida_contagem',.20,[w(440,d=.16,g=.58),b(880,.005,.10,.2)],.015),
      ('corrida_largada',.52,[b(880,d=.42,g=.56),b(1175,.04,.38,.30)],.06),
      ('corrida_motor',.19,[w(92,d=.17,g=.5,bend=450),w(184,d=.15,g=.22,bend=900)],.045),
      ('corrida_freio',.21,[w(610,d=.18,g=.38,bend=-1800)],.24),
      ('corrida_impacto',.27,[w(75,d=.24,g=.8,bend=-90),w(188,.02,.16,.35)],.44),
      ('corrida_checkpoint',.38,[b(659,d=.23,g=.44),b(988,.10,.25,.36)],0),
      ('corrida_chegada',.92,[b(523,d=.60,g=.5),b(659,.12,.6,.4),b(784,.24,.6,.34),b(1047,.36,.54,.30)],0),
      ('tempestade_disparo',.14,[b(920,d=.12,g=.45,bend=-4200)],.02),
      ('tempestade_dano',.33,[w(185,d=.28,g=.7,bend=-370),b(415,.03,.16,.28)],.3),
      ('tempestade_explosao',.48,[w(66,d=.42,g=.85,bend=-90),w(130,d=.26,g=.3)],.58),
      ('tempestade_alerta',.54,[b(880,d=.14,g=.44),b(659,.18,.14,.44),b(880,.36,.14,.44)],.008),
      ('tempestade_modulo',.58,[b(740,d=.4,g=.42),b(988,.12,.4,.34),b(1319,.24,.32,.24)],0),
      ('relay_cursor',.095,[w(587,d=.075,g=.34),b(1175,d=.04,g=.12)],.012),
      ('relay_confirmar',.27,[b(523,d=.18,g=.48),b(784,.065,.18,.34)],0),
      ('relay_chave',.44,[w(220,d=.1,g=.52),b(659,.08,.3,.38),b(988,.15,.24,.22)],.055),
      ('relay_energia',.56,[b(294,d=.48,g=.4,bend=600),b(587,.06,.42,.28,bend=1200)],.075),
      ('relay_dano',.29,[w(98,d=.25,g=.72,bend=-180),b(370,.01,.13,.23)],.32),
      ('relay_defesa',.32,[b(294,d=.27,g=.54),b(739,.006,.20,.3),w(147,d=.12,g=.3)],.18),
      ('relay_desativar',.85,[w(440,d=.48,g=.55,bend=-450),w(220,.2,.55,.42,bend=-180)],.16),
      ('dungeon_passo',.10,[w(98,d=.08,g=.42)],.08),
      ('dungeon_giro',.14,[w(210,d=.11,g=.36,bend=450)],.055),
      ('dungeon_impacto',.28,[w(73,d=.25,g=.72,bend=-90),b(293,.01,.13,.24)],.32),
      ('dungeon_celula',.52,[b(494,d=.35,g=.42),b(740,.1,.35,.32),b(988,.2,.3,.24)],0),
      ('dungeon_porta',.47,[w(82,d=.16,g=.58,bend=-80),w(164,.14,.27,.38,bend=-90)],.22),
      ('dungeon_bloqueio',.19,[w(138,d=.16,g=.48),b(277,d=.11,g=.22)],.095),
      ('dungeon_desativar',.70,[w(330,d=.34,g=.52,bend=-280),w(147,.16,.44,.4,bend=-90)],.13),
      ('radio_lume_pcm',1.45,[b(440,.08,.32,.32),b(587,.32,.36,.34),b(740,.56,.38,.32),b(880,.80,.5,.3)],.10),
      ('menu_abrir_v1',.34,[w(294,d=.16,g=.45),b(587,.06,.24,.36)],0),
      ('menu_navegar_v1',.08,[w(880,d=.055,g=.27)],.004),
      ('menu_confirmar_v1',.27,[b(659,d=.18,g=.5),b(988,.055,.20,.34)],0),
      ('menu_voltar_v1',.23,[w(440,d=.12,g=.65,bend=-600),w(293.66,.07,.15,.40)],0),
      ('menu_indisponivel_v1',.24,[w(220,d=.13,g=.40),w(196,.07,.14,.34)],.012)]
    fx=[]
    for export,duration,layers,noise in specs:
        entry=p.sfx(export,duration,layers,noise);entry['exportID']=export;fx.append(entry)
    assert len(music)==16 and len(fx)==58
    manifest={'schema':1,'bank':'coastal-v1','direction':'Aventura costeira e fantasia — O Último Farol','license':'MIT','provenance':'Original compositions and deterministic synthesis by Memory Pak Labs; no third-party melodies, samples, recordings or model-generated recordings. Seed 7069.','approval':'User approved the pilot palette and authorized renewal of all remaining music and SFX on 2026-11-09. Technical ROM validation precedes integration.','music':music,'sfx':fx}
    manifest['files']={str(f.relative_to(OUT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted((OUT/'sources').iterdir())}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Generated',len(music),'scores and',len(fx),'effects')

if __name__=='__main__':main()
