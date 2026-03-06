'use client'

import { useEffect, useState } from 'react'
import { Loader2, LogOut, UserRound, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import {
  buildProfileUpdate,
  canChangeProfileEmoji,
  getDefaultProfileEmoji,
  getProfileAvatarUpdatedAt,
  getProfileName,
  getProfileAvatarEmoji,
  pickRandomProfileEmoji,
  PROFILE_EMOJI_CHANGE_INTERVAL_DAYS,
  PROFILE_EMOJI_OPTIONS,
} from '@/lib/profile'
import { supabase } from '@/lib/supabase'

type ProfileEditorMode = 'modal' | 'onboarding'

interface ProfileEditorProps {
  user: User
  mode: ProfileEditorMode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

function ProfileEditorForm({
  user,
  mode,
  onClose,
}: {
  user: User
  mode: ProfileEditorMode
  onClose?: () => void
}) {
  const buildInitialEmoji = () => getProfileAvatarEmoji(user) ?? pickRandomProfileEmoji()
  const [profileName, setProfileName] = useState(getProfileName(user))
  const [selectedEmoji, setSelectedEmoji] = useState(buildInitialEmoji)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentEmoji = getProfileAvatarEmoji(user)
  const avatarUpdatedAt = getProfileAvatarUpdatedAt(user)
  const emojiChangeState = canChangeProfileEmoji(user, selectedEmoji)
  const emojiLocked = Boolean(currentEmoji && currentEmoji !== selectedEmoji && !emojiChangeState.allowed)

  useEffect(() => {
    setProfileName(getProfileName(user))
    setSelectedEmoji(getProfileAvatarEmoji(user) ?? pickRandomProfileEmoji())
    setError(null)
  }, [user])

  const submitLabel = mode === 'onboarding' ? '프로필 시작하기' : '프로필 저장'

  const handleSave = async () => {
    const nextName = profileName.trim()

    if (!nextName) {
      setError('프로필명을 입력해주세요.')
      return
    }

    if (!emojiChangeState.allowed) {
      setError(`이모지 아바타는 ${PROFILE_EMOJI_CHANGE_INTERVAL_DAYS}일에 한 번만 변경할 수 있습니다.`)
      return
    }

    setIsSaving(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({
      data: buildProfileUpdate(user, nextName, selectedEmoji),
    })

    if (updateError) {
      setError(updateError.message)
      setIsSaving(false)
      return
    }

    const { error: courseUpdateError } = await supabase
      .from('courses')
      .update({
        uploader_name: nextName.trim(),
        uploader_emoji: selectedEmoji,
      })
      .eq('created_by', user.id)

    if (
      courseUpdateError
      && !/(uploader_name|uploader_emoji)/i.test(courseUpdateError.message)
    ) {
      setError(courseUpdateError.message)
      setIsSaving(false)
      return
    }

    setIsSaving(false)
    onClose?.()
  }

  return (
    <div className="w-full max-w-xl rounded-3xl border bg-background p-6 shadow-2xl sm:p-8">
      <div className="mb-6 space-y-2">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-2xl">
          {selectedEmoji || getDefaultProfileEmoji(user)}
        </div>
        <h2 className="text-2xl font-semibold">
          {mode === 'onboarding' ? '프로필을 먼저 완성해주세요' : '프로필 설정'}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {mode === 'onboarding'
            ? '후기 작성과 사용자 표시 이름에 사용할 프로필명을 먼저 저장해야 합니다.'
            : '프로필명과 이모지 아바타를 수정하면 앱 전반의 사용자 표시 정보에 반영됩니다.'}
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={`profile-name-${mode}`}>
            프로필명
          </label>
          <input
            id={`profile-name-${mode}`}
            value={profileName}
            onChange={(event) => {
              setProfileName(event.target.value)
              setError(null)
            }}
            placeholder="예: 아산 라이더"
            maxLength={24}
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium">이모지 아바타</label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              disabled={emojiLocked}
              onClick={() => setSelectedEmoji(pickRandomProfileEmoji())}
            >
              랜덤 다시 뽑기
            </Button>
          </div>

          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {PROFILE_EMOJI_OPTIONS.map((emoji) => {
              const isActive = selectedEmoji === emoji

              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={emojiLocked}
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`flex h-12 items-center justify-center rounded-2xl border text-2xl transition ${
                    isActive
                      ? 'border-orange-500 bg-orange-50 shadow-sm'
                      : 'border-border bg-background hover:border-orange-300 hover:bg-orange-50/60'
                  } ${emojiLocked ? 'cursor-not-allowed opacity-55' : ''}`}
                  aria-pressed={isActive}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              )
            })}
          </div>

          {avatarUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              이모지 변경은 {PROFILE_EMOJI_CHANGE_INTERVAL_DAYS}일에 1번 가능합니다.
              {emojiChangeState.nextAllowedAt && currentEmoji !== selectedEmoji
                ? ` 다음 변경 가능일: ${emojiChangeState.nextAllowedAt.toLocaleDateString('ko-KR')}`
                : ''}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {mode === 'onboarding' ? (
            <Button
              type="button"
              variant="ghost"
              className="gap-2"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </Button>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound className="h-4 w-4" />
              표시 이름과 아바타는 즉시 반영됩니다.
            </div>
          )}

          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ProfileEditor({ user, mode, open = true, onOpenChange }: ProfileEditorProps) {
  if (mode === 'modal' && !open) {
    return null
  }

  const handleClose = () => {
    onOpenChange?.(false)
  }

  return (
    <div
      className={`fixed inset-0 z-[80] ${
        mode === 'onboarding'
          ? 'bg-background/95 backdrop-blur-md'
          : 'bg-black/45'
      }`}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-xl">
          {mode === 'modal' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 z-10 h-9 w-9"
              onClick={handleClose}
              aria-label="프로필 설정 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
          <ProfileEditorForm
            user={user}
            mode={mode}
            onClose={mode === 'modal' ? handleClose : undefined}
          />
        </div>
      </div>
    </div>
  )
}
