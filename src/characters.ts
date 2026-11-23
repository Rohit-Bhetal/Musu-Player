/** Character art in public/characters/ — real assets, not generated, so they
 * live outside public/icons/ (which gen-assets.mjs owns) and are not in the
 * PWA's precache glob: a "while playing" flourish is not worth ~2 MB on the
 * critical offline-boot path. Shared by NowPlaying's header cameo and the
 * Lock Screen/Dynamic Island artwork badge (player/mediaArtwork.ts) — one
 * list, so adding a character only ever means editing one place. */
// Only ever list what's actually in public/characters/ right now — this file
// is hand-edited to match whenever a character is added or removed there.
export const CHARACTER_IMAGES: string[] = [
  '/characters/character-a.gif',
  '/characters/character-b.gif',
  '/characters/character-c.gif',
  '/characters/character-d.gif',
  '/characters/character-e.gif',
  '/characters/character-f.gif',
  '/characters/character-g.gif',
]
