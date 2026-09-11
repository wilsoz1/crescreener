// Shared UI for the model-gateway features: ask-the-portfolio, drafted memos, tiny markdown view.
import { useState } from 'react'
import { API_URL, aiAsk, aiDraft } from './api'
import { Ico } from './Icons'

/** Minimal markdown: ## headings, - bullets, **bold**; everything else is a paragraph. */
export const Md = ({ text }: { text: string }) => (
  <div className="md">
    {text.split('\n').map((line, i) => {
      const bold = (s: string) =>
        s.split(/\*\*(.+?)\*\*/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))
      if (line.startsWith('## ')) return <h3 key={i}>{line.slice(3)}</h3>
      if (line.startsWith('# ')) return <h3 key={i}>{line.slice(2)}</h3>
      if (/^\s*[-*] /.test(line)) return <li key={i}>{bold(line.replace(/^\s*[-*] /, ''))}</li>
      if (!line.trim()) return null
      return <p key={i}>{bold(line)}</p>
    })}
  </div>
)

export function AskBar() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ answer: string; rows: Record<string, unknown>[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!API_URL) return null

  const ask = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null); setResult(null)
    const out = await aiAsk(q)
    setBusy(false)
    if (!out) { setErr('The model box is not reachable right now — power it on and try again.'); return }
    setResult(out)
  }

  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <form className="askbar" onSubmit={ask}>
        <Ico.search />
        <input
          value={q} onChange={e => setQ(e.target.value)} required
          aria-label="Ask your portfolio"
          placeholder='Ask your portfolio — e.g. "which loans are interest-only?" or "covenants failing right now"'
        />
        <button className="btn-dark" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {err && <div className="demo-note" style={{ margin: 12 }}>{err}</div>}
      {result && (
        <div style={{ padding: '4px 14px 14px' }}>
          <p style={{ margin: '8px 0 10px' }}>{result.answer}</p>
          {result.rows.length > 0 && (
            <div className="grid" style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>{Object.keys(result.rows[0]).map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}</tr></thead>
                <tbody>
                  {result.rows.slice(0, 10).map((r, i) => (
                    <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="small">{v == null ? '—' : v === 'Servicing' ? 'Active' : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DraftButton({ kind, loanId, dealId, label, onSave }: {
  kind: 'annual_review' | 'brief' | 'credit_memo'; loanId?: string; dealId?: string; label: string
  onSave?: (markdown: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  if (!API_URL) return null

  const run = async () => {
    setBusy(true); setSaved(false)
    const out = await aiDraft(kind, loanId, dealId)
    setBusy(false)
    setText(out?.markdown ?? 'The model box is not reachable right now — power it on and try again.')
  }

  return (
    <>
      <button className="btn-light" onClick={run} disabled={busy}><Ico.text /> {busy ? 'Drafting…' : label}</button>
      {text !== null && (
        <div className="draft-overlay" onClick={() => setText(null)}>
          <div className="draft-panel" onClick={e => e.stopPropagation()}>
            <div className="uw-head">
              <span><b>{label}</b> <span className="small">drafted by your models — review before relying on it</span></span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <button className="btn-light" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
                {onSave && <button className="btn-light" disabled={saved} onClick={async () => { await onSave(text); setSaved(true) }}>{saved ? 'Saved to notes ✓' : 'Save to notes'}</button>}
                <button className="btn-dark" onClick={() => setText(null)}>Close</button>
              </span>
            </div>
            <div style={{ padding: '4px 18px 18px', overflowY: 'auto' }}><Md text={text} /></div>
          </div>
        </div>
      )}
    </>
  )
}
