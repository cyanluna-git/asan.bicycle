import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const options = {
    email: '',
    apply: false,
    titles: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]

    if (value === '--apply') {
      options.apply = true
      continue
    }

    if (value === '--email') {
      options.email = argv[index + 1] ?? ''
      index += 1
      continue
    }

    if (value === '--title') {
      options.titles.push(argv[index + 1] ?? '')
      index += 1
    }
  }

  return options
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function main() {
  const { email, apply, titles } = parseArgs(process.argv.slice(2))

  if (!email || titles.length === 0) {
    throw new Error('Usage: node scripts/reassign-legacy-course-ownership.mjs --email <email> --title <title> [--title <title> ...] [--apply]')
  }

  const supabase = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  )

  const {
    data: userPage,
    error: userError,
  } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })

  if (userError) {
    throw userError
  }

  const targetUser = userPage.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (!targetUser) {
    throw new Error(`Target user not found for email: ${email}`)
  }

  const {
    data: courseRows,
    error: courseError,
  } = await supabase
    .from('courses')
    .select('id, title, created_by, uploader_name, uploader_emoji')
    .in('title', titles)
    .order('created_at', { ascending: true })

  if (courseError) {
    throw courseError
  }

  const missingTitles = titles.filter((title) => !(courseRows ?? []).some((course) => course.title === title))
  if (missingTitles.length > 0) {
    throw new Error(`Missing courses for titles: ${missingTitles.join(', ')}`)
  }

  const payload = {
    targetUser: {
      id: targetUser.id,
      email: targetUser.email,
      full_name: targetUser.user_metadata?.full_name ?? null,
      avatar_emoji: targetUser.user_metadata?.avatar_emoji ?? null,
    },
    apply,
    courses: courseRows,
  }

  if (!apply) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  const updates = (courseRows ?? []).map((course) =>
    supabase
      .from('courses')
      .update({
        created_by: targetUser.id,
        uploader_name: targetUser.user_metadata?.full_name ?? null,
        uploader_emoji: targetUser.user_metadata?.avatar_emoji ?? null,
      })
      .eq('id', course.id),
  )

  const results = await Promise.all(updates)
  const failed = results.find((result) => result.error)

  if (failed?.error) {
    throw failed.error
  }

  const {
    data: verifiedRows,
    error: verifyError,
  } = await supabase
    .from('courses')
    .select('id, title, created_by, uploader_name, uploader_emoji')
    .in('title', titles)
    .order('created_at', { ascending: true })

  if (verifyError) {
    throw verifyError
  }

  console.log(JSON.stringify({
    ...payload,
    verifiedCourses: verifiedRows,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
