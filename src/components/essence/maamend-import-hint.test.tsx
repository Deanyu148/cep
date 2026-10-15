// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaaendImportHint, MAAEND_TUTORIAL_URL } from './maamend-import-hint'
import { useUiHintsStore } from '@/stores/useUiHintsStore'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

beforeEach(() => {
  useUiHintsStore.setState({ maamendHintDismissed: false })
})

afterEach(() => {
  cleanup()
  useUiHintsStore.setState({ maamendHintDismissed: false })
})

describe('MaaendImportHint', () => {
  it('shows the hint with a link to the tutorial video', () => {
    render(<MaaendImportHint />)
    expect(screen.getByText('essence.maamendHint')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'essence.maamendTutorial' })
    expect(link.getAttribute('href')).toBe(MAAEND_TUTORIAL_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('stays hidden after the user dismisses it', () => {
    render(<MaaendImportHint />)
    fireEvent.click(screen.getByRole('button', { name: 'essence.maamendHintDismiss' }))
    expect(useUiHintsStore.getState().maamendHintDismissed).toBe(true)
    expect(screen.queryByText('essence.maamendHint')).toBeNull()
  })

  it('renders nothing when the dismissed flag is already persisted', () => {
    useUiHintsStore.setState({ maamendHintDismissed: true })
    render(<MaaendImportHint />)
    expect(screen.queryByText('essence.maamendHint')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
