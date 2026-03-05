import { readFileSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { marked } from 'marked'

const svg = readFileSync('ananlogo.svg', 'utf8')
const md = readFileSync('proposal-asan-city.md', 'utf8')
const body = marked(md)

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif;
    font-size: 10.5pt;
    line-height: 1.75;
    color: #1a1a2e;
    background: #fff;
    padding: 0;
  }

  /* ── 커버 헤더 ── */
  .cover-header {
    background: linear-gradient(135deg, #0A1F12 0%, #122A1C 100%);
    color: white;
    padding: 36px 48px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0;
  }

  .cover-header .logo-wrap {
    width: 180px;
    flex-shrink: 0;
  }

  .cover-header .logo-wrap svg {
    width: 100%;
    height: auto;
  }

  .cover-header .title-block {
    flex: 1;
    padding-left: 36px;
  }

  .cover-header .title-block .label {
    font-size: 8pt;
    font-weight: 500;
    color: #C8E63A;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .cover-header .title-block h1 {
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.4;
    color: white;
    margin: 0 0 12px;
    border: none;
    padding: 0;
  }

  .cover-header .meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 12px;
    font-size: 9pt;
    color: rgba(255,255,255,0.65);
  }

  .cover-header .meta-grid .key {
    color: rgba(255,255,255,0.4);
    white-space: nowrap;
  }

  /* ── 본문 ── */
  .content {
    padding: 40px 56px 60px;
    max-width: 900px;
    margin: 0 auto;
  }

  h1 { display: none; } /* 커버에서 이미 표시 */

  h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #0A1F12;
    margin: 36px 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid #C8E63A;
  }

  h3 {
    font-size: 11pt;
    font-weight: 700;
    color: #1a3a25;
    margin: 24px 0 8px;
  }

  h4 {
    font-size: 10.5pt;
    font-weight: 700;
    color: #2d5a3d;
    margin: 16px 0 6px;
  }

  p {
    margin: 8px 0;
    color: #333;
  }

  blockquote {
    margin: 16px 0;
    padding: 12px 20px;
    background: #f0f7f3;
    border-left: 4px solid #C8E63A;
    border-radius: 0 8px 8px 0;
    color: #2d5a3d;
    font-weight: 500;
  }

  blockquote p { margin: 0; color: #2d5a3d; }

  ul, ol {
    margin: 8px 0 8px 20px;
    color: #333;
  }

  li { margin: 4px 0; }

  strong { color: #0A1F12; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0;
    font-size: 9.5pt;
  }

  th {
    background: #0A1F12;
    color: #C8E63A;
    padding: 8px 12px;
    text-align: left;
    font-weight: 600;
  }

  td {
    padding: 7px 12px;
    border-bottom: 1px solid #e8e3d8;
    vertical-align: top;
  }

  tr:nth-child(even) td { background: #f8f6f1; }

  code {
    font-family: monospace;
    font-size: 9pt;
    background: #f0f0f0;
    padding: 1px 5px;
    border-radius: 3px;
    color: #0A1F12;
  }

  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 28px 0;
  }

  /* ── 푸터 ── */
  .doc-footer {
    background: #0A1F12;
    color: rgba(255,255,255,0.5);
    font-size: 8.5pt;
    padding: 14px 56px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .doc-footer span { color: #C8E63A; font-weight: 600; }

  @page {
    size: A4;
    margin: 0;
  }

  @media print {
    body { background: white; }
    .cover-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-footer { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    blockquote { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<div class="cover-header">
  <div class="logo-wrap">
    ${svg}
  </div>
  <div class="title-block">
    <div class="label">아산시 협력 제안서 · 2026년 3월</div>
    <h1>아산시 자전거 관광 활성화를 위한<br>디지털 코스 허브 플랫폼 구축 협력 제안</h1>
    <div class="meta-grid">
      <span class="key">수신</span><span>아산시 문화관광체육과 담당 공무원</span>
      <span class="key">제안자</span><span>아산시민 박근윤</span>
      <span class="key">웹사이트</span><span>https://asan-bicycle.vercel.app/</span>
    </div>
  </div>
</div>

<div class="content">
${body}
</div>

<div class="doc-footer">
  <span>ASAN.BICYCLE</span>
  <span>아산시 자전거 코스 허브 · https://asan-bicycle.vercel.app/</span>
  <span>2026.03</span>
</div>

</body>
</html>`

writeFileSync('proposal-asan-city.html', html)
console.log('HTML 생성 완료')

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
execSync(`"${chrome}" --headless=new --print-to-pdf=proposal-asan-city.pdf --no-pdf-header-footer --print-to-pdf-no-header --run-all-compositor-stages-before-draw "file://$(pwd)/proposal-asan-city.html" 2>/dev/null`, { stdio: 'inherit' })
console.log('PDF 생성 완료')
