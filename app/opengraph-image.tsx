import { ImageResponse } from 'next/og'

export const alt = 'Wheeling'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          background:
            'linear-gradient(160deg, rgba(249,246,239,1) 0%, rgba(245,238,224,1) 48%, rgba(236,228,209,1) 100%)',
          color: '#111111',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              borderRadius: 999,
              padding: '10px 18px',
              background: '#111111',
              color: 'white',
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Wheeling
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>
            Discover cycling routes nationwide
          </div>
          <div style={{ fontSize: 30, color: '#4B5563' }}>
            Explore routes, climbs, reviews, and ride albums.
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 24,
            color: '#6B7280',
          }}
        >
          <div style={{ display: 'flex' }}>wheeling</div>
          <div style={{ display: 'flex' }}>courses · reviews · share</div>
        </div>
      </div>
    ),
    size,
  )
}
