import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function windowStart(from?: string | null) {
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) return from;
  const now = new Date();
  now.setDate(now.getDate() - 6);
  return now.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const from = windowStart(new URL(request.url).searchParams.get('from'));
    const supabase = createAdminClient();

    const { data: institutions, error: instError } = await supabase
      .from('institutions')
      .select('id, name, code, is_active')
      .order('code');

    if (instError) {
      return NextResponse.json({ error: instError.message }, { status: 500 });
    }

    let submissionsQuery = await supabase
      .from('assembly_submissions')
      .select('*')
      .gte('submission_date', from)
      .order('created_at', { ascending: false });

    if (submissionsQuery.error) {
      submissionsQuery = await supabase
        .from('assembly_submissions')
        .select('*')
        .order('created_at', { ascending: false });
    }

    if (submissionsQuery.error) {
      return NextResponse.json({ error: submissionsQuery.error.message }, { status: 500 });
    }

    return NextResponse.json({
      institutions: institutions ?? [],
      submissions: submissionsQuery.data ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load monitoring data.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: number | string; status?: string };
    if (!body.id || (body.status !== 'verified' && body.status !== 'flagged')) {
      return NextResponse.json({ error: 'Invalid verification payload.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('assembly_submissions')
      .update({ status: body.status })
      .eq('id', body.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update submission.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
