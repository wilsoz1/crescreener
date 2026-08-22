import { DealSheet } from './types'
import { SAMPLE_DEAL } from './sample'

// Extraction API base URL: ?api=https://host → persisted to localStorage → VITE_API_URL → none (demo mode).
const fromQuery = new URLSearchParams(window.location.search).get('api')
if (fromQuery) localStorage.setItem('crescreener.api', fromQuery.replace(/\/$/, ''))
export const API_URL: string | null =
  localStorage.getItem('crescreener.api') || (import.meta.env.VITE_API_URL as string | undefined) || null

export const STEPS = ['Rendering pages', 'OCR — Unlimited-OCR', 'Extracting deal fields', 'Underwriting']

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Runs the pipeline; `onStep` is called as each stage begins (0-based). */
export async function extractMemo(file: File | null, onStep: (i: number) => void): Promise<DealSheet> {
  if (!API_URL || !file) {
    // Demo mode — replay the bundled sample OM with realistic pacing.
    for (let i = 0; i < STEPS.length; i++) { onStep(i); await wait(i === 1 ? 1800 : 900) }
    return { ...SAMPLE_DEAL, source: { ...SAMPLE_DEAL.source, filename: file?.name ?? SAMPLE_DEAL.source.filename } }
  }
  onStep(0)
  const body = new FormData()
  body.append('file', file)
  const ticker = setTimeout(() => onStep(1), 1500)
  const ticker2 = setTimeout(() => onStep(2), 15000)
  try {
    const res = await fetch(`${API_URL}/api/extract`, { method: 'POST', body })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    onStep(3)
    return (await res.json()) as DealSheet
  } finally {
    clearTimeout(ticker); clearTimeout(ticker2)
  }
}
