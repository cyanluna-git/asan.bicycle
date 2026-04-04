import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '코스 업로드 | Wheeling',
  robots: {
    index: false,
    follow: false,
  },
}

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
