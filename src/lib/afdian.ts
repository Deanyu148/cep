export interface AfdianOffer {
  /** 商品 ID（爱发电 order/create 的 plan_id） */
  planId: string
  /** 商品型号 ID（sku 数组里的 sku_id） */
  skuId: string
  /** 该档位发放的天数（每月按 31 天计：31 / 93 / 372） */
  days: number
}

export const AFDIAN_OFFERS = {
  monthly: { planId: '1a61358ec88c11f190e25254001e7c00', skuId: '1a6a2b1cc88c11f1917a5254001e7c00', days: 31 },
  quarterly: { planId: 'a2ce911ec88c11f1bf915254001e7c00', skuId: 'a2d77270c88c11f19aec5254001e7c00', days: 93 },
  yearly: { planId: 'ca8ae888c88c11f1831152540025c377', skuId: 'ca94aed6c88c11f19dd552540025c377', days: 372 },
} as const satisfies Record<string, AfdianOffer>

export type AfdianOfferKey = keyof typeof AFDIAN_OFFERS

const OFFER_BY_PLAN_ID = new Map<string, AfdianOfferKey>(
  Object.entries(AFDIAN_OFFERS).map(([key, offer]) => [offer.planId, key as AfdianOfferKey]),
)

export function resolveAfdianPlanKey(planId: string | null | undefined): AfdianOfferKey | null {
  if (!planId) return null
  return OFFER_BY_PLAN_ID.get(planId) ?? null
}

export interface AfdianOrderUrlOptions {
  offer: AfdianOffer
  uid: number
  count?: number
}

export function buildAfdianOrderUrl({ offer, uid, count = 1 }: AfdianOrderUrlOptions): string {
  const url = new URL('https://afdian.com/order/create')
  url.searchParams.set('product_type', '1')
  url.searchParams.set('plan_id', offer.planId)
  url.searchParams.set('sku', JSON.stringify([{ sku_id: offer.skuId, count }]))
  url.searchParams.set('remark', String(uid))
  return url.toString()
}
