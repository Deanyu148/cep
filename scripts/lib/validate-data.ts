/**
 * Validate existing project data against upstream game data.
 * Reports differences without modifying any files.
 * Weapon data sourced from AKEData/TableCfg/ (WeaponBasicTable, SkillPatchTable).
 * ================================================================================
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseJsonSafe } from './json-utils'
import { buildGemTableLookup, loadTextTable } from './stat-mapping'
import { extractItemNameIds } from './extract-textid'
import { WEAPON_TYPE_MAP } from './compare-weapons'
import { buildAttrShowConfigs, resolveFormat, formatEquipStat } from './equip-stat-format'
import { resolveWeaponStats } from './weapon-stats'
import type { WeaponSkillPatchEntry } from './weapon-stats'
import { buildWeaponAcquisitionData, sourcelessWeaponWarning } from './weapon-acquisition'
import type { WikiAssets } from './wiki-assets'
import { createCharacterAvatarResolver } from '../../src/lib/character-avatar-resolve'
import { wikiTextKey } from '../../src/lib/wiki-i18n'

// ── Validation result ─────────────────────────────────────────────────────

export interface ValidationIssue {
  category: 'weapon' | 'equip' | 'dungeon'
  id: string
  field: string
  expected: string
  actual: string
  /**
   * `warning` = 只报告不阻断。用于上游自己就缺数据的情况 (如新武器还没有任何获取途径):
   * 项目本来就不可能拿到数据, 把它当"不一致"会让同步永远无法成功。
   * 缺省 (undefined) = 阻断性错误。
   */
  severity?: 'warning'
}

/**
 * 按 `severity` 把校验结果分成阻断性错误与参考信息。`check` 的闸门与 `update` 的
 * 退出码只看 blocking —— 否则一条上游自带的 warning 会让闸门每次都报"有变更"。
 */
export function partitionValidationIssues(
  issues: readonly ValidationIssue[],
): { blocking: ValidationIssue[]; advisory: ValidationIssue[] } {
  const blocking: ValidationIssue[] = []
  const advisory: ValidationIssue[] = []
  for (const issue of issues) {
    if (issue.severity === 'warning') advisory.push(issue)
    else blocking.push(issue)
  }
  return { blocking, advisory }
}

/**
 * `source: 'preview'` 标记的条目 id (前瞻/未上线)。条目一行一条, 与
 * `migrate-foresight-weapons.ts` 的 `lineId` 约定一致: 只认行首或 `,` 后的 id 字段,
 * 避免误命中 `previewId: 'preview:xx'` 这类包含 `id:` 子串的字段。
 */
function collectPreviewWeaponIds(content: string): Set<string> {
  const ids = new Set<string>()
  for (const line of content.split('\n')) {
    if (!/source:\s*'preview'/.test(line)) continue
    const id = /(?:^|[{,]) *id: *'([^']+)'/.exec(line)?.[1]
    if (id) ids.add(id)
  }
  return ids
}

// ── Validate weapons ──────────────────────────────────────────────────────


