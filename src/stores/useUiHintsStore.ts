import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * One-shot UI hints (首次指引) that must stay dismissed across visits.
 *
 * Deliberately separate from useEssenceSettingsStore: that store is mirrored
 * into the cloud sync payload and the file backup, and a purely local
 * "我已经看过这条提示" flag must not travel between devices or overwrite the
 * onboarding state of a fresh install.
 */
export interface UiHintsState {
  /** MaaEND 基质库存导入指引：基质规划页首次访问时显示，关闭后不再出现。 */
  maamendHintDismissed: boolean
  dismissMaaendHint: () => void
}

export const useUiHintsStore = create<UiHintsState>()(
  persist(
    (set) => ({
      maamendHintDismissed: false,
      dismissMaaendHint: () => set({ maamendHintDismissed: true }),
    }),
    { name: 'ui-hints' },
  ),
)
