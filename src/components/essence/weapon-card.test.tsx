// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WeaponCard } from './weapon-card'
import type { Weapon } from '@/types/matrix'

vi.mock('next-intl', () => ({
  useLocale: () => 'zh-CN',
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({ alt = '' }: { alt?: string }) => <span role="img" aria-label={alt} />,
}))

vi.mock('@/hooks/use-wiki-translations', () => ({
  useWikiTranslations: () => ({
    text: (...segments: Array<string | number>) => String(segments.at(-1) ?? ''),
    ready: true,
    entityName: (entity: { id: string; category?: string }) => entity.category === 'characters' ? '洛茜' : entity.id,
    enumLabel: (_group: string, id: string) => id,
  }),
}))

// The tooltip only exists while open; pin the shared long-press hook open so the
// preview body renders without simulating hover through Base UI.
vi.mock('@/hooks/use-mobile-long-press-tooltip', () => ({
  useMobileLongPressTooltip: () => ({
    open: true,
    setOpen: vi.fn(),
    triggerRef: { current: null },
    longPressTriggered: { current: false },
    handleOpenChange: vi.fn(),
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerEnd: vi.fn(),
    handleContextMenu: vi.fn(),
    swallowLongPressClick: () => false,
    isMobile: false,
  }),
}))

afterEach(cleanup)

const weapon: Weapon = {
  id: 'wpn_sword_0022',
  name: '狼之绯',
  rarity: 6,
  type: '单手剑',
  primaryStat: 'gat_passive_attr_agi',
  elementalDamage: 'gat_passive_attr_crirate',
  specialAbility: 'gst_passive_crit',
  acquisitionSources: [{ categoryId: 'gacha', sourceId: 'weponbox_1_1_2' }],
  chars: ['洛茜'],
}

it('shows the associated operator name and avatar inside the weapon tooltip', () => {
  render(<WeaponCard weapon={weapon} isSelected={false} />)

  const tooltip = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
  expect(tooltip).not.toBeNull()
  expect(within(tooltip).getByText('洛茜')).toBeTruthy()
  expect(tooltip.querySelector('[data-character-avatar="洛茜"]')).not.toBeNull()
})

it('keeps the card avatar as the only avatar for weapons without operators', () => {
  render(<WeaponCard weapon={{ ...weapon, chars: [] }} isSelected={false} />)

  const tooltip = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
  expect(tooltip).not.toBeNull()
  expect(within(tooltip).queryByText('洛茜')).toBeNull()
  expect(tooltip.querySelector('[data-character-avatar]')).toBeNull()
})

it('sizes the card operator avatar with the card, not a fixed size', () => {
  render(<WeaponCard weapon={weapon} isSelected={false} />)

  // The card portrait keeps the raw name as alt; the tooltip one is decorative.
  const cardPortrait = screen.getByRole('img', { name: '洛茜' })
  expect(cardPortrait.parentElement?.className).toContain('cqw')
  // The card is the container-query container those cqw units resolve against.
  expect(cardPortrait.closest('button')?.className).toContain('@container')
})

it('still localizes the weapon name in the tooltip header', () => {
  render(<WeaponCard weapon={{ ...weapon, id: 'wpn_sword_0022' }} isSelected={false} />)

  // next-intl is mocked to echo keys, so a translated name renders as its key.
  const tooltip = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
  expect(within(tooltip).getByText('weapons.wpn_sword_0022')).toBeTruthy()
  expect(screen.getAllByText('weapons.wpn_sword_0022').length).toBeGreaterThan(0)
})
