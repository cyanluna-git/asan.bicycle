import { describe, expect, it } from 'vitest'
import {
  buildProfileUpdate,
  canChangeProfileEmoji,
  getDefaultProfileEmoji,
  getProfileAvatarEmoji,
  getProfileAvatarUpdatedAt,
  getProfileName,
  isProfileComplete,
  normalizeProfileName,
  resolveProfileEmoji,
} from '@/lib/profile'

describe('profile helpers', () => {
  it('normalizes profile names consistently', () => {
    expect(normalizeProfileName('  아산   라이더  ')).toBe('아산 라이더')
  })

  it('reads profile metadata fields from the auth user', () => {
    const user = {
      id: 'user-1',
      email: 'rider@example.com',
      user_metadata: {
        full_name: '  라이더  ',
        avatar_emoji: '🚵',
        avatar_emoji_updated_at: '2026-03-01T00:00:00.000Z',
      },
    } as never

    expect(getProfileName(user)).toBe('라이더')
    expect(getProfileAvatarEmoji(user)).toBe('🚵')
    expect(getProfileAvatarUpdatedAt(user)?.toISOString()).toBe('2026-03-01T00:00:00.000Z')
    expect(isProfileComplete(user)).toBe(true)
  })

  it('derives a stable default emoji from the user seed', () => {
    const user = {
      id: 'user-1',
      email: 'rider@example.com',
      user_metadata: {},
    } as never

    expect(getDefaultProfileEmoji(user)).toBe(getDefaultProfileEmoji(user))
    expect(resolveProfileEmoji(user)).toBe(getDefaultProfileEmoji(user))
    expect(isProfileComplete(user)).toBe(false)
  })

  it('builds profile updates with a default emoji fallback', () => {
    const user = {
      id: 'user-2',
      email: 'road@example.com',
    } as never

    expect(buildProfileUpdate(user, '  투어 라이더  ', '')).toEqual({
      full_name: '투어 라이더',
      avatar_emoji: getDefaultProfileEmoji(user),
      avatar_emoji_updated_at: expect.any(String),
    })
  })

  it('blocks avatar changes inside the cooldown window', () => {
    const user = {
      id: 'user-3',
      email: 'gravel@example.com',
      user_metadata: {
        avatar_emoji: '🚴',
        avatar_emoji_updated_at: '2026-03-01T00:00:00.000Z',
      },
    } as never

    const blocked = canChangeProfileEmoji(user, '🐯', new Date('2026-03-10T00:00:00.000Z'))
    const allowed = canChangeProfileEmoji(
      user,
      '🐯',
      new Date('2026-04-02T00:00:00.000Z'),
    )

    expect(blocked.allowed).toBe(false)
    expect(blocked.nextAllowedAt?.toISOString()).toBe('2026-03-31T00:00:00.000Z')
    expect(allowed.allowed).toBe(true)
  })

  it('preserves the existing avatar timestamp when the emoji does not change', () => {
    const user = {
      id: 'user-4',
      email: 'fixed@example.com',
      user_metadata: {
        avatar_emoji: '🚵',
        avatar_emoji_updated_at: '2026-03-01T00:00:00.000Z',
      },
    } as never

    expect(buildProfileUpdate(user, '고정 라이더', '🚵', new Date('2026-03-05T00:00:00.000Z'))).toEqual({
      full_name: '고정 라이더',
      avatar_emoji: '🚵',
      avatar_emoji_updated_at: '2026-03-01T00:00:00.000Z',
    })
  })
})