export function validateWeapons(
  akedataPath: string,
  projectWeaponsTsPath: string,
  excludedWeaponIds: ReadonlySet<string> = new Set(),
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!existsSync(projectWeaponsTsPath)) {
    return [{
      category: 'weapon',
      id: projectWeaponsTsPath,
      field: 'file',
      expected: 'present',
      actual: '<missing>',
    }]
  }
  const projectContent = readFileSync(projectWeaponsTsPath, 'utf-8')
  // 前瞻条目 (source: 'preview') 用的是正式 id + 图标 + 翻译, 只是上游 `WeaponBasicTable`
  // 还没收录它们 —— 所以不能当"项目多出来的脏数据"。历史上前瞻条目用 `preview:名称`
  // 临时 id, 现在用正式 id, 两种形式都要放行。
  const previewWeaponIds = collectPreviewWeaponIds(projectContent)

  const weaponRegex = /\{\s*id:\s*'([^']+)'(?:,\s*iconId:\s*'[^']*')?,\s*name:\s*'((?:\\.|[^'\\])*)',\s*rarity:\s*(\d+),\s*type:\s*'([^']*)',\s*primaryStat:\s*(?:'([^']*)'|(null)),\s*elementalDamage:\s*(?:'([^']*)'|(null)),\s*specialAbility:\s*(?:'([^']*)'|(null))/g
  const projectWeapons = new Map<string, { name: string; rarity: number; type: string; primaryStat: string | null; elementalDamage: string | null; specialAbility: string | null }>()
  let m: RegExpExecArray | null
  while ((m = weaponRegex.exec(projectContent)) !== null) {
    projectWeapons.set(m[1], {
      name: m[2].replace(/\\(['\\])/g, '$1'),
      rarity: Number(m[3]),
      type: m[4],
      primaryStat: m[6] ? null : m[5],
      elementalDamage: m[8] ? null : m[7],
      specialAbility: m[10] ? null : m[9],
    })
  }

  // Load WeaponBasicTable (all weapon metadata)
  const wpnBasicPath = join(akedataPath, 'TableCfg', 'WeaponBasicTable.json')
  if (!existsSync(wpnBasicPath)) {
    return [{
      category: 'weapon',
      id: 'WeaponBasicTable.json',
      field: 'file',
      expected: 'present',
      actual: '<missing>',
    }]
  }
  const wpnBasic = JSON.parse(readFileSync(wpnBasicPath, 'utf-8')) as Record<string, { rarity?: number; weaponType?: number; weaponSkillList?: string[] }>

  // Load SkillPatchTable (lossless-json for int64-safe skillName.id)
  const skillPatchPath = join(akedataPath, 'TableCfg', 'SkillPatchTable.json')
  const skillPatch = existsSync(skillPatchPath)
    ? parseJsonSafe(skillPatchPath) as Record<string, WeaponSkillPatchEntry>
    : {}

  const { cnToGem, tagToGem } = buildGemTableLookup(akedataPath)
  const cnTextTable = loadTextTable(akedataPath, 'zh-CN')
  const weaponNameTextIds = extractItemNameIds(join(akedataPath, 'TableCfg', 'ItemTable.json'))

  // Iterate WeaponBasicTable entries (76 weapons)
  for (const [weaponId, wpnData] of Object.entries(wpnBasic)) {
    const rarity = wpnData.rarity ?? 1
    if (rarity < 3) continue
    // 上游无获取途径的武器 (剧情/预留变体) 站点不收录, 见 updateWeaponsFile 的新增过滤
    if (excludedWeaponIds.has(weaponId)) continue

    const projectWeapon = projectWeapons.get(weaponId)
    if (!projectWeapon) {
      issues.push({ category: 'weapon', id: weaponId, field: 'record', expected: 'present', actual: '<missing>' })
      continue
    }

    const nameTextId = weaponNameTextIds[weaponId] ?? ''
    const expectedName = nameTextId ? cnTextTable[nameTextId] : undefined
    if (!expectedName) {
      issues.push({
        category: 'weapon',
        id: weaponId,
        field: 'upstreamName',
        expected: 'localized name',
        actual: '<missing>',
      })
    } else if (expectedName !== projectWeapon.name) {
      issues.push({ category: 'weapon', id: weaponId, field: 'name', expected: expectedName, actual: projectWeapon.name })
    }
    if (rarity !== projectWeapon.rarity) {
      issues.push({ category: 'weapon', id: weaponId, field: 'rarity', expected: String(rarity), actual: String(projectWeapon.rarity) })
    }

    const expectedType = wpnData.weaponType !== undefined ? WEAPON_TYPE_MAP[wpnData.weaponType] : undefined
    if (!expectedType) {
      issues.push({
        category: 'weapon',
        id: weaponId,
        field: 'upstreamType',
        expected: 'known weapon type',
        actual: String(wpnData.weaponType ?? '<missing>'),
      })
    } else if (expectedType !== projectWeapon.type) {
      issues.push({ category: 'weapon', id: weaponId, field: 'type', expected: expectedType, actual: projectWeapon.type || '<empty>' })
    }

    const upstream = resolveWeaponStats(
      wpnData.weaponSkillList ?? [],
      skillPatch,
      tagToGem,
      cnTextTable,
      cnToGem,
    )
    if (upstream.unresolvedSkillIds.length > 0) {
      issues.push({
        category: 'weapon',
        id: weaponId,
        field: 'upstreamSkills',
        expected: 'all weapon skills resolved',
        actual: upstream.unresolvedSkillIds.join(', '),
      })
      continue
    }

    const compareField = (
      field: 'primaryStat' | 'elementalDamage' | 'specialAbility',
      expected: string | null,
    ) => {
      const actual = projectWeapon[field]
      if (expected !== actual) {
        issues.push({
          category: 'weapon',
          id: weaponId,
          field,
          expected: expected ?? '<empty>',
          actual: actual ?? '<empty>',
        })
      }
    }

    compareField('primaryStat', upstream.primaryStat)
    compareField('elementalDamage', upstream.elementalDamage)
    compareField('specialAbility', upstream.specialAbility)
  }

  for (const weaponId of projectWeapons.keys()) {
    if (weaponId.startsWith('preview:')) continue
    if (previewWeaponIds.has(weaponId)) continue
    const upstream = wpnBasic[weaponId]
    if (!upstream || (upstream.rarity ?? 1) < 3) {
      issues.push({
        category: 'weapon',
        id: weaponId,
        field: 'record',
        expected: '<absent>',
        actual: 'present',
      })
    }
  }

  return issues
}

function parseProjectWeaponAcquisitionSources(projectContent: string): Map<string, Array<{ categoryId: string; sourceId: string }>> {
  const result = new Map<string, Array<{ categoryId: string; sourceId: string }>>()
  const weaponLineRegex = /^\s*\{[^\n]*\bid:\s*'(wpn_[^']+)'[^\n]*\},?\s*$/gm
  let match: RegExpExecArray | null
  while ((match = weaponLineRegex.exec(projectContent)) !== null) {
    const field = match[0].match(/acquisitionSources:\s*\[([^\]]*)\]/)?.[1] ?? ''
    const sources: Array<{ categoryId: string; sourceId: string }> = []
    const sourceRegex = /\{\s*categoryId:\s*'([^']+)'\s*,\s*sourceId:\s*'([^']+)'\s*\}/g
    let sourceMatch: RegExpExecArray | null
    while ((sourceMatch = sourceRegex.exec(field)) !== null) {
      sources.push({ categoryId: sourceMatch[1], sourceId: sourceMatch[2] })
    }
    result.set(match[1], sources)
  }
  return result
}

export function validateWeaponAcquisition(
  akedataPath: string,
  projectWeaponsTsPath: string,
  projectRoot?: string,
): ValidationIssue[] {
  if (!existsSync(projectWeaponsTsPath)) return []
  const projectContent = readFileSync(projectWeaponsTsPath, 'utf8')
  const projectSources = parseProjectWeaponAcquisitionSources(projectContent)
  const upstream = buildWeaponAcquisitionData(akedataPath)
  const issues: ValidationIssue[] = []
  // 上游一条获取途径都没有的武器 (剧情/预留变体): 站点不收录它们 (updateWeaponsFile /
  // generate-wiki-data.ts 都会跳过), 所以既不能要求 weapons.ts 里有记录, 也不能把
  // "来源为空"当成分歧 —— 只报一条参考信息。它们对应的 warning 字符串也要滤掉。
  const excludedWeaponIds = new Set(upstream.sourcelessWeaponIds)
  const excludedWarnings = new Set(upstream.sourcelessWeaponIds.map(sourcelessWeaponWarning))
  for (const warning of upstream.warnings) {
    if (excludedWarnings.has(warning)) continue
    issues.push({ category: 'weapon', id: warning, field: 'acquisitionSource', expected: 'valid source mapping', actual: warning })
  }
  for (const [weaponId, expectedSources] of Object.entries(upstream.sourcesByWeapon)) {
    if (excludedWeaponIds.has(weaponId)) continue
    const actualSources = projectSources.get(weaponId)
    if (!actualSources) {
      issues.push({ category: 'weapon', id: weaponId, field: 'acquisitionSources', expected: JSON.stringify(expectedSources), actual: '<missing>' })
      continue
    }
    const expected = JSON.stringify(expectedSources)
    const actual = JSON.stringify(actualSources)
    if (expected !== actual) issues.push({ category: 'weapon', id: weaponId, field: 'acquisitionSources', expected, actual })
  }
  // 上游无获取途径的武器 (剧情/预留变体): 站点不收录, 只报一条参考信息。
  // 已在站内列表里的条目不会被自动摘除 (会连带丢掉人工维护的 chars), 所以单独提示。
  for (const weaponId of upstream.sourcelessWeaponIds) {
    if (projectSources.has(weaponId)) {
      issues.push({ category: 'weapon', id: weaponId, field: 'acquisitionSources', expected: 'at least one source', actual: '<empty>', severity: 'warning' })
      continue
    }
    issues.push({ category: 'weapon', id: weaponId, field: 'record', expected: 'site-eligible upstream weapon', actual: 'upstream has no acquisition path — not listed on the site', severity: 'warning' })
  }
  if (projectRoot) issues.push(...validateGeneratedWeaponAcquisitionI18n(projectRoot, upstream))
  return issues
}
function validateGeneratedWeaponAcquisitionI18n(
  projectRoot: string,
  upstream: ReturnType<typeof buildWeaponAcquisitionData>,
 ): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const locales = ['zh-CN', 'en', 'ja', 'zh-TW'] as const
  for (const locale of locales) {
    const path = join(projectRoot, 'src', 'generated', 'i18n', 'wikiData', `${locale}.json`)
    if (!existsSync(path)) {
      issues.push({ category: 'weapon', id: path, field: 'file', expected: 'present', actual: '<missing>' })
      continue
    }
    let catalog: Record<string, unknown>
    try {
      catalog = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    } catch {
      issues.push({ category: 'weapon', id: path, field: 'file', expected: 'valid JSON', actual: '<invalid>' })
      continue
    }
    for (const categoryId of Object.keys(upstream.categories)) {
      const key = wikiTextKey('acquisitionCategory', categoryId)
      if (typeof catalog[key] !== 'string' || !catalog[key]) {
        issues.push({ category: 'weapon', id: categoryId, field: 'categoryI18n', expected: key, actual: String(catalog[key] ?? '<missing>') })
      }
    }
    for (const entry of Object.values(upstream.details)) {
      const prefix = ['acquisitionSource', entry.source.categoryId, entry.source.sourceId] as const
      const nameKey = wikiTextKey(...prefix, 'name')
      if (typeof catalog[nameKey] !== 'string' || !catalog[nameKey]) {
        issues.push({ category: 'weapon', id: `${entry.source.categoryId}/${entry.source.sourceId}`, field: 'nameI18n', expected: nameKey, actual: String(catalog[nameKey] ?? '<missing>') })
      }
      if (entry.description) {
        const descriptionKey = wikiTextKey(...prefix, 'description')
        if (typeof catalog[descriptionKey] !== 'string' || !catalog[descriptionKey]) {
          issues.push({ category: 'weapon', id: `${entry.source.categoryId}/${entry.source.sourceId}`, field: 'descriptionI18n', expected: descriptionKey, actual: String(catalog[descriptionKey] ?? '<missing>') })
        }
      }
    }
  }
  return issues
}



