/**
 * Generate src/data/regions.json from the served population.
 *
 * The API exposes no endpoint listing valid regions or TLAs, and both filters
 * match exactly, so the option lists have to be derived by paging a full year
 * once and committing the result. Re-run when the source snapshot changes:
 *
 *   npm run generate:regions
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = process.env.API_BASE ?? 'http://127.0.0.1:8000'
const YEAR = Number(process.env.REGIONS_YEAR ?? 2024)
const PAGE = 1000

interface Area {
  region: string
  tla: string
}

async function main() {
  const byRegion = new Map<string, Set<string>>()
  let offset = 0
  let total = Infinity

  while (offset < total) {
    const url = `${API}/api/runs/${YEAR}/areas?limit=${PAGE}&offset=${offset}`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${url} -> ${response.status} ${response.statusText}`)
    }
    const body = (await response.json()) as {
      meta: { total_matching: number }
      areas: Area[]
    }
    total = body.meta.total_matching
    for (const area of body.areas) {
      if (!byRegion.has(area.region)) byRegion.set(area.region, new Set())
      byRegion.get(area.region)!.add(area.tla)
    }
    if (body.areas.length === 0) break
    offset += PAGE
    process.stdout.write(`  ${Math.min(offset, total)} / ${total}\r`)
  }

  // Sort with a locale-aware comparison so macronised names (Ōtorohanga) order
  // sensibly rather than being pushed to the end by code-point order.
  const collator = new Intl.Collator('en-NZ')
  const output: Record<string, string[]> = {}
  for (const region of [...byRegion.keys()].sort(collator.compare)) {
    output[region] = [...byRegion.get(region)!].sort(collator.compare)
  }

  const target = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../src/data/regions.json',
  )
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8')

  const tlaCount = Object.values(output).reduce((n, list) => n + list.length, 0)
  console.log(
    `\nWrote ${Object.keys(output).length} regions and ${tlaCount} TLAs from ${YEAR} to src/data/regions.json`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
