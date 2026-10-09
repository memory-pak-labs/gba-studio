"""Copy the explicitly approved BG v3 / OBJ v2 bytes; never re-quantize them."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[2]
EXTERNAL = Path('/Users/example/Pictures/Assets Exemplo')
BG = EXTERNAL / 'menus-fundos-titulos-2026-09-30-v3-candidate'
OBJ = EXTERNAL / 'menus-atores-nativos-2026-09-30-v2-candidate'
OUT = ROOT / 'tools/gba-sprite-prep/production/neutral-menus-v3-approved'
ASSETS = ROOT / 'apps/desktop-electron/default-assets/templates/exemplo-gba/Assets'
BACKUP = ROOT / 'artifacts/qa/neutral-menus-v3-2026-09-30/before/Assets'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def install(source, relative):
    destination = ASSETS / relative
    previous = BACKUP / relative
    if destination.exists() and not previous.exists():
        previous.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(destination, previous)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    assert sha(source) == sha(destination)

OUT.mkdir(parents=True, exist_ok=True)
for source, name in [(BG, 'background-source-candidate'), (OBJ, 'actor-source-candidate')]:
    destination = OUT / name
    if not destination.exists():
        shutil.copytree(source, destination)
(OUT / 'prepared').mkdir(exist_ok=True)
manifest = {'approval': {'date': '2026-09-30', 'actorVersion': 2, 'backgroundVersion': 3,
    'scope': 'Eight compositions, 49 native actors and worked titles baked in BG.',
    'userMessage': 'aprovado', 'approved': True}, 'backgrounds': {}, 'sprites': {},
    'sourcePreservation': 'Immutable sources/reviews retained. Prepared PNGs copied byte-for-byte.',
    'paletteStatus': 'attention: palette preparation remaps colors; not pixel-equivalence with originals.'}
for layout in json.loads((BG / 'reports/layouts.json').read_text()):
    name = layout['scene']
    source = BG / 'backgrounds' / f'{name}-palette.png'
    target = OUT / 'prepared' / f'neutral-{name}-gba.png'
    shutil.copy2(source, target)
    report = json.loads((BG / 'reports' / f'{name}-palette.json').read_text())
    manifest['backgrounds'][name] = {'file': target.name, 'sha256': sha(target), 'report': report,
        'title': layout['title'], 'titleBakedIntoBackground': True}
    install(target, Path('backgrounds') / target.name)
for row in json.loads((OBJ / 'reports/review-manifest.json').read_text())['assets']:
    source = OBJ / row['simulation']
    assert sha(source) == row['simulationSha256']
    target = OUT / 'prepared' / source.name
    shutil.copy2(source, target)
    image = Image.open(target).convert('RGBA')
    colors = {p[:3] for p in image.getdata() if p[3]}
    assert len(colors) <= 15 and {p[3] for p in image.getdata()} <= {0, 255}
    manifest['sprites'][row['id']] = {'file': target.name, 'width': image.width,
        'height': image.height, 'visibleColors': len(colors), 'sha256': sha(target)}
    install(target, Path('sprites') / target.name)
assert len(manifest['backgrounds']) == 8 and len(manifest['sprites']) == 49
(OUT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
(OUT / 'README.md').write_text('''# Menus aprovados v3

Fundos v3 e atores v2 aprovados pelo usuário em 30/09/2026.
240 × 160, títulos fixos incorporados, dados e atores separados.
Os diretórios de fontes preservam a classificação histórica de candidatos.
Este manifesto registra a aprovação posterior; os originais permanecem imutáveis.
Preparados e assets canônicos têm bytes idênticos. Não reaplicar quantização.
Verificação integrada: artifacts/qa/neutral-menus-v3-2026-09-30/RESULTADO.md.
''')
print(json.dumps({'backgrounds': 8, 'sprites': 49, 'byteIdentical': True}))
