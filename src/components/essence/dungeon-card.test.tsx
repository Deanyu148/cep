// @vitest-environment jsdom

import { cleanup, render, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DungeonCard } from './dungeon-card'
import type { DungeonPlan } from '@/lib/planner/essence-solver'
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

// Pin the shared long-press hook open so the thumbnail tooltip body renders.
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

function planFor(entry: Weapon): DungeonPlan {
  return {
    dungeon: { id: 'dungeon_test', name: '测试', s1Pool: [], s2Pool: [], s3Pool: [] },
    lockType: 'none',
    lockValue: '',
    matchedWeapons: [{ weapon: entry, isSelected: true }],
    selectedCount: 1,
    totalCount: 1,
    s1Candidates: [],
    s1CandidateCounts: {},
    needsS1Choice: false,
    selectedS1: [],
  }
}

it('shows the associated operator name and avatar in the plan thumbnail tooltip', () => {
  render(<DungeonCard plan={planFor(weapon)} isExpanded={false} />)

  const tooltip = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
  expect(tooltip).not.toBeNull()
  expect(within(tooltip).getByText('洛茜')).toBeTruthy()
  expect(tooltip.querySelector('[data-character-avatar="洛茜"]')).not.toBeNull()
})

it('omits the operator row in the plan thumbnail tooltip for weapons without operators', () => {
  render(<DungeonCard plan={planFor({ ...weapon, chars: [] })} isExpanded={false} />)

  const tooltip = document.querySelector('[data-slot="tooltip-content"]') as HTMLElement
  expect(tooltip).not.toBeNull()
  expect(tooltip.querySelector('[data-character-avatar]')).toBeNull()
})
