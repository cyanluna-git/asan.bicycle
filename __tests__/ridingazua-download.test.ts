import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  buildDownloadFilename,
  manifestToCsv,
  parseArgs,
  parseCoursePage,
  runDownload,
  sanitizeFilenamePart,
} from '../scripts/ridingazua-download.mjs'

describe('parseCoursePage', () => {
  it('extracts the public course title and encoded payload', () => {
    const result = parseCoursePage(
      `
        <html>
          <head><title>미야코지마 2일차 - Ridingazua! Editor</title></head>
          <body>
            <script>
              ridingazuaApplication.encodedCourse = 'abc123';
              ridingazuaApplication.errorMessage = '';
            </script>
          </body>
        </html>
      `,
      'https://ridingazua.cc/c/200138',
    )

    expect(result).toMatchObject({
      title: '미야코지마 2일차',
      encodedCourse: 'abc123',
      errorMessage: '',
      visibility: 'public',
    })
  })

  it('classifies missing courses from the server-side error message', () => {
    const result = parseCoursePage(
      `
        <script>
          ridingazuaApplication.encodedCourse = '';
          ridingazuaApplication.errorMessage = 'Course is not found.(https://ridingazua.cc/c/1)';
        </script>
      `,
      'https://ridingazua.cc/c/1',
    )

    expect(result.visibility).toBe('missing')
    expect(result.errorMessage).toContain('Course is not found.')
  })

  it('decodes simple html entities in the title', () => {
    const result = parseCoursePage(
      `
        <head><title>Tom &amp; Jerry &#39;Loop&#39; - Ridingazua! Editor</title></head>
        <script>
          ridingazuaApplication.encodedCourse = 'encoded';
          ridingazuaApplication.errorMessage = '';
        </script>
      `,
      'https://ridingazua.cc/c/50',
    )

    expect(result.title).toBe("Tom & Jerry 'Loop'")
  })
})

describe('filename helpers', () => {
  it('sanitizes filename fragments', () => {
    expect(sanitizeFilenamePart(' A/B:C*D?E"F<G>H| ')).toBe('A_B_C_D_E_F_G_H')
  })

  it('builds an id-prefixed file name', () => {
    expect(buildDownloadFilename(200138, '미야코지마 2일차', 'gpx')).toBe('200138_미야코지마_2일차.gpx')
  })
})

describe('manifestToCsv', () => {
  it('serializes manifest rows with csv escaping', () => {
    const csv = manifestToCsv([
      {
        courseId: 200138,
        courseUrl: 'https://ridingazua.cc/c/200138',
        title: 'Loop, "Special"',
        visibility: 'public',
        errorMessage: '',
        downloads: {
          gpx: { status: 'downloaded', path: 'courses/ridingazua/gpx/200138_Loop.gpx' },
          tcx: { status: 'skipped_existing', path: 'courses/ridingazua/tcx/200138_Loop.tcx' },
        },
      },
    ])

    expect(csv).toContain('"Loop, ""Special"""')
    expect(csv).toContain('downloaded')
    expect(csv).toContain('skipped_existing')
  })
})

describe('parseArgs', () => {
  it('parses the numeric scan options', () => {
    const result = parseArgs([
      '--start',
      '200000',
      '--end',
      '200100',
      '--formats',
      'gpx',
      '--force',
      '--output-dir',
      'tmp/ridingazua',
    ])

    expect(result).toMatchObject({
      start: 200000,
      end: 200100,
      formats: ['gpx'],
      force: true,
      outputDir: 'tmp/ridingazua',
    })
  })

  it('requires a stop condition when end is omitted', () => {
    expect(() => parseArgs(['--start', '200000'])).toThrow(
      'When --end is omitted, provide --stop-after-misses with a positive integer',
    )
  })
})

describe('runDownload', () => {
  it('records failures without aborting the whole scan', async () => {
    const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'ridingazua-test-'))
    const publicHtml = `
      <title>테스트 코스 - Ridingazua! Editor</title>
      <script>
        ridingazuaApplication.encodedCourse = 'encoded-course';
        ridingazuaApplication.errorMessage = '';
      </script>
    `

    const responses = new Map([
      ['https://ridingazua.cc/c/10', new Response(publicHtml, { status: 200 })],
      ['https://ridingazua.cc/c/11', new Response('boom', { status: 502, statusText: 'Bad Gateway' })],
      [
        'https://ridingazua.cc/editor/download',
        new Response('<?xml version="1.0"?><gpx />', {
          status: 200,
          headers: { 'content-type': 'application/gpx+xml' },
        }),
      ],
    ])

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input)
      const response = responses.get(url)
      if (!response) {
        throw new Error(`Unexpected URL: ${url}`)
      }
      if (url.endsWith('/editor/download')) {
        expect(init?.method).toBe('POST')
      }
      return response.clone()
    }

    try {
      const manifest = await runDownload(
        {
          start: 10,
          end: 11,
          stopAfterMisses: null,
          formats: ['gpx'],
          outputDir: tempDirectory,
          manifestBaseName: 'manifest',
          baseUrl: 'https://ridingazua.cc',
          delayMs: 0,
          force: false,
          help: false,
        },
        {
          fetchImpl,
          log: { info() {}, warn() {} },
        },
      )

      expect(manifest.entries).toHaveLength(2)
      expect(manifest.entries[0]).toMatchObject({
        courseId: 10,
        visibility: 'public',
      })
      expect(manifest.entries[0].downloads.gpx).toMatchObject({
        status: 'downloaded',
        path: 'gpx/10_테스트_코스.gpx',
      })
      expect(manifest.entries[1]).toMatchObject({
        courseId: 11,
        visibility: 'error',
      })
      expect(manifest.entries[1].downloads.gpx.status).toBe('failed')

      const manifestJson = JSON.parse(await readFile(path.join(tempDirectory, 'manifest.json'), 'utf8'))
      expect(manifestJson.counts['public']).toBe(1)
      expect(manifestJson.counts['error']).toBe(1)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})
