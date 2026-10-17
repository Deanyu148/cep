import characterNames from '@/generated/i18n/characters/zh-CN.json'
import previewCharacterAvatars from '@/generated/data/wiki/preview-character-avatars.json'
import {
  ADMINISTRATOR_ID,
  buildCharacterIdByName,
  createCharacterAvatarResolver,
  resolveAdministratorAssetId,
} from './character-avatar-resolve'

const resolver = createCharacterAvatarResolver({
  characterNames: characterNames as Record<string, string>,
  previewAvatars: previewCharacterAvatars as Record<string, string>,
})

/** zh-CN character name → game i18n id, for localized labels. */
const characterIdByName = buildCharacterIdByName(characterNames as Record<string, string>)

/**
 * Character i18n id for a raw (zh-CN) character name, or null when the name has
 * no game entry — preview characters and hand-typed custom names fall back to
 * the raw name at the call site.
 *
 * The administrator's male/female entries are one character in the i18n table
 * (`chr_9000_endmin`), so every variant maps back to that single id.
 */
export function getCharacterId(name: string): string | null {
  const normalized = name.trim()
  if (resolveAdministratorAssetId(normalized)) return ADMINISTRATOR_ID
  return characterIdByName.get(normalized) ?? null
}

/**
 * Resolves a localized character name to its avatar file.
 *
 * Preview characters (announced on the Skland wiki but not yet in the game data)
 * resolve through `preview-character-avatars.json`, which the sync pipeline
 * regenerates on every scrape. Unmapped names return null — callers decide
 * whether that is a fallback (weapon cards) or a hard error (banner schedule).
 */
export function getCharacterAvatarPath(name: string): string | null {
  const assetId = resolver.resolve(name)
  return assetId ? `/images/characters/${assetId}.avif` : null
}
