import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(new URL('../../../.github/workflows/release-assets.yml', import.meta.url), 'utf8');
const body = workflow.split("python3 - <<'PY'\n")[1].split('\n          PY')[0]
  .split('\n').map(line => line.slice(10)).join('\n');
const fixture = String.raw`
import os, json, hashlib, threading, contextlib, io
from pathlib import Path
from unittest.mock import patch

version = '0.1.0-rc.2'; sha = 'a' * 40; tag = 'v' + version
os.environ.update(GITHUB_REPOSITORY='owner/repo', RELEASE_TAG=tag, PACKAGE_RUN_ID='123', SOURCE_SHA=sha)
scenario = os.environ['RELEASE_FIXTURE_SCENARIO']
lock = threading.RLock(); uploads = []; deleted = []
def digest(data): return hashlib.sha256(data).hexdigest()
def asset(name, data): return dict(name=name, size=len(data), digest='sha256:' + digest(data), state='uploaded')
ci = {
 'GBA-Studio-windows-x64': ['GBA Studio Setup '+version+'.exe', 'GBA Studio-'+version+'-win.zip', 'GBA-Studio-windows-x64-licenses-and-sources.zip'],
 'GBA-Studio-linux-x64': ['GBA-Studio-'+version+'-linux-amd64.deb', 'GBA-Studio-'+version+'-linux-x64.tar.gz', 'GBA-Studio-'+version+'-linux-x86_64.AppImage', 'GBA-Studio-linux-x64-licenses-and-sources.zip']}
def public_name(name):
 name = name.replace(' ', '.')
 return name.replace('GBA-Studio-windows-x64-licenses', 'GBA-Studio-'+version+'-windows-x64-licenses').replace('GBA-Studio-linux-x64-licenses', 'GBA-Studio-'+version+'-linux-x64-licenses')
payloads = {name: name.encode() for names in ci.values() for name in names}
checksums = {public_name(name): digest(data) for name, data in payloads.items()}
files = []; existing = {}; content = {}
for arch in ['arm64', 'x64']:
 for extension in ['dmg', 'zip']:
  name = 'GBA-Studio-'+version+'-macOS-'+arch+'.'+extension
  data = name.encode(); part = 'upload-chunk-mac-'+arch+'-'+extension+'-000.part'
  checksums[name] = digest(data); content[part] = data; content[name] = data
  existing[part] = asset(part, data)
  files.append(dict(name=name, bytes=len(data), sha256=digest(data), parts=[dict(name=part, bytes=len(data), sha256=digest(data))]))
# Already uploaded files and metadata must survive without replacement.
kept = files[0]['name']; existing[kept] = asset(kept, kept.encode())
for name in ['BUILD_INFO.json', 'VALIDATION.md', 'RELEASE_NOTES.md', 'GBA-Studio-'+version+'-macos-arm64-licenses-and-sources.zip', 'GBA-Studio-'+version+'-macos-x64-licenses-and-sources.zip']:
 content[name] = name.encode(); existing[name] = asset(name, content[name]); checksums[name] = digest(content[name])
content['SHA256SUMS.txt'] = ''.join(f'{value}  {name}\n' for name, value in checksums.items()).encode()
manifest = dict(tag=tag, sourceTagTarget=sha, files=files)
content['UPLOAD_CHUNKS.json'] = json.dumps(manifest).encode()
for name in ['SHA256SUMS.txt', 'UPLOAD_CHUNKS.json']: existing[name] = asset(name, content[name])
if scenario == 'tampered-chunk': content[files[-1]['parts'][0]['name']] = b'tampered'
baseline = {name: dict(value) for name, value in existing.items() if not name.startswith('upload-chunk-') and name != 'UPLOAD_CHUNKS.json'}

def gh(args, text=True):
 assert args[0] == 'gh'; args = args[1:]
 with lock:
  if args[:2] == ['release', 'view']:
   return json.dumps(dict(isDraft=True, tagName=tag, targetCommitish=sha, createdAt='2026-10-31T12:00:00Z', assets=list(existing.values())))
  if args[0] == 'api':
   return json.dumps(dict(head_sha=sha, conclusion='failure' if scenario == 'failed-ci' else 'success', path='.github/workflows/desktop-packages.yml'))
  if args[:2] == ['release', 'download']:
   name = args[args.index('--pattern')+1]; directory = Path(args[args.index('--dir')+1]); directory.mkdir(parents=True, exist_ok=True); (directory/name).write_bytes(content[name]); return ''
  if args[:2] == ['run', 'download']:
   name = args[args.index('--name')+1]; directory = Path(args[args.index('--dir')+1]); directory.mkdir(parents=True, exist_ok=True)
   for filename in ci[name]: (directory/filename).write_bytes(payloads[filename])
   return ''
  if args[:2] == ['release', 'upload']:
   path = Path(args[3]); name = path.name; assert name not in existing; content[name] = path.read_bytes(); existing[name] = asset(name, content[name]); uploads.append(name); return ''
  if args[:2] == ['release', 'delete-asset']:
   name = args[3]; assert name.startswith('upload-chunk-') or name == 'UPLOAD_CHUNKS.json'; deleted.append(name); del existing[name]; return ''
  raise AssertionError(args)

import subprocess
with patch.object(subprocess, 'check_output', gh):
 try:
  exec(compile(os.environ['RELEASE_WORKFLOW_PYTHON'], 'release-assets.yml', 'exec'), {})
 except AssertionError:
  assert scenario in ['tampered-chunk', 'failed-ci']; assert not uploads and not deleted
 else:
  assert scenario == 'success'
  assert all(existing[name] == value for name, value in baseline.items())
  assert len(existing) == 20 and len(deleted) == 5
  import base64
  for feed_name, expected in {
   'latest.yml': ['GBA.Studio.Setup.'+version+'.exe'],
   'latest-linux.yml': ['GBA-Studio-'+version+'-linux-x86_64.AppImage'],
   'latest-mac.yml': ['GBA-Studio-'+version+'-macOS-arm64.zip', 'GBA-Studio-'+version+'-macOS-x64.zip']}.items():
   feed = json.loads(content[feed_name]); assert feed['version'] == version
   assert {item['url'] for item in feed['files']} == set(expected)
   for item in feed['files']:
    data = content[item['url']]; assert item['size'] == len(data)
    assert item['sha512'] == base64.b64encode(hashlib.sha512(data).digest()).decode()
   assert all(uploads.index(name) < uploads.index(feed_name) for name in expected if name in uploads)
  assert kept not in uploads
  assert not any('universal' in name.lower() for name in existing)
print('fixture OK')
`;

describe('montagem dos instaladores separados na release draft', () => {
  it.each(['success', 'tampered-chunk', 'failed-ci'])('%s', scenario => {
    const directory = mkdtempSync(join(tmpdir(), 'gba-release-workflow-'));
    try {
      const output = execFileSync(process.env.GBA_STUDIO_TEST_PYTHON ?? 'python3', ['-c', fixture], {
        cwd: directory,
        env: { ...process.env, RELEASE_WORKFLOW_PYTHON: body, RELEASE_FIXTURE_SCENARIO: scenario },
        encoding: 'utf8'
      });
      expect(output).toContain('fixture OK');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
