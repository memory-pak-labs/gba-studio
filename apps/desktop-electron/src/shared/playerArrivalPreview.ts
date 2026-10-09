import type { GBAProjectData } from './projectFile.js';
import { resolveGbaActorSprite } from './gbaRendering.js';

/** Read-only projection: an arrival does not create or move a project actor. */
export function playerArrivalPreview(data: GBAProjectData, roomName: string, playerName: string | null, direction: string) {
  const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  const actor = records(data.actors).find(a => a.roomName === roomName && a.name === playerName);
  if (!actor) return null;
  const animations = records(data.animations).filter(a => a.spriteSheet === actor.spriteSheet);
  const idle = animations.filter(a => a.state === 'idle' || String(a.name).startsWith('idle_'));
  const animationDirection = (animation: Record<string, unknown>): string | null => {
    if (typeof animation.direction === 'string' && animation.direction !== 'none') return animation.direction;
    const match = String(animation.name ?? '').match(/_(up|down|left|right)$/);
    return match?.[1] ?? null;
  };
  const exact = idle.find(a => animationDirection(a) === direction);
  const neutral = idle.find(a => animationDirection(a) === null);
  const animationState = records(data.animationStates).find(state => state.id === actor.animationStateID);
  const canMirrorLeft = direction === 'left' && animationState?.mirrorLeftFromRight === true;
  const mirrorSource = canMirrorLeft ? idle.find(a => animationDirection(a) === 'right') : null;
  const authoredAnimationName = typeof actor.animationName === 'string' ? actor.animationName : null;
  const stableMovementPose = authoredAnimationName && /^(fly|flight|flying|hover|float)(?:$|[_-])/i.test(authoredAnimationName)
    ? animations.find(a => a.name === authoredAnimationName || a.id === authoredAnimationName)
    : null;
  const animation = exact ?? neutral ?? mirrorSource ?? stableMovementPose;
  if (!animation) return null;
  const animationName = typeof animation.name === 'string'
    ? animation.name
    : typeof animation.id === 'string' ? animation.id : null;
  if (!animationName) return null;
  const sprite = resolveGbaActorSprite(data, { ...actor, animationName });
  if (!sprite?.frame) return null;
  return { sprite, flipX: !exact && !neutral && Boolean(mirrorSource), actor };
}