// ── Validate equips ─────────────────────────────────────────────────────

export function validateEquips(
  akedataPath: string,
  projectEquipsTsPath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!existsSync(projectEquipsTsPath)) return issues
  const projectContent = readFileSync(projectEquipsTsPath, 'utf-8')

  // Extract RAW_EQUIPS entries: field-order-independent parsing
  const projectEquips = new Map<string, { name: string; sub1: string; sub2: string; special: string }>()
  const rawArrayStart = projectContent.indexOf('const RAW_EQUIPS')
  if (rawArrayStart !== -1) {
    const arrOpen = projectContent.indexOf('[', rawArrayStart)
    if (arrOpen !== -1) {
      let depth = 0
      let objStart = -1
      for (let i = arrOpen; i < projectContent.length; i++) {
        if (projectContent[i] === '{') {
          if (depth === 0) objStart = i
          depth++
        } else if (projectContent[i] === '}') {
          depth--
          if (depth === 0 && objStart !== -1) {
            const objText = projectContent.slice(objStart, i + 1)
            const field = (re: RegExp) => { const m = re.exec(objText); return m ? m[1] : '' }
            const name = field(/name:\s*['"]([^'"]*)['"]/)
            const sub1 = field(/sub1:\s*['"]([^'"]*)['"]/)
            const sub2 = field(/sub2:\s*['"]([^'"]*)['"]/)
            const special = field(/special:\s*['"]([^'"]*)['"]/)
            const equipId = field(/equipId:\s*['"]([^'"]*)['"]/)
            const iconId = field(/iconId:\s*['"]([^'"]*)['"]/)
            const key = equipId || iconId
            if (name && key) {
              projectEquips.set(key, { name, sub1, sub2, special })
            }
            objStart = -1
          }
        }
      }
    }
  }

  // Read upstream EquipTable from AKEData
  const equipTablePath = join(akedataPath, 'TableCfg', 'EquipTable.json')
  if (!existsSync(equipTablePath)) return issues
  const equipTable = parseJsonSafe(equipTablePath) as Record<string, { displayAttrModifiers?: { attrIndex: number; attrType: number; attrValue: number; modifierType?: number; compositeAttr?: string }[] }>

  // Resolve equip display names: ItemTable.name.id → I18nTextTable_CN
  const equipTextIds = extractItemNameIds(join(akedataPath, 'TableCfg', 'ItemTable.json'))
  const textTableCN = loadTextTable(akedataPath, 'zh-CN')

  // Build attrType → AttrShowConfig and compositeAttr → AttrShowConfig (with valueFormat)
  const { attrTypeMap, compositeCfg } = buildAttrShowConfigs(akedataPath)

  // For each equip in EquipTable, compare project equips against upstream
  for (const [upstreamEquipId, equipData] of Object.entries(equipTable)) {
    const nameTextId = equipTextIds[upstreamEquipId]
    const equipName = (nameTextId && textTableCN[nameTextId]) || ''
    if (!equipName) continue

    const projectEquip = projectEquips.get(upstreamEquipId)
    if (!projectEquip) continue // Skip new equips (handled by sync)

    // Build upstream stat strings from displayAttrModifiers
    let upstreamSub1 = ''
    let upstreamSub2 = ''
    let upstreamSpecial = ''

    for (const mod of equipData.displayAttrModifiers ?? []) {
      if (Number(mod.attrIndex) === 0) continue

      const modType = Number(mod.modifierType ?? 5)
      const attrType = Number(mod.attrType)
      const compositeAttr = String(mod.compositeAttr ?? '')

      let key: string
      let valueFormat: string

      if (attrType === 0 && compositeAttr) {
        key = compositeAttr
        valueFormat = resolveFormat(compositeCfg.get(compositeAttr), compositeAttr, modType)
      } else {
        const attrInfo = attrTypeMap.get(attrType)
        if (!attrInfo) continue
        key = String(attrType)
        valueFormat = resolveFormat(attrInfo, String(attrType), modType)
      }

      const statStr = formatEquipStat(key, String(mod.attrValue), valueFormat)
      if (Number(mod.attrIndex) === 1) upstreamSub1 = statStr
      else if (Number(mod.attrIndex) === 2) upstreamSub2 = statStr
      else if (Number(mod.attrIndex) === 3) upstreamSpecial = statStr
    }

    const compareField = (field: string, upstream: string, project: string) => {
      if (upstream !== project) {
        issues.push({ category: 'equip', id: equipName, field, expected: upstream || '<empty>', actual: project || '<empty>' })
      }
    }
    compareField('sub1', upstreamSub1, projectEquip.sub1)
    compareField('sub2', upstreamSub2, projectEquip.sub2)
    compareField('special', upstreamSpecial, projectEquip.special)
  }

  return issues
}

