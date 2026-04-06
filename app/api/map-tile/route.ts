import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const zStr = searchParams.get('z')
  const xStr = searchParams.get('x')
  const yStr = searchParams.get('y')

  if (!zStr || !xStr || !yStr) {
    return NextResponse.json({ error: 'z, x, y are required' }, { status: 400 })
  }

  const z = parseInt(zStr, 10)
  const x = parseInt(xStr, 10)
  const y = parseInt(yStr, 10)

  if (
    isNaN(z) || isNaN(x) || isNaN(y) ||
    z < 0 || z > 19 ||
    x < 0 || x > Math.pow(2, z) - 1 ||
    y < 0 || y > Math.pow(2, z) - 1
  ) {
    return NextResponse.json({ error: 'invalid tile coordinates' }, { status: 400 })
  }

  const tileUrl = `https://a.tile-cyclosm.openstreetmap.fr/cyclosm/${z}/${x}/${y}.png`

  try {
    const res = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'asan.bicycle/1.0 (+https://asan.bicycle)',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'tile fetch failed' }, { status: 502 })
    }

    const buffer = await res.arrayBuffer()
    return new Response(buffer, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'tile fetch error' }, { status: 502 })
  }
}
