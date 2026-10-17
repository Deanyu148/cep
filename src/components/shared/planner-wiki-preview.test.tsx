// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PlannerWikiPreview, plainWikiPreviewValue, resolveCharacterAvatars } from './planner-wiki-preview'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key === 'wiki.viewWiki' ? 'View Wiki' : key,
}))

vi.mock('next/image', () => ({
  default: ({ src, alt = '' }: { src: string; alt?: string }) => <span role="img" aria-label={alt} data-src={src} />,
}))

vi.mock('@/lib/character-images', () => ({
  getCharacterAvatarPath: (name: string) =>
    name === '佩丽卡' ? '/images/characters/chr_0004_pelica.avif'
      : name === '管理员(女)' ? '/images/characters/chr_9000_endmin-female.avif'
        : name === '管理员(男)' ? '/images/characters/chr_9000_endmin-male.avif'
          : null,
  getCharacterId: (name: string) =>
    name === '佩丽卡' ? 'chr_0004_pelica'
      : name.startsWith('管理员') ? 'chr_9000_endmin'
        : null,
}))

// Labels must come from the game i18n id, not the raw zh-CN name.
vi.mock('@/hooks/use-wiki-translations', () => ({
  useWikiTranslations: () => ({
    entityName: (entity: { id: string; category?: string }) => entity.category === 'characters' ? `L:${entity.id}` : entity.id,
  }),
}))

vi.mock('@/components/shared/nav-link', () => ({
  NavLink: ({ children, href, className }: React.ComponentProps<'a'> & { loadingLabel?: string }) => <a href={href} className={className}>{children}</a>,
}))

afterEach(cleanup)

it('extracts the first numeric value from a localized stat description', () => {
  expect(plainWikiPreviewValue('最大生命值<@ba.vup>+62.4%</>')).toBe('+62.4%')
})

it('renders preview rows and a Wiki link for a synced entity', () => {
  render(
    <PlannerWikiPreview
      title="Test weapon"
      imageSrc="/images/weapon/test.avif"
      rarity={6}
      rows={[{ label: 'Strength', levelOne: '16', maxLevel: '124' }]}
      wikiHref="/en/wiki/weapons/test"
      maxLevelLabel="Lv.9"
    />
  )

  expect(screen.getByText('Strength')).toBeTruthy()
  expect(screen.getByText('16')).toBeTruthy()
  expect(screen.getByText('124')).toBeTruthy()
  expect(screen.getByText('Lv.9')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'View Wiki' }).getAttribute('href')).toBe('/en/wiki/weapons/test')
})

it('omits the Wiki link when no generated entry exists', () => {
  render(<PlannerWikiPreview title="Custom" rarity={6} rows={[]} />)
  expect(screen.queryByRole('link')).toBeNull()
})

it('drops character names that have no avatar mapping', () => {
  expect(resolveCharacterAvatars(['佩丽卡', '未收录'])).toEqual([
    { name: '佩丽卡', id: 'chr_0004_pelica' },
  ])
  expect(resolveCharacterAvatars(undefined)).toEqual([])
})

it('renders character avatars and their localized names next to the title', () => {
  const { container } = render(
    <PlannerWikiPreview
      title="热熔切割器"
      rarity={6}
      rows={[]}
      characters={['佩丽卡', '未收录']}
    />
  )

  const avatar = container.querySelector('[data-character-avatar="佩丽卡"]') as HTMLElement
  // size-8 (2rem) portrait right after the name.
  expect(avatar.className).toContain('size-8')
  expect(container.querySelector('[data-character-avatar="未收录"]')).toBeNull()
  // Localized label resolved from the i18n id instead of the raw zh-CN name.
  expect(screen.getByText('L:chr_0004_pelica')).toBeTruthy()

  // Placement: immediately after the name, before the stars.
  const titleGroup = screen.getByRole('heading').parentElement as HTMLElement
  const header = titleGroup.parentElement as HTMLElement
  expect(titleGroup.firstElementChild?.tagName).toBe('H3')
  expect(titleGroup.lastElementChild?.querySelector('[data-character-avatar="佩丽卡"]')).toBe(avatar)
  expect(header.lastElementChild?.textContent).toContain('\u2605')
  expect(header.lastElementChild).not.toBe(titleGroup)
})

it('collapses administrator variants behind one localized name', () => {
  const { container } = render(
    <PlannerWikiPreview title="宏愿" rarity={6} rows={[]} characters={['管理员(女)', '管理员(男)']} />
  )

  expect(container.querySelectorAll('[data-character-avatar]')).toHaveLength(2)
  expect(screen.getAllByText('L:chr_9000_endmin')).toHaveLength(1)
})

it('keeps the header unchanged when no characters are associated', () => {
  render(<PlannerWikiPreview title="Custom" rarity={6} rows={[]} />)

  // Only the rarity stars remain as role=img.
  expect(screen.getAllByRole('img')).toHaveLength(1)
})
