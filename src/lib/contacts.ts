export const CONTACT_SOURCES = ['extension', 'card_scan', 'manual'] as const;
export const INTERACTION_TYPES = ['email_sent', 'note', 'scan'] as const;

export type ContactSource = (typeof CONTACT_SOURCES)[number];
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export type Contact = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  source: ContactSource;
  raw_capture: Record<string, unknown>;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type ContactInput = {
  name?: string | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  source?: ContactSource;
  raw_capture?: Record<string, unknown>;
  tags?: string[];
};

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const TEXT_LIMITS = {
  name: 200,
  email: 320,
  company: 200,
  title: 200,
  phone: 50
} as const;

const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 64;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The database CHECK enforces lowercase, so normalizing here is required, not cosmetic.
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function readText(
  raw: unknown,
  field: keyof typeof TEXT_LIMITS
): Validated<string | null | undefined> {
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: `${field} must be a string` };

  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > TEXT_LIMITS[field]) {
    return { ok: false, error: `${field} must be ${TEXT_LIMITS[field]} characters or fewer` };
  }
  return { ok: true, value: trimmed };
}

function readTags(raw: unknown): Validated<string[] | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (!Array.isArray(raw)) return { ok: false, error: 'tags must be an array of strings' };
  if (raw.length > MAX_TAGS) return { ok: false, error: `tags must contain ${MAX_TAGS} entries or fewer` };

  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') return { ok: false, error: 'tags must be an array of strings' };
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TAG_LENGTH) {
      return { ok: false, error: `each tag must be ${MAX_TAG_LENGTH} characters or fewer` };
    }
    if (!tags.includes(trimmed)) tags.push(trimmed);
  }
  return { ok: true, value: tags };
}

function readRawCapture(raw: unknown): Validated<Record<string, unknown> | undefined> {
  if (raw === undefined || raw === null) return { ok: true, value: undefined };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'raw_capture must be an object' };
  }
  return { ok: true, value: raw as Record<string, unknown> };
}

// requireSource is true on create and false on patch, where source may be left alone.
export function validateContactInput(body: unknown, requireSource: boolean): Validated<ContactInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const input = body as Record<string, unknown>;
  const value: ContactInput = {};

  for (const field of ['name', 'company', 'title', 'phone'] as const) {
    const result = readText(input[field], field);
    if (!result.ok) return result;
    if (result.value !== undefined) value[field] = result.value;
  }

  const email = readText(input.email, 'email');
  if (!email.ok) return email;
  if (email.value !== undefined) {
    if (email.value === null) {
      value.email = null;
    } else {
      const normalized = normalizeEmail(email.value);
      if (!EMAIL_PATTERN.test(normalized)) return { ok: false, error: 'Invalid email address format' };
      value.email = normalized;
    }
  }

  if (input.source !== undefined) {
    if (!CONTACT_SOURCES.includes(input.source as ContactSource)) {
      return { ok: false, error: `source must be one of: ${CONTACT_SOURCES.join(', ')}` };
    }
    value.source = input.source as ContactSource;
  } else if (requireSource) {
    return { ok: false, error: `source is required and must be one of: ${CONTACT_SOURCES.join(', ')}` };
  }

  const tags = readTags(input.tags);
  if (!tags.ok) return tags;
  if (tags.value !== undefined) value.tags = tags.value;

  const rawCapture = readRawCapture(input.raw_capture);
  if (!rawCapture.ok) return rawCapture;
  if (rawCapture.value !== undefined) value.raw_capture = rawCapture.value;

  return { ok: true, value };
}

export type InteractionInput = { type: InteractionType; payload: Record<string, unknown> };

export function validateInteractionInput(body: unknown): Validated<InteractionInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  const input = body as Record<string, unknown>;
  if (!INTERACTION_TYPES.includes(input.type as InteractionType)) {
    return { ok: false, error: `type must be one of: ${INTERACTION_TYPES.join(', ')}` };
  }

  const payload = readRawCapture(input.payload);
  if (!payload.ok) return { ok: false, error: 'payload must be an object' };

  return { ok: true, value: { type: input.type as InteractionType, payload: payload.value ?? {} } };
}

// Builds the complete row to upsert. Fields the caller omitted keep their existing
// values, so an extension capture holding only an email can't wipe a name that a
// card scan already supplied.
export function mergeContactForUpsert(
  existing: Contact | null,
  input: ContactInput,
  userId: string
): Record<string, unknown> {
  const pick = <K extends keyof ContactInput>(field: K) =>
    input[field] !== undefined ? input[field] : existing?.[field as keyof Contact] ?? null;

  return {
    user_id: userId,
    name: pick('name'),
    email: input.email !== undefined ? input.email : existing?.email ?? null,
    company: pick('company'),
    title: pick('title'),
    phone: pick('phone'),
    source: input.source ?? existing?.source ?? 'manual',
    // Namespaced by source so a second capture adds to the record instead of replacing it.
    raw_capture: mergeRawCapture(existing?.raw_capture, input.raw_capture, input.source ?? existing?.source),
    tags: input.tags ?? existing?.tags ?? []
  };
}

function mergeRawCapture(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
  source: ContactSource | undefined
): Record<string, unknown> {
  const base = existing ?? {};
  if (!incoming || !source) return base;
  return { ...base, [source]: incoming };
}
