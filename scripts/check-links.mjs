/**
 * check-links.mjs
 * Finds internal links in apps/web that point at routes which don't exist.
 * Collects literal hrefs/redirect targets ('/x', `/x/${id}`) from .ts/.tsx and
 * matches them against the app-router tree (route groups ignored; [param]
 * segments match any value). Exits 1 when any link is broken.
 *
 * Usage: node scripts/check-links.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'apps', 'web', 'src')
const APP = join(ROOT, 'app')

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}

// Route patterns: directories containing page.tsx or route.ts.
const routes = walk(APP)
  .filter((f) => /[\\/](page\.tsx|route\.ts)$/.test(f))
  .map((f) => relative(APP, f).split(sep).slice(0, -1).filter((s) => !(s.startsWith('(') && s.endsWith(')'))))

function matches(segs) {
  return routes.some((r) => {
    if (r.length && r[r.length - 1].startsWith('[...')) return segs.length >= r.length - 1 && r.slice(0, -1).every((p, i) => p.startsWith('[') || p === segs[i])
    if (r.length !== segs.length) return false
    return r.every((p, i) => p.startsWith('[') || p === segs[i])
  })
}

// Redirects/rewrites declared in next.config.ts are also valid targets.
const config = readFileSync(join(ROOT, '..', 'next.config.ts'), 'utf8')
const redirectSources = [...config.matchAll(/source:\s*'([^']+)'/g)].map((m) => m[1])

const LINK = /(?:href|router\.(?:push|replace)|redirect|actionUrl|window\.location\.href\s*=)\s*[=(:]?\s*\{?\s*(['"`])(\/[^'"`?#\s]*)/g
const broken = []
for (const file of walk(ROOT).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const text = readFileSync(file, 'utf8')
  for (const m of text.matchAll(LINK)) {
    let path = m[2]
    if (path.startsWith('/api/') || path.startsWith('/_next') || path === '/') continue
    path = path.replace(/\$\{[^}]*\}/g, '__param__').replace(/\/+$/, '')
    if (redirectSources.includes(path)) continue
    const segs = path.split('/').filter(Boolean)
    if (!matches(segs)) {
      const line = text.slice(0, m.index).split('\n').length
      broken.push(`${relative(ROOT, file)}:${line}  ${m[2]}`)
    }
  }
}

if (broken.length) {
  console.log(`${broken.length} broken internal link(s):`)
  console.log(broken.join('\n'))
  process.exit(1)
}
console.log('No broken internal links.')
