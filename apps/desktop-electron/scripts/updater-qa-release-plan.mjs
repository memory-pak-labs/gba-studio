import { createRequire } from 'node:module';

const { valid, gt } = createRequire(import.meta.url)('semver');

export function updaterQaReleasePlan(environment = process.env) {
  const sourceVersion = environment.GBA_UPDATER_QA_SOURCE_VERSION || '0.1.0-rc.5';
  const targetVersion = environment.GBA_UPDATER_QA_TARGET_VERSION || '0.1.0-rc.6';
  const draft = environment.GBA_UPDATER_QA_TARGET_DRAFT || '';
  const targetSha = environment.GBA_UPDATER_QA_TARGET_SHA || '';
  if (!valid(sourceVersion) || !valid(targetVersion) || !gt(targetVersion, sourceVersion)) throw new Error('Invalid increasing updater QA version pair');
  if (!['', '0', '1'].includes(draft)) throw new Error('Invalid draft flag');
  const targetDraft = draft === '1';
  if (targetDraft && !/^[a-f0-9]{40}$/.test(targetSha)) throw new Error('Draft candidate requires an immutable source commit');
  return { sourceVersion, targetVersion, targetDraft, targetSha };
}

export function validateUpdaterQaRelease(release, plan, role) {
  if (!['source', 'target'].includes(role)) throw new Error('Invalid release role');
  const version = role === 'source' ? plan.sourceVersion : plan.targetVersion;
  if (release.tag_name !== `v${version}`) throw new Error(`Unexpected release tag for ${role}`);
  if (role === 'target' && plan.targetDraft) {
    if (!release.draft) throw new Error('Expected unpublished draft candidate');
    if (release.target_commitish !== plan.targetSha) throw new Error('Draft candidate commit differs from the frozen revision');
  } else if (release.draft) throw new Error(`Expected published ${role} release`);
  return release;
}

export async function loadUpdaterQaRelease(plan, role, request = fetch, token = process.env.GH_TOKEN) {
  const version = role === 'source' ? plan.sourceVersion : plan.targetVersion;
  const draft = role === 'target' && plan.targetDraft;
  const endpoint = draft ? 'releases?per_page=100' : `releases/tags/v${version}`;
  const response = await request(`https://api.github.com/repos/memory-pak-labs/gba-studio/${endpoint}`, {
    redirect: 'error', headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) throw new Error(`GitHub release ${role} returned ${response.status}`);
  const body = await response.json();
  const matches = draft && Array.isArray(body) ? body.filter(item => item.tag_name === `v${version}`) : [body];
  if (matches.length !== 1) throw new Error('Missing or ambiguous draft candidate');
  return validateUpdaterQaRelease(matches[0], plan, role);
}

export function updaterQaAtom(xml, release, plan) {
  if (!plan.targetDraft) {
    if (!xml.includes(`/tag/v${plan.targetVersion}"`) && !xml.includes(`/tag/v${plan.targetVersion}'`)) throw new Error('Published target absent from the GitHub Atom feed');
    return xml;
  }
  validateUpdaterQaRelease(release, plan, 'target');
  const feed = xml.match(/<feed\b[^>]*>/);
  if (!feed) throw new Error('Invalid GitHub Atom fixture');
  const updated = new Date(release.created_at).toISOString();
  const url = `https://github.com/memory-pak-labs/gba-studio/releases/tag/v${plan.targetVersion}`;
  const entry = `<entry><id>${url}</id><updated>${updated}</updated><link rel="alternate" type="text/html" href="${url}"/><title>v${plan.targetVersion}</title><content type="text">Unpublished candidate under test.</content></entry>`;
  return xml.replace(feed[0], `${feed[0]}${entry}`);
}
