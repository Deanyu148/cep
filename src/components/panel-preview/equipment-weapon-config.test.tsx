// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { plannerGameData } from '@/generated/data/planner'
import { weapons } from '@/data/weapons'
import { loadPlannerData } from '@/lib/planner/planner-data-loader'
import { createDefaultPanelPreviewConfig, createPanelEquipmentSelection, usePanelPreviewStore } from '@/stores/usePanelPreviewStore'
import { EquipmentWeaponConfig } from './equipment-weapon-config'

// The component reads planner data synchronously from the loader cache; prime
// it up front the same way the gated pages do.
await loadPlannerData()

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => ({
    armor: 'Armor',
    gloves: 'Gloves',
    accessoryOne: 'Accessory one',
    accessoryTwo: 'Accessory two',
    chooseWeapon: 'Choose weapon',
    chooseEquipment: 'Choose equipment',
    statLevel: 'Stat level',
  })[key] ?? key,
}))

vi.mock('@/hooks/use-wiki-translations', () => ({
  useWikiTranslations: () => ({
    entityName: (entity: { id: string }) => entity.id,
    enumLabel: (_group: string, id: string) => id === '3' ? 'Defense' : `Attribute ${id}`,
    equipmentStatLabel: (id: string) => id === '3' ? 'Defense' : `Attribute ${id}`,
    text: (...segments: Array<string | number>) => String(segments.at(-1)),
  }),
}))

vi.mock('@/components/shared/rarity-frame', () => ({
  RarityFrame: ({ title }: { title: string }) => <span>{title}</span>,
}))

// The picker owns the tooltip surface; capture the renderer it receives so the
// weapon preview payload can be asserted without opening a popup.
const pickerSpy = vi.hoisted(() => ({
  renderTooltip: undefined as ((entity: { id: string; category?: string; rarity?: number }) => unknown) | undefined,
}))

vi.mock('@/components/shared/wiki-entity-picker', () => ({
  WikiEntityPicker: ({ renderTooltip }: { renderTooltip?: (entity: { id: string; category?: string; rarity?: number }) => unknown }) => {
    pickerSpy.renderTooltip = renderTooltip
    return null
  },
}))

// Only the surface is stubbed: `weapon-wiki-preview` imports the pure text
// helpers from this module, so they must stay real.
vi.mock('@/components/shared/planner-wiki-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/shared/planner-wiki-preview')>()
  return { ...actual, PlannerWikiPreview: () => null }
})

vi.mock('@/components/wiki/wiki-rich-text', () => ({
  WikiRichText: () => null,
}))

vi.mock('@/components/panel-preview/equipment-suit-picker', () => ({
  EquipmentSuitPicker: () => null,
}))

const EQUIPMENT_ID = 'item_equip_t0_parts_tundra01_body_01'

beforeEach(() => {
  const characterId = Object.keys(plannerGameData.characters)[0]
  usePanelPreviewStore.setState({
    config: {
      ...createDefaultPanelPreviewConfig(characterId),
      armor: createPanelEquipmentSelection(EQUIPMENT_ID),
    },
  })
})

afterEach(() => {
  cleanup()
  usePanelPreviewStore.setState({ config: null })
})

it('renders fixed equipment defense as a read-only value', () => {
  render(<EquipmentWeaponConfig />)

  const defenseRow = screen.getByText('Defense').parentElement
  expect(defenseRow).not.toBeNull()
  expect(within(defenseRow as HTMLElement).getByText('+8')).toBeTruthy()
  expect(within(defenseRow as HTMLElement).queryByRole('spinbutton')).toBeNull()
  expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0)
})

it('passes the weapon operators through to the weapon tooltip preview', () => {
  render(<EquipmentWeaponConfig />)

  // The picker (which owns the tooltip renderer prop) only mounts while open.
  fireEvent.click(screen.getByRole('button', { name: /Choose weapon/ }))

  const source = weapons.find((entry) => entry.chars.length > 0)
  expect(source).toBeDefined()
  const element = pickerSpy.renderTooltip?.({ id: source!.id, category: 'weapons', rarity: source!.rarity }) as ReactElement<{ characters?: string[] }> | undefined

  expect(element?.props.characters).toEqual(source!.chars)
})
