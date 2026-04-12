/**
 * Backfill preview images for existing courses.
 *
 * Usage:
 *   npx tsx scripts/backfill-preview-images.ts
 *
 * Requires environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import {
  generatePreviewImageResponse,
  PREVIEW_BUCKET,
  previewStoragePath,
} from '../lib/course-preview-image'
import type { RoutePreviewPoint } from '../types/course'

const BATCH_SIZE = 20

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey)

  const force = process.argv.includes('--force')

  let query = supabase
    .from('courses')
    .select('id, route_preview_points')
    .not('route_preview_points', 'is', null)
    .order('created_at', { ascending: false })

  if (!force) {
    query = query.is('preview_image_url', null)
  }

  const { data: courses, error } = await query

  if (error) {
    console.error('Failed to fetch courses:', error.message)
    process.exit(1)
  }

  console.log(`Found ${courses.length} courses ${force ? '(force regenerate)' : 'without preview images'}`)

  let success = 0
  let failed = 0

  for (let i = 0; i < courses.length; i += BATCH_SIZE) {
    const batch = courses.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (course) => {
        const points = (course.route_preview_points ?? []) as RoutePreviewPoint[]
        if (points.length < 2) {
          console.log(`  Skip ${course.id}: insufficient points (${points.length})`)
          return
        }

        try {
          const imageResponse = generatePreviewImageResponse(points)
          const imageBuffer = await imageResponse.arrayBuffer()
          const storagePath = previewStoragePath(course.id)

          const { error: uploadError } = await supabase.storage
            .from(PREVIEW_BUCKET)
            .upload(storagePath, imageBuffer, {
              contentType: 'image/png',
              upsert: true,
            })

          if (uploadError) {
            console.error(`  Fail ${course.id}: upload — ${uploadError.message}`)
            failed++
            return
          }

          const { data: publicUrlData } = supabase.storage
            .from(PREVIEW_BUCKET)
            .getPublicUrl(storagePath)

          const { error: updateError } = await supabase
            .from('courses')
            .update({ preview_image_url: publicUrlData.publicUrl })
            .eq('id', course.id)

          if (updateError) {
            console.error(`  Fail ${course.id}: DB update — ${updateError.message}`)
            failed++
            return
          }

          success++
          console.log(`  OK ${course.id}`)
        } catch (err) {
          console.error(`  Fail ${course.id}:`, err)
          failed++
        }
      }),
    )

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, courses.length)}/${courses.length}`)
  }

  console.log(`\nDone: ${success} success, ${failed} failed`)
}

main()
