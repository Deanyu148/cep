import { test, expect, type Page } from '@playwright/test'
import { gotoAndReady } from './helpers'

const CACHE_BUST_PARAM = '_t=1791887511985'

/**
 * 回归: 版本提示的「刷新页面」用 `?_t=<时间戳>` 做 cache busting 并整页跳转。
 *
 * 这个参数必须在 Next 运行时读 window.location 之前从地址栏摘掉: 水合时它会被
 * 记成该路由的 canonicalUrl, 并写进 Next 16 segment cache 的 route cache 条目
 * (key 不含 search, value 里的 canonicalUrl 含 `_t`)。之后任何指向同一路由的软
 * 导航都会执行 `canonicalUrl = route.canonicalUrl + url.hash`, 把**同一个**时间戳
 * 原样写回地址栏 —— 表现就是「地址栏一直挂着 ?_t=...」, 直到整页刷新或条目过期
 * (staleTimes.static, 默认 5 分钟)。详见 src/lib/strip-refresh-param.ts。
 */
test.describe('refresh cache-busting param', () => {
  // 本用例要真实跑完两次 planner 页面的软导航 (两条都是重资源页面: 角色/装备
  // 图片 + 启动幕布)。并行跑整个 e2e 套件时 30s 的默认预算不够 —— 单跑约 20s,
  // 满载时会超, 与 _t 无关。
  test.setTimeout(90_000)

  test('is stripped on load and does not come back on client navigation', async ({ page }) => {
    await gotoAndReady(page, `/zh-CN/essence-planner?${CACHE_BUST_PARAM}`)

    // 摘除发生在 <head> 的同步内联脚本里, 水合前就已完成。
    await expect.poll(() => new URL(page.url()).search, { timeout: 10_000 }).toBe('')

    // 软导航到另一条路由 (未带 _t 加载过)。
    await clickSidebarLink(page, 'refinement-planner')
    await expect.poll(() => new URL(page.url()).search).toBe('')

    // 再回到带 _t 加载过的那条路由 —— 修复前这里会变回 ?_t=1791887511985
    await clickSidebarLink(page, 'essence-planner')
    await expect.poll(() => new URL(page.url()).search).toBe('')
    expect(page.url()).not.toContain('_t=')
  })
})

/**
 * 点侧边栏链接并等 URL 变化。
 *
 * `gotoAndReady` 只能证明 SSR 出来的侧边栏可见 —— 页面上那一层启动幕布与
 * hydration 都可能还没结束, 整机满载 (并行跑多个 spec) 时首击会落空。这里重试
 * 点击而不是加固定等待; 断言的是「点了以后到了没有」, 与 URL 上是否残留 `_t`
 * 无关, 因此不会掩盖本用例要守的东西。
 */
async function clickSidebarLink(page: Page, pathSegment: string) {
  const link = page.locator(`[data-sidebar="menu"] a[href*="${pathSegment}"]`).first()
  await expect(async () => {
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/${pathSegment}`), { timeout: 5_000 })
  }).toPass({ timeout: 20_000 })
}
