import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const center = searchParams.get('center')
  const level = searchParams.get('level') ?? '6'
  const size = searchParams.get('size') ?? '640x640'

  if (!center) {
    return NextResponse.json({ error: 'center is required' }, { status: 400 })
  }

  const REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY
  if (!REST_KEY) {
    return NextResponse.json({ error: 'Kakao REST key not configured' }, { status: 500 })
  }

  const url = `https://dapi.kakao.com/v2/maps/staticmap?center=${center}&level=${level}&size=${size}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${REST_KEY}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Kakao map fetch failed' }, { status: res.status })
    }

    const buffer = await res.arrayBuffer()
    return new Response(buffer, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'map fetch error' }, { status: 500 })
  }
}
