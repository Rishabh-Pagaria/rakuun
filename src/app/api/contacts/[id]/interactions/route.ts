import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authenticateRequest } from '@/lib/supabase';
import { isUuid, validateInteractionInput } from '@/lib/contacts';

const INTERACTION_COLUMNS = 'id, contact_id, type, payload, created_at';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type RouteContext = { params: Promise<{ id: string }> };

// RLS already blocks writing to someone else's contact, but it surfaces as a
// generic failure - checking first turns that into a clean 404.
async function contactExists(supabase: SupabaseClient, contactId: string) {
  const { data } = await supabase.from('contacts').select('id').eq('id', contactId).maybeSingle();
  return Boolean(data);
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = validateInteractionInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!(await contactExists(auth.supabase, id))) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from('interactions')
    .insert({ contact_id: id, type: parsed.value.type, payload: parsed.value.payload })
    .select(INTERACTION_COLUMNS)
    .single();

  if (error) {
    console.error('interaction insert failed:', error);
    return NextResponse.json({ error: 'Failed to log interaction' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });

  if (!(await contactExists(auth.supabase, id))) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Math.max(Number(req.nextUrl.searchParams.get('offset')) || 0, 0);

  const { data, error, count } = await auth.supabase
    .from('interactions')
    .select(INTERACTION_COLUMNS, { count: 'exact' })
    .eq('contact_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('interactions list failed:', error);
    return NextResponse.json({ error: 'Failed to load interactions' }, { status: 500 });
  }

  return NextResponse.json({ data, count, limit, offset });
}