// ── Validate dungeons ─────────────────────────────────────────────────────

export function validateDungeons(
  akedataPath: string,
  projectDungeonsTsPath: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!existsSync(projectDungeonsTsPath)) return issues
  const projectContent = readFileSync(projectDungeonsTsPath, 'utf-8')

  // Load group table
  const groupTablePath = join(akedataPath, 'TableCfg', 'WorldEnergyPointGroupTable.json')
  if (!existsSync(groupTablePath)) return issues
  const groupTable = parseJsonSafe(groupTablePath) as Record<string, Record<string, unknown>>

  // Extract project dungeon data (now stores gemTermId directly)
  const dungeonRegex = /\{\s*id:\s*'([^']+)',\s*name:\s*'[^']*',\s*s1Pool:\s*\[([^\]]*)\],\s*s2Pool:\s*\[([^\]]*)\],\s*s3Pool:\s*\[([^\]]*)\]/g
  const projectDungeons = new Map<string, { s1Pool: string[]; s2Pool: string[]; s3Pool: string[] }>()
  let m: RegExpExecArray | null
  while ((m = dungeonRegex.exec(projectContent)) !== null) {
    projectDungeons.set(m[1], {
      s1Pool: m[2].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean),
      s2Pool: m[3].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean),
      s3Pool: m[4].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean),
    })
  }

  // Compare pool contents against upstream group data
  for (const [groupId, groupData] of Object.entries(groupTable)) {
    const projectDungeon = projectDungeons.get(groupId)
    if (!projectDungeon) continue

    const upstreamS1 = (groupData.primAttrTermIds ?? []) as string[]
    const upstreamS2 = (groupData.secAttrTermIds ?? []) as string[]
    const upstreamS3 = (groupData.skillTermIds ?? []) as string[]

    const comparePool = (label: string, upstream: string[], project: string[]) => {
      const upSet = new Set(upstream)
      const projSet = new Set(project)
      const missing = upstream.filter(t => !projSet.has(t))
      const extra = project.filter(t => !upSet.has(t))
      if (missing.length > 0) {
        issues.push({ category: 'dungeon', id: groupId, field: `${label}_missing`, expected: missing.join(', '), actual: '' })
      }
      if (extra.length > 0) {
        issues.push({ category: 'dungeon', id: groupId, field: `${label}_extra`, expected: '', actual: extra.join(', ') })
      }
    }
    comparePool('s1', upstreamS1, projectDungeon.s1Pool)
    comparePool('s2', upstreamS2, projectDungeon.s2Pool)
    comparePool('s3', upstreamS3, projectDungeon.s3Pool)
  }

  return issues
}

