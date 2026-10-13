/**
 * 版本提示「刷新页面」用的一次性 cache-busting 参数。
 *
 * `useVersion().refreshPage()` (src/hooks/use-version.tsx) 会给 URL 加上它再整页
 * 跳转, 以便同时绕开 bfcache 和 HTTP 磁盘缓存。参数只对「这一次文档请求」有意义,
 * 必须在 Next 客户端运行时读取 window.location 之前从地址栏移除 —— 晚一步就会
 * 被 App Router 当成这条路由的真实 URL 记下来:
 *
 *   1. 水合时 `createInitialRouterState` (next/dist/client/components/router-reducer/
 *      create-initial-router-state.js) 用 window.location.href 当 canonicalUrl;
 *   2. 同一个 canonicalUrl 被 `discoverKnownRoute(...)` 写进 Next 16 segment cache
 *      的 route cache 条目 (segment-cache/cache.js 的 fulfillRouteCacheEntry)。
 *      注意 route cache 的 key 只由 pathname + renderedSearch + nextUrl 组成
 *      (segment-cache/vary-path.js), **不含** `_t`, 但 value 里的 canonicalUrl
 *      **含** `_t` —— 键命中, 值带脏数据;
 *   3. 之后任何指向同一路由的软导航都会走
 *      `canonicalUrl = route.canonicalUrl + url.hash`
 *      (segment-cache/navigation.js navigateUsingPrefetchedRouteTree), 把 `_t`
 *      原样写回地址栏; 路由状态变化则经 HistoryUpdater (app-router.js) 写回。
 *
 * 结果是「带 `_t` 加载过的那条路由, 每次再进入都会带回同一个时间戳」, 直到整页刷新
 * 或该 route cache 条目过期 (staleTimes.static, 默认 5 分钟)。用一个 React effect
 * 去摘参数修不了它: effect 只在水合后运行, 上面 1~2 步已经发生; 实测即使随后手动
 * dispatch 一次带干净 URL 的 ACTION_RESTORE, route cache 条目仍是脏的。
 *
 * 因此摘除动作必须发生在 HTML 解析阶段 (本脚本经 HeadScript 内联在每页 <head>)。
 * 这早于 Next 的 RSC flight 载荷 (位于 </body> 之前) 与 hydrate() 读取
 * window.location —— 内联非 async 脚本会阻塞解析, 载荷根本没被投递, 不存在
 * 「水合先跑完」的竞态。
 */

export const REFRESH_CACHE_BUST_PARAM = '_t'

/**
 * 从地址栏摘除 `_t` 的同步内联脚本。
 *
 * 用 `history.replaceState` 而非 `location.replace`: 不再发请求、不新增历史记录,
 * 因此不会碰到 bfcache/缓存, 用户按返回键也不会回到带 `_t` 的那一页。
 * 其余 query 与 hash 原样保留 (分享出去的 UTM 参数不能因为一次刷新被吃掉)。
 *
 * 任何异常 (URL 构造失败、history 被沙箱限制) 都吞掉: 摘不掉参数只是回到旧行为,
 * 绝不能让 <head> 里的脚本把页面打断。
 */
export const STRIP_REFRESH_PARAM_SCRIPT =
  `(function(){try{` +
  `var p=${JSON.stringify(REFRESH_CACHE_BUST_PARAM)},` +
  `u=new URL(location.href);` +
  `if(!u.searchParams.has(p))return;` +
  `u.searchParams.delete(p);` +
  `history.replaceState(history.state,'',u.toString())` +
  `}catch(e){}})()`
