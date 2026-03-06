import { describe, expect, it } from 'vitest'
import {
  buildProfileUpdate,
  getDefaultProfileEmoji,
  getProfileAvatarEmoji,
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
      },
    } as never

    expect(getProfileName(user)).toBe('라이더')
    expect(getProfileAvatarEmoji(user)).toBe('🚵')
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
    })
  })
})
