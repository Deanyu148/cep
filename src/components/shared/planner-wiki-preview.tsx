'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { getCharacterAvatarPath, getCharacterId } from '@/lib/character-images'
import { useWikiTranslations } from '@/hooks/use-wiki-translations'
import { CharacterAvatar } from '@/components/shared/character-avatar'
import { RarityFrame } from '@/components/shared/rarity-frame'
import { RarityStars } from '@/components/shared/rarity-stars'
import { NavLink } from '@/components/shared/nav-link'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface PlannerWikiPreviewRow {
  label: string
  levelOne: string
  maxLevel: string
  truncate?: boolean
}

export interface PlannerWikiPreviewProps {
  title: string
  imageSrc?: string
  rarity: number
  rows: PlannerWikiPreviewRow[]
  levelOneLabel?: string
  maxLevelLabel?: string
  compact?: boolean
  /**
   * Operator names associated with the entity (weapons: `weapon.chars`).
   * Rendered as small round avatars right of the title, so the association is
   * readable inside the preview instead of only on the trigger card.
   */
  characters?: readonly string[]
  wikiHref?: string
  footer?: ReactNode
}

export interface PlannerWikiPreviewCharacterAvatar {
  name: string
  /** Game i18n id for the localized label; null when the name has no entry. */
  id: string | null
}

/** Character names that have an avatar, plus their i18n ids for labels. */
export function resolveCharacterAvatars(
  characters: readonly string[] | undefined,
): PlannerWikiPreviewCharacterAvatar[] {
  return (characters ?? []).flatMap((character) => (
    getCharacterAvatarPath(character) ? [{ name: character, id: getCharacterId(character) }] : []
  ))
}

/**
 * Operator avatars + their localized names, rendered right of the entity title.
 *
 * Mounted only when the entity has characters, so tooltips without them (every
 * equipment preview) never pull the game-i18n catalog chunk into the route.
 */
function PreviewCharacterAvatars({ avatars }: { avatars: readonly PlannerWikiPreviewCharacterAvatar[] }) {
  const { entityName } = useWikiTranslations()
  // Administrator variants share one i18n entry, so identical labels collapse
  // into a single name behind the two portraits.
  const labels = [...new Set(avatars.map((avatar) =>
    avatar.id ? entityName({ id: avatar.id, category: 'characters' }) : avatar.name,
  ))]

  return (
    // size-8 (2rem) portrait with its name; -mt-1.5 optically centers the circle
    // on the text-sm line box of the title's first line.
    <div className="-mt-1.5 flex min-w-0 items-center gap-1.5">
      <div className="flex shrink-0 items-center gap-1">
        {avatars.map((avatar) => (
          // Same face-framed portrait as the card; only the rendered size differs.
          <CharacterAvatar
            key={avatar.name}
            name={avatar.name}
            alt=""
            className="size-8 shadow-[var(--shadow-border)]"
          />
        ))}
      </div>
      <span className="max-w-28 min-w-0 truncate text-xs text-muted-foreground">{labels.join('、')}</span>
    </div>
  )
}

export function plainWikiPreviewText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

export function plainWikiPreviewValue(value: string): string {
  const text = plainWikiPreviewText(value)
  return text.match(/[+-]?\d+(?:\.\d+)?%?/)?.[0] ?? text
}

export function PlannerWikiPreview({
  title,
  imageSrc,
  rarity,
  rows,
  levelOneLabel = 'Lv.1',
  maxLevelLabel = 'Lv.9',
  compact = false,
  characters,
  wikiHref,
  footer,
}: PlannerWikiPreviewProps) {
  const t = useTranslations()
  const avatars = resolveCharacterAvatars(characters)

  return (
    <div className={compact ? 'w-64 max-w-[calc(100vw-4.5rem)] min-w-0 space-y-3 text-foreground' : 'w-80 min-w-0 space-y-3 text-foreground'}>
      <div className={compact ? 'flex min-w-0 items-start justify-between gap-3 bg-popover pb-2' : 'sticky top-0 z-10 flex min-w-0 items-start justify-between gap-3 bg-popover pb-2'}>
        <div className="flex min-w-0 flex-1 items-start gap-1.5">
          <h3 className={compact ? 'min-w-0 line-clamp-2 text-sm font-semibold text-popover-foreground' : 'min-w-0 truncate text-sm font-semibold text-popover-foreground'} title={title}>{title}</h3>
          {avatars.length > 0 && <PreviewCharacterAvatars avatars={avatars} />}
        </div>
        <div className="shrink-0 pt-0.5"><RarityStars rarity={rarity} size="sm" /></div>
      </div>
      {imageSrc ? (
        <RarityFrame
          imageSrc={imageSrc}
          title={title}
          rarity={rarity}
          imageClassName="object-contain p-3"
          className="mx-auto w-full max-w-40"
        />
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-md shadow-[var(--shadow-border)]">
          <Table className="table-fixed [&_th+th]:shadow-[var(--shadow-border-l)] [&_td+td]:shadow-[var(--shadow-border-l)]">
            <TableHeader>
              <TableRow className="bg-muted/45 hover:bg-muted/45">
                <TableHead className="w-[38%] text-xs">{t('wiki.attributes')}</TableHead>
                <TableHead className="w-[31%] text-right font-geist-mono text-xs">{levelOneLabel}</TableHead>
                <TableHead className="w-[31%] text-right font-geist-mono text-xs">{maxLevelLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row.label}-${index}`}>
                  <TableCell className="truncate text-xs text-muted-foreground" title={row.label}>{row.label}</TableCell>
                  <TableCell className="min-w-0 text-right font-geist-mono text-xs">
                    <span className={row.truncate ? 'block truncate' : 'block'} title={row.levelOne}>{row.levelOne}</span>
                  </TableCell>
                  <TableCell className="min-w-0 text-right font-geist-mono text-xs">
                    <span className={row.truncate ? 'block truncate' : 'block'} title={row.maxLevel}>{row.maxLevel}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {footer}
      {wikiHref && (
        <NavLink
          href={wikiHref}
          loadingLabel={title}
          className="block rounded-md bg-primary px-3 py-2 text-center text-xs font-medium text-primary-foreground hover:bg-primary/80"
        >
          {t('wiki.viewWiki')}
        </NavLink>
      )}
    </div>
  )
}

export default PlannerWikiPreview
