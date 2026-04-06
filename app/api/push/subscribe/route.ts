import { NextResponse } from 'next/server'
import { createAnonServerClient } from '@/lib/supabase-server'

interface PushSubscriptionBody {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing authorization token' } },
      { status: 401 },
    )
  }

  const supabase = createAnonServerClient(token)

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 },
    )
  }

  const body = (await request.json()) as PushSubscriptionBody

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid subscription data' } },
      { status: 400 },
    )
  }

  const { error } = await (supabase as ReturnType<typeof createAnonServerClient>)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from('push_subscriptions' as any)
    .upsert(
      {
        user_id: user.id,
        endpoint: body.endpoint,
        keys: body.keys,
      },
      { onConflict: 'endpoint' },
    )

  if (error) {
    return NextResponse.json(
      { error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true })
}
