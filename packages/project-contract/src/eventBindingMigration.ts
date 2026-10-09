type ProjectData = Record<string, unknown>;

interface BindingMigration {
  legacyKey: string;
  bindingKey: string;
}

const ROOM_BINDING_MIGRATIONS: BindingMigration[] = [
  { legacyKey: "onEnterEventName", bindingKey: "onInit" }
];

const ACTOR_BINDING_MIGRATIONS: BindingMigration[] = [
  { legacyKey: "eventName", bindingKey: "onInteract" },
  { legacyKey: "onInitEventName", bindingKey: "onInit" },
  { legacyKey: "onUpdateEventName", bindingKey: "onUpdate" }
];

const TRIGGER_BINDING_MIGRATIONS: BindingMigration[] = [
  { legacyKey: "eventName", bindingKey: "onEnter" },
  { legacyKey: "onEnterEventName", bindingKey: "onEnter" },
  { legacyKey: "onLeaveEventName", bindingKey: "onLeave" }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function migrateRecord(record: Record<string, unknown>, migrations: BindingMigration[]): Record<string, unknown> {
  let migrated: Record<string, unknown> | null = null;
  let bindings: Record<string, unknown> | null = null;

  for (const migration of migrations) {
    const legacyValue = nonEmptyString(record[migration.legacyKey]);
    if (!legacyValue) continue;

    const currentBindings: Record<string, unknown> = bindings ?? (isRecord(record.eventBindings) ? record.eventBindings : {});
    const currentValue = nonEmptyString(currentBindings[migration.bindingKey]);
    if (currentValue && currentValue !== legacyValue) continue;

    migrated ??= { ...record };
    if (bindings === null) bindings = { ...currentBindings };
    if (!currentValue) bindings[migration.bindingKey] = legacyValue;
    delete migrated[migration.legacyKey];
  }

  if (!migrated) return record;
  migrated.eventBindings = bindings ?? {};
  return migrated;
}

function migrateCollection(
  data: ProjectData,
  key: string,
  migrations: BindingMigration[]
): ProjectData {
  if (!Array.isArray(data[key])) return data;

  let changed = false;
  const records = (data[key] as unknown[]).map((item) => {
    if (!isRecord(item)) return item;
    const migrated = migrateRecord(item, migrations);
    changed ||= migrated !== item;
    return migrated;
  });

  return changed ? { ...data, [key]: records } : data;
}

/**
 * Moves the aliases used by older project documents into contextual event
 * bindings without overwriting a newer binding with a conflicting value.
 */
export function migrateLegacyEventBindings(data: ProjectData): ProjectData {
  let migrated = data;
  for (const key of ["rooms", "scenas"]) {
    migrated = migrateCollection(migrated, key, ROOM_BINDING_MIGRATIONS);
  }
  migrated = migrateCollection(migrated, "actors", ACTOR_BINDING_MIGRATIONS);
  migrated = migrateCollection(migrated, "triggers", TRIGGER_BINDING_MIGRATIONS);
  return migrated;
}
