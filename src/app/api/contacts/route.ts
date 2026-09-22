import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/supabase';
import {
  CONTACT_SOURCES,
  type Contact,
  type ContactSource,
  mergeContactForUpsert,
  validateContactInput
} from '@/lib/contacts';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const CONTACT_COLUMNS =
  'id, user_id, name, email, company, title, phone, source, raw_capture, tags, created_at, updated_at';

// Upsert by email within the caller's own contacts (ADR-002). A contact with no
// email is always a new row: there is nothing to match it against.
export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = validateContactInput(body, true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { supabase, user } = auth;
  const input = parsed.value;

  let existing: Contact | null = null;
  if (input.email) {
    const { data, error } = await supabase
      .from('contacts')
      .select(CONTACT_COLUMNS)
      .eq('user_id', user.id)
      .eq('email', input.email)
      .maybeSingle();

    if (error) {
      console.error('contacts lookup failed:', error);
      return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
    }
    existing = data as Contact | null;
  }

  const row = mergeContactForUpsert(existing, input, user.id);

  const { data, error } = await supabase
    .from('contacts')
    .upsert(row, { onConflict: 'user_id,email' })
    .select(CONTACT_COLUMNS)
    .single();

  if (error) {
    console.error('contacts upsert failed:', error);
    return NextResponse.json({ error: 'Failed to save contact' }, { status: 500 });
  }

  return NextResponse.json(data, { status: existing ? 200 : 201 });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const params = req.nextUrl.searchParams;

  const source = params.get('source');
  if (source && !CONTACT_SOURCES.includes(source as ContactSource)) {
    return NextResponse.json(
      { error: `source must be one of: ${CONTACT_SOURCES.join(', ')}` },
      { status: 400 }
    );
  }

  const limit = Math.min(Number(params.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(Number(params.get('offset')) || 0, 0);

  let query = auth.supabase
    .from('contacts')
    .select(CONTACT_COLUMNS, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (source) query = query.eq('source', source);

  const tag = params.get('tag');
  if (tag) query = query.contains('tags', [tag]);

  const search = params.get('search')?.trim();
  if (search) {
    // Commas and parentheses would break out of PostgREST's or() filter syntax.
    const safe = search.replace(/[,()]/g, ' ');
    query = query.or(
      `name.ilike.%${safe}%,email.ilike.%${safe}%,company.ilike.%${safe}%,title.ilike.%${safe}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('contacts list failed:', error);
    return NextResponse.json({ error: 'Failed to load contacts' }, { status: 500 });
  }

  return NextResponse.json({ data, count, limit, offset });
}
