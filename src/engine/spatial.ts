/**
 * Uniform spatial hash for broad-phase collision. Stores indices into an
 * external array (e.g. `game.enemies`) and is rebuilt every tick.
 */
export type Grid = { cell: number; cells: Map<number, number[]>; used: number[][] }

export const createGrid = (cell: number): Grid => ({ cell, cells: new Map(), used: [] })

/**
 * A cell's key, kept a small integer (15 bits per axis, wrapping every 32768 cells,
 * about a million px) so Map lookups don't box a number on every query.
 */
const key = (cx: number, cy: number) => ((cx & 0x7fff) << 15) | (cy & 0x7fff)

/** Buckets kept past a clear: the cells a long run walked through would pile up for good. */
const KEEP_CELLS = 4096

export const clearGrid = (grid: Grid) => {
  for (const bucket of grid.used) bucket.length = 0
  grid.used.length = 0
  if (grid.cells.size > KEEP_CELLS) grid.cells.clear()
}

export const insert = (grid: Grid, index: number, x: number, y: number) => {
  const k = key(Math.floor(x / grid.cell), Math.floor(y / grid.cell))
  let bucket = grid.cells.get(k)
  if (!bucket) grid.cells.set(k, (bucket = []))
  if (bucket.length === 0) grid.used.push(bucket)
  bucket.push(index)
}

/**
 * Collects indices of every bucket overlapping the square around (x, y) into `out`.
 * It's filled by index and cut to size at the end, never emptied first: `length = 0`
 * would drop its storage and every query would grow a new one.
 */
export const query = (grid: Grid, x: number, y: number, radius: number, out: number[]) => {
  let n = 0
  const minX = Math.floor((x - radius) / grid.cell)
  const maxX = Math.floor((x + radius) / grid.cell)
  const minY = Math.floor((y - radius) / grid.cell)
  const maxY = Math.floor((y + radius) / grid.cell)
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cy = minY; cy <= maxY; cy++) {
      const bucket = grid.cells.get(key(cx, cy))
      if (bucket) for (const i of bucket) out[n++] = i
    }
  }
  out.length = n
  return out
}
