import { describe, expect, it } from 'vitest'
import {
  AFDIAN_OFFERS,
  buildAfdianOrderUrl,
  resolveAfdianPlanKey,
} from './afdian'

describe('buildAfdianOrderUrl', () => {
  it('constructs a product checkout link with sku and remark uid', () => {
    const url = new URL(buildAfdianOrderUrl({ offer: AFDIAN_OFFERS.yearly, uid: 4754 }))
    expect(url.origin + url.pathname).toBe('https://afdian.com/order/create')
    expect(url.searchParams.get('product_type')).toBe('1')
    expect(url.searchParams.get('plan_id')).toBe('ca8ae888c88c11f1831152540025c377')
    expect(url.searchParams.get('remark')).toBe('4754')
    expect(url.searchParams.get('sku')).toBe('[{"sku_id":"ca94aed6c88c11f19dd552540025c377","count":1}]')
    expect(url.searchParams.has('month')).toBe(false)
  })

  it('carries the purchased quantity into the sku payload', () => {
    const url = new URL(buildAfdianOrderUrl({ offer: AFDIAN_OFFERS.monthly, uid: 1, count: 3 }))
    expect(url.searchParams.get('sku')).toBe('[{"sku_id":"1a6a2b1cc88c11f1917a5254001e7c00","count":3}]')
  })

  it('keeps 31-day-per-month durations (31 / 93 / 372)', () => {
    expect(AFDIAN_OFFERS.monthly.days).toBe(31)
    expect(AFDIAN_OFFERS.quarterly.days).toBe(93)
    expect(AFDIAN_OFFERS.yearly.days).toBe(372)
  })
})

describe('resolveAfdianPlanKey', () => {
  it('maps the three product ids and rejects anything else', () => {
    expect(resolveAfdianPlanKey(AFDIAN_OFFERS.monthly.planId)).toBe('monthly')
    expect(resolveAfdianPlanKey(AFDIAN_OFFERS.quarterly.planId)).toBe('quarterly')
    expect(resolveAfdianPlanKey(AFDIAN_OFFERS.yearly.planId)).toBe('yearly')
    expect(resolveAfdianPlanKey('c96c30a4ad0e11f188475254001e7c00')).toBeNull()
    expect(resolveAfdianPlanKey(null)).toBeNull()
  })
})
