export function preserveReferencedSceneEvents(generatedEvents, sourceEvents, scenes) {
  const referencedNames = new Set();
  for (const scene of scenes) {
    if (typeof scene.onEnterEventName === "string" && scene.onEnterEventName) {
      referencedNames.add(scene.onEnterEventName);
    }
    for (const eventName of Object.values(scene.eventBindings ?? {})) {
      if (typeof eventName === "string" && eventName) referencedNames.add(eventName);
    }
  }

  const generatedNames = new Set(generatedEvents.map((event) => event.name));
  const generatedIDs = new Set(generatedEvents.map((event) => event.id));
  const retained = sourceEvents.filter((event) => (
    referencedNames.has(event.name)
    && !generatedNames.has(event.name)
    && !generatedIDs.has(event.id)
  ));
  return [...generatedEvents, ...retained];
}
