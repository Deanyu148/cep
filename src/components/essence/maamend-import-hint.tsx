'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { ExternalLink, Lightbulb, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUiHintsStore } from '@/stores/useUiHintsStore'

/**
 * One-time hint for the MaaEND 基质库存 import, shown at the top of the essence
 * planner until dismissed.
 *
 * Import itself is drag & drop (anywhere on the page), so this only has to say
 * that the feature exists and where the tutorial is — no persistent button.
 */

export const MAAEND_TUTORIAL_URL = 'https://www.bilibili.com/video/BV1X7pB69Ezh/'

export function MaaendImportHint() {
  const t = useTranslations()
  const dismissed = useUiHintsStore((s) => s.maamendHintDismissed)
  const dismiss = useUiHintsStore((s) => s.dismissMaaendHint)
  // The flag lives in localStorage, so the server render (and the hydration
  // pass) must not show the hint: it would mismatch and flash for users who
  // already dismissed it. Same useSyncExternalStore trick as update/page.tsx.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  if (!mounted || dismissed) return null

  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground shadow-[var(--shadow-raised)]">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-relaxed">{t('essence.maamendHint')}</p>
      <a
        href={MAAEND_TUTORIAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary"
      >
        <ExternalLink className="size-3" aria-hidden="true" />
        {t('essence.maamendTutorial')}
      </a>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0"
        aria-label={t('essence.maamendHintDismiss')}
        title={t('essence.maamendHintDismiss')}
        onClick={dismiss}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
