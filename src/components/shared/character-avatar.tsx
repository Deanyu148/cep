'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { withImageCacheVersion } from '@/lib/image-url'
import { getCharacterAvatarPath } from '@/lib/character-images'

/**
 * Face-framed character portrait in a circle.
 *
 * The synced assets are full bust portraits (456x564). Mapping one of those into
 * a 30–48px circle shows the whole bust, so the face ends up ~9px tall and reads
 * as noise; cropping to just the head makes the face huge. Instead the image box
 * is laid out at 138% x 171% (the portrait's own aspect) and offset so the
 * circle frames a 330px-wide square anchored at 42% of the portrait height —
 * head plus a little hair/shoulder, at any rendered size. The box is bigger than
 * the circle in layout terms, so nothing is rasterised up: the browser
 * downscales from 456px to the circle instead of magnifying a small crop.
 *
 * Framing constants were checked against all 35 portraits in
 * `public/images/characters` (uniform bust framing across characters).
 */
export interface CharacterAvatarProps {
  /** Raw (zh-CN) character name from the game data (e.g. `weapon.chars`). */
  name: string
  /** Size and ring styling; the crop adapts to whatever size is passed. */
  className?: string
  /**
   * Accessible name. Defaults to the character name; pass `''` where the name is
   * already rendered as text next to the portrait.
   */
  alt?: string
}

const FACE_FRAMED_IMAGE_CLASS =
  'absolute -left-[19%] -top-[22%] h-[171%] w-[138%] max-w-none object-cover'

export function CharacterAvatar({ name, className, alt }: CharacterAvatarProps) {
  const src = getCharacterAvatarPath(name)
  if (!src) return null

  return (
    <span
      data-character-avatar={name}
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-full bg-black/60',
        className,
      )}
    >
      <Image
        src={withImageCacheVersion(src)}
        alt={alt ?? name}
        width={456}
        height={564}
        className={FACE_FRAMED_IMAGE_CLASS}
        unoptimized
      />
    </span>
  )
}

export default CharacterAvatar
