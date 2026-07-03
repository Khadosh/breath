import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

mkdirSync('public/icons', { recursive: true })

const jobs = [
  ['scripts/icon.svg', 'public/icons/icon-192.png', 192],
  ['scripts/icon.svg', 'public/icons/icon-512.png', 512],
  ['scripts/icon.svg', 'public/apple-touch-icon.png', 180],
  ['scripts/icon-maskable.svg', 'public/icons/maskable-512.png', 512],
]

for (const [src, out, size] of jobs) {
  await sharp(src).resize(size, size).png().toFile(out)
  console.log('wrote', out)
}

await sharp('scripts/icon.svg').resize(32, 32).png().toFile('public/favicon.png')
console.log('wrote public/favicon.png')
