import type { User } from '@supabase/supabase-js'

export const PROFILE_EMOJI_OPTIONS = [
  '🚴',
  '🚵',
  '🦊',
  '🐯',
  '🐻',
  '🐱',
  '🐶',
  '🦉',
  '🐼',
  '🐸',
  '🦄',
  '🐙',
  '☕',
  '🍜',
  '🍊',
  '🌿',
  '🌊',
  '⛰️',
  '⭐',
  '🔥',
] as const

export const PROFILE_EMOJI_CHANGE_INTERVAL_DAYS = 30
const PROFILE_EMOJI_CHANGE_INTERVAL_MS =
  PROFILE_EMOJI_CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000

function hashSeed(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function getSeed(user: Pick<User, 'id' | 'email'> | null | undefined) {
  return user?.id || user?.email || 'wheeling'
}

export function normalizeProfileName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export function getProfileName(user: Pick<User, 'user_metadata'> | null | undefined) {
  const fullName = typeof user?.user_metadata?.full_name === 'string'
    ? normalizeProfileName(user.user_metadata.full_name)
    : ''

  return fullName
}

export function getProfileAvatarEmoji(
  user: Pick<User, 'user_metadata'> | null | undefined,
) {
  const avatarEmoji = typeof user?.user_metadata?.avatar_emoji === 'string'
    ? user.user_metadata.avatar_emoji.trim()
    : ''

  return avatarEmoji || null
}

export function getProfileAvatarUpdatedAt(
  user: Pick<User, 'user_metadata'> | null | undefined,
) {
  const rawValue = typeof user?.user_metadata?.avatar_emoji_updated_at === 'string'
    ? user.user_metadata.avatar_emoji_updated_at
    : ''

  if (!rawValue) {
    return null
  }

  const parsedDate = new Date(rawValue)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function getDefaultProfileEmoji(
  user: Pick<User, 'id' | 'email'> | null | undefined,
) {
  return PROFILE_EMOJI_OPTIONS[hashSeed(getSeed(user)) % PROFILE_EMOJI_OPTIONS.length]
}

export function pickRandomProfileEmoji() {
  return PROFILE_EMOJI_OPTIONS[Math.floor(Math.random() * PROFILE_EMOJI_OPTIONS.length)]
}

export function resolveProfileEmoji(
  user: Pick<User, 'id' | 'email' | 'user_metadata'> | null | undefined,
) {
  return getProfileAvatarEmoji(user) ?? getDefaultProfileEmoji(user)
}

export function isProfileComplete(
  user: Pick<User, 'id' | 'email' | 'user_metadata'> | null | undefined,
) {
  return Boolean(getProfileName(user) && getProfileAvatarEmoji(user))
}

export function canChangeProfileEmoji(
  user: Pick<User, 'id' | 'email' | 'user_metadata'> | null | undefined,
  nextEmoji: string | null | undefined,
  now = new Date(),
) {
  const currentEmoji = getProfileAvatarEmoji(user)
  const normalizedNextEmoji = nextEmoji?.trim() || null
  const updatedAt = getProfileAvatarUpdatedAt(user)

  if (!normalizedNextEmoji || !currentEmoji || currentEmoji === normalizedNextEmoji || !updatedAt) {
    return {
      allowed: true,
      nextAllowedAt: null,
    }
  }

  const nextAllowedAt = new Date(updatedAt.getTime() + PROFILE_EMOJI_CHANGE_INTERVAL_MS)

  return {
    allowed: now.getTime() >= nextAllowedAt.getTime(),
    nextAllowedAt,
  }
}

export function buildProfileUpdate(
  user: Pick<User, 'id' | 'email' | 'user_metadata'> | null | undefined,
  profileName: string,
  avatarEmoji?: string | null,
  now = new Date(),
) {
  const nextAvatarEmoji = avatarEmoji?.trim() || getDefaultProfileEmoji(user)
  const currentAvatarEmoji = getProfileAvatarEmoji(user)
  const currentUpdatedAt = typeof user?.user_metadata?.avatar_emoji_updated_at === 'string'
    ? user.user_metadata.avatar_emoji_updated_at
    : null

  return {
    full_name: normalizeProfileName(profileName),
    avatar_emoji: nextAvatarEmoji,
    avatar_emoji_updated_at:
      currentAvatarEmoji === nextAvatarEmoji && currentUpdatedAt
        ? currentUpdatedAt
        : now.toISOString(),
  }
}
