import { describe, expect, it } from "vitest";
import { createEventInProject, deriveEventsWorkspacePresentation, updateEventStepInProject } from "./eventsWorkspace.js";

describe("editing the visible first step of a new script", () => {
  it.each([false, true])("replaces the displayed noop when steps is empty=%s", emptySteps => {
    const created = createEventInProject({}, { id: "shared", name: "shared_animation", category: "Custom" });
    const data = emptySteps ? { ...created, events: [{ ...(created.events as object[])[0], steps: [] }] } : created;
    const before = JSON.stringify(data);
    expect(deriveEventsWorkspacePresentation(data).groups[0]?.events[0]?.steps[0]?.command).toBe("noop");
    const next = updateEventStepInProject(data, "shared", 0, { command: 'play_actor_animation "Actor 3" walk_right true' });
    expect(deriveEventsWorkspacePresentation(next).groups[0]?.events[0]?.steps[0]?.command)
      .toBe('play_actor_animation "Actor 3" walk_right true');
    expect(JSON.stringify(data)).toBe(before);
    const restored = JSON.parse(JSON.stringify(next));
    expect(deriveEventsWorkspacePresentation(restored).groups[0]?.events[0]?.steps[0]?.command)
      .toBe('play_actor_animation "Actor 3" walk_right true');
  });
});
