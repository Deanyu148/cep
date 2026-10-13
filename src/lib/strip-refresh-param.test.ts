import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  REFRESH_CACHE_BUST_PARAM,
  STRIP_REFRESH_PARAM_SCRIPT,
} from '@/lib/strip-refresh-param'

/**
 * 这个脚本是「刷新页面后地址栏不会残留 `_t`」的唯一实现, 而它跑在
 * Next 运行时之外, 所以这里在 vm 沙箱里执行真实产物 (而不是复述一遍逻辑),
 * 并额外钉住两处接线: layout 是否把它注入 <head>、writer 是否仍用同一个参数名。
 */

interface RunResult {
  replaced: Array<{ state: unknown; url: string }>
  threw: boolean
}

function runScript(href: string, options: { brokenLocation?: boolean } = {}): RunResult {
  const replaced: RunResult['replaced'] = []
  const sandbox: Record<string, unknown> = {
    URL,
    history: {
      state: { marker: 'next-state' },
      replaceState(state: unknown, _unused: string, url: string) {
        replaced.push({ state, url })
      },
    },
  }
  if (options.brokenLocation) {
    Object.defineProperty(sandbox, 'location', {
      get() {
        throw new Error('location blocked')
      },
    })
  } else {
    sandbox.location = { href }
  }

  let threw = false
  try {
    vm.runInNewContext(STRIP_REFRESH_PARAM_SCRIPT, sandbox)
  } catch {
    threw = true
  }
  return { replaced, threw }
}

function strippedHref(href: string): string | null {
  const { replaced } = runScript(href)
  return replaced.length > 0 ? replaced[0].url : null
}

describe('strip-refresh-param', () => {
  it('uses the param name the version hook writes', () => {
    expect(REFRESH_CACHE_BUST_PARAM).toBe('_t')
    expect(STRIP_REFRESH_PARAM_SCRIPT).toContain(`"${REFRESH_CACHE_BUST_PARAM}"`)
  })

  it('contains no </script> sequence (it is inlined via dangerouslySetInnerHTML)', () => {
    expect(STRIP_REFRESH_PARAM_SCRIPT).not.toContain('</script>')
  })

  describe('STRIP_REFRESH_PARAM_SCRIPT', () => {
    it('removes the param and nothing else', () => {
      expect(strippedHref('https://cep.example/zh-CN/essence-planner?_t=1791887511985')).toBe(
        'https://cep.example/zh-CN/essence-planner',
      )
    })

    it('keeps other query params and the hash', () => {
      expect(strippedHref('https://cep.example/zh-CN/essence-planner?tab=s1&_t=123#plan-2')).toBe(
        'https://cep.example/zh-CN/essence-planner?tab=s1#plan-2',
      )
      expect(strippedHref('https://cep.example/zh-CN/login?expired=1&_t=123')).toBe(
        'https://cep.example/zh-CN/login?expired=1',
      )
    })

    it('removes every occurrence of the param', () => {
      expect(strippedHref('https://cep.example/zh-CN/about?_t=1&x=2&_t=3')).toBe(
        'https://cep.example/zh-CN/about?x=2',
      )
    })

    it('does nothing when the param is absent (no history write on a normal load)', () => {
      const result = runScript('https://cep.example/zh-CN/essence-planner?tab=s1')
      expect(result.replaced).toEqual([])
      expect(result.threw).toBe(false)
    })

    it('preserves the existing history state', () => {
      const { replaced } = runScript('https://cep.example/zh-CN/about?_t=1')
      expect(replaced).toHaveLength(1)
      expect(replaced[0].state).toEqual({ marker: 'next-state' })
    })

    it('swallows failures so a broken location can never blank the page', () => {
      const result = runScript('https://cep.example/zh-CN/about?_t=1', { brokenLocation: true })
      expect(result.threw).toBe(false)
      expect(result.replaced).toEqual([])
    })
  })

  describe('wiring', () => {
    const read = (relativePath: string) =>
      readFileSync(path.join(process.cwd(), relativePath), 'utf-8')

    it('is injected into <head> by the root layout', () => {
      const layout = read('src/app/layout.tsx')
      expect(layout).toContain('id="strip-refresh-param"')
      expect(layout).toContain('code={STRIP_REFRESH_PARAM_SCRIPT}')
    })

    it('is written by refreshPage with the shared constant and stripped nowhere else', () => {
      const hook = read('src/hooks/use-version.tsx')
      expect(hook).toContain('url.searchParams.set(REFRESH_CACHE_BUST_PARAM')
      // 摘参数只能由 <head> 脚本做: effect 在水合后运行, 那时 URL 已经被 Next
      // 记成路由的 canonicalUrl (见 src/lib/strip-refresh-param.ts 顶部注释)。
      expect(hook).not.toContain('searchParams.delete')
    })
  })
})