// ── Validate image existence ──────────────────────────────────────────────

export function validateImages(
  projectRoot: string,
  options: { skipCharacterImages?: boolean } = {}
): string[] {
  const manifestPath = join(projectRoot, 'src', 'generated', 'data', 'wiki', 'assets.json')
  if (!existsSync(manifestPath)) return ['/src/generated/data/wiki/assets.json']
  const assets = JSON.parse(readFileSync(manifestPath, 'utf8')) as WikiAssets
  const characterPaths = options.skipCharacterImages
    ? []
    : [
        ...assets.characters.map((id) => `/images/characters/${id}.avif`),
        ...assets.characterFullBody.map((id) => `/images/characters/full/${id}.avif`),
      ]
  // Preview characters (not yet in game data) resolve through their own
  // generated manifest; validate those avatars too.
  const previewManifestPath = join(
    projectRoot,
    'src',
    'generated',
    'data',
    'wiki',
    'preview-character-avatars.json'
  )
  const previewPaths = options.skipCharacterImages || !existsSync(previewManifestPath)
    ? []
    : Object.values(
        JSON.parse(readFileSync(previewManifestPath, 'utf8')) as Record<string, string>
      ).map((id) => `/images/characters/${id}.avif`)
  const paths = [
    ...characterPaths,
    ...previewPaths,
    ...assets.characterPotential.map((id) => `/images/wiki/character-potential/${id}.avif`),
    ...assets.weapons.map((id) => `/images/weapon/${id}.avif`),
    ...assets.equipment.map((id) => `/images/equip/${id}.avif`),
    ...assets.skills.map((id) => `/images/wiki/skills/${id}.avif`),
    ...assets.logisticsSkills.map((id) => `/images/wiki/logistics/${id}.avif`),
    ...assets.materials.map((id) => `/images/items/${id}.avif`),
    ...(assets.buffIcons ?? []).map((id) => `/images/wiki/bufficon/${id}.avif`),
  ]
  return paths.filter((path) => !existsSync(join(projectRoot, 'public', path)))
}

