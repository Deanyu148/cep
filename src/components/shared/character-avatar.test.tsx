// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CharacterAvatar } from './character-avatar'

vi.mock('next/image', () => ({
  default: ({ src, alt = '', className }: { src: string; alt?: string; className?: string }) => (
    <span role="img" aria-label={alt} data-src={src} className={className} />
  ),
}))

vi.mock('@/lib/character-images', () => ({
  getCharacterAvatarPath: (name: string) =>
    name === '洛茜' ? '/images/characters/chr_0028_wulfa.avif' : null,
}))

afterEach(cleanup)

it('face-frames the bust portrait instead of shrinking the whole asset into the circle', () => {
  const { container } = render(<CharacterAvatar name="洛茜" className="size-10" />)

  const portrait = container.querySelector('[data-character-avatar="洛茜"]') as HTMLElement
  expect(portrait.className).toContain('size-10')
  expect(portrait.className).toContain('rounded-full')

  // The image box is laid out larger than the circle and offset onto the head, so
  // the browser downscales from the 456px asset rather than magnifying a tiny crop.
  const image = screen.getByRole('img', { name: '洛茜' })
  expect(image.className).toContain('h-[171%]')
  expect(image.className).toContain('w-[138%]')
  expect(image.className).toContain('-top-[22%]')
  expect(image.className).toContain('object-cover')
  expect(image.getAttribute('data-src')).toContain('/images/characters/chr_0028_wulfa.avif')
})

it('renders nothing for names without an avatar', () => {
  const { container } = render(<CharacterAvatar name="不存在" className="size-10" />)
  expect(container.querySelector('[data-character-avatar]')).toBeNull()
})

it('keeps the portrait decorative when the name is rendered next to it', () => {
  render(<CharacterAvatar name="洛茜" alt="" className="size-8" />)
  expect(screen.queryByRole('img', { name: '洛茜' })).toBeNull()
})
