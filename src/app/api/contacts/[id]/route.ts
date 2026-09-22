import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/supabase';
import { isUuid, validateContactInput } from '@/lib/contacts';

const CONTACT_COLUMNS =
  'id, user_id, name, email, company, title, phone, source, raw_capture, tags, created_at, updated_at';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });

  const { data, error } = await auth.supabase
    .from('contacts')
    .select(CONTACT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('contact fetch failed:', error);
    return NextResponse.json({ error: 'Failed to load contact' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  return NextResponse.json(data);
}

// PATCH sets exactly the fields given, so it is the only way to clear one -
// POST merges and deliberately never blanks an existing value.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
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

  const parsed = validateContactInput(body, false);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (Object.keys(parsed.value).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('contacts')
    .update(parsed.value)
    .eq('id', id)
    .select(CONTACT_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Another contact already uses that email address' },
        { status: 409 }
      );
    }
    console.error('contact update failed:', error);
    return NextResponse.json({ error: 'Failed to update contact' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid contact id' }, { status: 400 });

  const { data, error } = await auth.supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('contact delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete contact' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