// ── Validate character avatar mappings ────────────────────────────────────

export interface CharacterAvatarMappingIssue {
  name: string
  /** Where the name is referenced: banner schedule entries or the standard pool. */
  source: 'banner' | 'standard'
}

/** Names the UI must be able to resolve to an avatar file. */
export interface BannerNameSource {
  bannerSchedule: Readonly<Record<string, unknown>>
  standardCharacters: readonly string[]
}

/**
 * `src/data/banner.ts` is app source, so it is imported rather than re-parsed:
 * a regex over the schedule would drift the moment the file is refactored.
 */
async function loadBannerNameSource(bannerTsPath: string): Promise<BannerNameSource> {
  const loaded = (await import(pathToFileURL(bannerTsPath).href)) as BannerNameSource
  return loaded
}

/**
 * Every character name the banner UI resolves to an avatar must have a mapping,
 * or `useBannerStore` throws while the module is imported — which fails 4 CI test
 * files without ever mentioning the missing avatar. The mapping for unreleased
 * characters only exists after a Skland scrape, so this check is what lets the
 * check phase notice "a new preview character was referenced but never scraped".
 */
export async function validateCharacterAvatarMappings(
  projectRoot: string,
  loadBannerData: (bannerTsPath: string) => Promise<BannerNameSource> = loadBannerNameSource,
): Promise<CharacterAvatarMappingIssue[]> {
  const bannerTsPath = join(projectRoot, 'src', 'data', 'banner.ts')
  const charactersPath = join(projectRoot, 'src', 'generated', 'i18n', 'characters', 'zh-CN.json')
  if (!existsSync(bannerTsPath) || !existsSync(charactersPath)) return []

  const previewPath = join(
    projectRoot,
    'src',
    'generated',
    'data',
    'wiki',
    'preview-character-avatars.json',
  )
  const resolver = createCharacterAvatarResolver({
    characterNames: (parseJsonSafe(charactersPath) ?? {}) as Record<string, string>,
    previewAvatars: (existsSync(previewPath)
      ? parseJsonSafe(previewPath) ?? {}
      : {}) as Record<string, string>,
  })

  const { bannerSchedule, standardCharacters } = await loadBannerData(bannerTsPath)
  const issues: CharacterAvatarMappingIssue[] = []
  const reported = new Set<string>()

  const check = (name: string, source: CharacterAvatarMappingIssue['source']) => {
    if (reported.has(name)) return
    if (resolver.resolve(name)) return
    reported.add(name)
    issues.push({ name, source })
  }

  for (const name of Object.keys(bannerSchedule ?? {})) check(name, 'banner')
  for (const name of standardCharacters ?? []) check(name, 'standard')

  return issues
}

// ── Main validation function ──────────────────────────────────────────────

export function validateAllData(
  akedataPath: string,
  projectRoot: string,
): ValidationIssue[] {
  // 上游无获取途径的武器 (剧情/预留变体) 站点不收录 (updateWeaponsFile / generate-wiki-data.ts),
  // 所以 "weapons.ts 里必须有记录" 这类检查要把它们排除掉。只扫一次获取途径数据。
  const excludedWeaponIds = new Set(buildWeaponAcquisitionData(akedataPath).sourcelessWeaponIds)
  const issues: ValidationIssue[] = [
    ...validateWeapons(akedataPath, join(projectRoot, 'src', 'data', 'weapons.ts'), excludedWeaponIds),
    ...validateWeaponAcquisition(akedataPath, join(projectRoot, 'src', 'data', 'weapons.ts'), projectRoot),
    ...validateEquips(akedataPath, join(projectRoot, 'src', 'data', 'equips.ts')),
    ...validateDungeons(akedataPath, join(projectRoot, 'src', 'data', 'dungeons.ts')),
  ]
  return issues
}
