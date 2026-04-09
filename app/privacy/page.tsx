import type { Metadata } from 'next'
import { getSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  title: '개인정보처리방침 | 굴림',
  description: '굴림의 개인정보처리방침',
  alternates: { canonical: `${getSiteUrl()}/privacy` },
}

const CONTACT_EMAIL = 'pjy8412@gmail.com'
const EFFECTIVE_DATE = '2026년 4월 9일'

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:px-12">
      <h1 className="font-headline text-2xl font-bold">개인정보처리방침</h1>
      <p className="mt-2 text-sm text-muted-foreground">시행일: {EFFECTIVE_DATE}</p>

      <div className="mt-10 space-y-10 text-sm leading-relaxed text-foreground/90">
        <Section title="1. 개인정보의 수집 항목 및 수집 방법">
          <p>굴림(이하 &quot;서비스&quot;)은 서비스 제공을 위해 아래 항목을 수집합니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>회원가입 시:</strong> 카카오 계정 식별자(ID), 닉네임, 프로필 이미지</li>
            <li><strong>코스 업로드 시:</strong> GPX/TCX 파일에 포함된 GPS 좌표, 고도 데이터</li>
            <li><strong>사진 업로드 시:</strong> 사진 파일, 사진에 포함된 위치 정보(EXIF GPS)</li>
            <li><strong>서비스 이용 중 자동 수집:</strong> 접속 로그, 브라우저 정보, 기기 정보</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 수집 및 이용 목적">
          <ul className="list-disc space-y-1 pl-5">
            <li>회원 식별 및 서비스 이용 관리</li>
            <li>자전거 코스 지도 시각화 및 통계 제공</li>
            <li>코스 리뷰, 사진 앨범 등 커뮤니티 기능 제공</li>
            <li>서비스 개선 및 오류 대응</li>
          </ul>
        </Section>

        <Section title="3. 개인정보의 보유 및 이용 기간">
          <p>
            수집된 개인정보는 회원 탈퇴 시 또는 수집 목적 달성 시 지체 없이 파기합니다.
            다만, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>접속 로그: 3개월 (통신비밀보호법)</li>
          </ul>
        </Section>

        <Section title="4. 개인정보의 제3자 제공">
          <p>
            서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다.
            다만, 이용자의 동의가 있거나 법령에 의한 경우에는 예외로 합니다.
          </p>
        </Section>

        <Section title="5. 개인정보의 처리 위탁">
          <p>서비스는 원활한 운영을 위해 아래와 같이 개인정보 처리를 위탁합니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Supabase (Auth &amp; Database):</strong> 회원 인증 및 데이터 저장</li>
            <li><strong>Vercel:</strong> 웹 애플리케이션 호스팅</li>
            <li><strong>카카오:</strong> 소셜 로그인 (OAuth)</li>
          </ul>
        </Section>

        <Section title="6. 이용자의 권리 및 행사 방법">
          <p>이용자는 언제든지 아래 권리를 행사할 수 있습니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>개인정보 열람, 정정, 삭제 요청</li>
            <li>개인정보 처리 정지 요청</li>
            <li>회원 탈퇴</li>
          </ul>
          <p className="mt-2">
            위 요청은 아래 연락처로 문의해 주시기 바랍니다.
          </p>
        </Section>

        <Section title="7. 개인정보의 파기 절차 및 방법">
          <p>
            보유 기간이 경과하거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.
            전자적 파일은 복구 불가능한 방법으로 삭제하며, 종이 문서는 분쇄 또는 소각합니다.
          </p>
        </Section>

        <Section title="8. 쿠키 및 자동 수집 장치">
          <p>
            서비스는 이용자 인증 및 세션 관리를 위해 쿠키를 사용합니다.
            이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나,
            일부 서비스 이용에 제한이 있을 수 있습니다.
          </p>
        </Section>

        <Section title="9. 개인정보 보호책임자 및 연락처">
          <div className="mt-2 rounded-lg border bg-muted/40 px-4 py-3">
            <p><strong>개인정보 보호책임자</strong></p>
            <p className="mt-1">이메일: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">{CONTACT_EMAIL}</a></p>
          </div>
        </Section>

        <Section title="10. 개인정보처리방침의 변경">
          <p>
            본 방침은 {EFFECTIVE_DATE}부터 시행됩니다.
            방침이 변경될 경우 서비스 내 공지를 통해 안내합니다.
          </p>
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}
