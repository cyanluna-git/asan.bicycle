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

function hashSeed(seed: string) {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function getSeed(user: Pick<User, 'id' | 'email'> | null | undefined) {
  return user?.id || user?.email || 'asan-bicycle'
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

export function buildProfileUpdate(
  user: Pick<User, 'id' | 'email'> | null | undefined,
  profileName: string,
  avatarEmoji?: string | null,
) {
  return {
    full_name: normalizeProfileName(profileName),
    avatar_emoji: avatarEmoji?.trim() || getDefaultProfileEmoji(user),
  }
}
