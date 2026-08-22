import { useRef, useState } from 'react'
import { DealSheet, FIELD_DEFS, SECTIONS, DEFAULT_POLICY, Policy, underwrite, Field } from './types'
import { API_URL, STEPS, extractMemo } from './api'
import { loans } from './data'
import { Ico } from './Icons'

type Phase = { kind: 'idle' } | { kind: 'running'; step: number; name: string } | { kind: 'done'; deal: DealSheet } | { kind: 'error'; msg: string }

const fmt = (f: Field | undefined, kind?: string) => {
  if (!f || (f.text === null && f.number === null)) return null
  if (f.text) return f.text
  const n = f.number as number
  if (kind === 'money') return `$${n.toLocaleString()}`
  if (kind === 'pct') return `${(n * 100).toFixed(1)}%`
  return n.toLocaleString()
}

export default function Screener() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const run = async (file: File | null) => {
    const name = file?.name ?? 'Lakeside_Crossing_OM.pdf (sample)'
    setPhase({ kind: 'running', step: 0, name })
    try {
      const deal = await extractMemo(file, step => setPhase({ kind: 'running', step, name }))
      setPhase({ kind: 'done', deal })
    } catch (e) {
      setPhase({ kind: 'error', msg: (e as Error).message })
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files?.[0]
    if (file) run(file)
  }

  return (
    <>
      <div className="dbtag"><Ico.doc /> CRE Screener · {API_URL ? `API: ${API_URL}` : 'Demo mode — no extraction API configured'}</div>
      <h1>Underwrite a deal from its offering memo</h1>
      <p className="subtitle">Drop an OM or opportunity memo. Unlimited-OCR reads every page, the extractor builds the deal sheet, and policy tests run instantly — every value cites its source page.</p>

      {phase.kind !== 'done' && (
        <div
          className={`drop ${drag ? 'drag' : ''} ${phase.kind === 'running' ? 'busy' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => phase.kind !== 'running' && input.current?.click()}
        >
          <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={e => e.target.files?.[0] && run(e.target.files[0])} />
          {phase.kind === 'running' ? (
            <div className="steps">
              <div className="steps-file"><Ico.doc /> {phase.name}</div>
              {STEPS.map((s, i) => (
                <div key={s} className={`step ${i < phase.step ? 'done' : i === phase.step ? 'on' : ''}`}>
                  <span className="step-dot">{i < phase.step ? <Ico.check /> : i === phase.step ? <span className="spin" /> : null}</span>{s}
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="drop-icon"><Ico.doc /></div>
              <div className="drop-title">Drop an offering memorandum here</div>
              <div className="drop-sub">PDF or scanned images · up to 600 pages · parsed one-shot by Unlimited-OCR</div>
              <div className="drop-actions">
                <button className="btn-dark" onClick={e => { e.stopPropagation(); input.current?.click() }}>Choose file <Ico.plus /></button>
                <button className="btn-light" onClick={e => { e.stopPropagation(); run(null) }}>Run sample OM</button>
              </div>
              {phase.kind === 'error' && <div className="demo-note" style={{ marginTop: 16 }}>Extraction failed: {phase.msg}</div>}
            </>
          )}
        </div>
      )}

      {phase.kind === 'done' && <Results deal={phase.deal} policy={policy} setPolicy={setPolicy} reset={() => setPhase({ kind: 'idle' })} />}
    </>
  )
}

function Results({ deal, policy, setPolicy, reset }: { deal: DealSheet; policy: Policy; setPolicy: (p: Policy) => void; reset: () => void }) {
  const metrics = underwrite(deal.fields, policy)
  const fails = metrics.filter(m => m.status === 'fail').length
  const lowConf = Object.values(deal.fields).filter(f => f.confidence < 0.9).length
  const [added, setAdded] = useState(false)

  const addToPipeline = () => {
    const g = (k: string) => deal.fields[k]
    const id = `CL-2026-${String(80 + loans.length).padStart(3, '0')}`
    const ltv = metrics[0].value, dscr = metrics[1].value
    loans.unshift({
      id, borrower: g('sponsor')?.text?.split(' (')[0] ?? 'New sponsor', type: 'Investor CRE',
      amount: g('loan_amount')?.number ?? 0, stage: 'Application', rm: 'Unassigned', riskRating: 0,
      nextAction: `Screened from ${deal.source.filename} — ${fails ? `${fails} policy flag${fails > 1 ? 's' : ''}` : 'passes policy'}`,
      rate: g('rate_request')?.text?.split(' or ')[0] ?? '—', term: g('loan_term')?.text?.replace(/-year term \/ /, ' / ').replace(/-year amortization/, '') ?? '—',
      ltv: ltv === '—' ? null : parseFloat(ltv), dscr: dscr === '—' ? null : parseFloat(dscr),
      maturity: '—', collateral: `1st DOT — ${g('property_name')?.text ?? 'property'}`,
    })
    setAdded(true)
    window.location.hash = '#/portfolio'
  }

  return (
    <>
      <div className="viewbar">
        <div className="summary">
          <span className={`status ${fails ? 's-amber' : 's-green'}`}>{fails ? <Ico.clock /> : <Ico.check />} {fails ? `${fails} policy flag${fails > 1 ? 's' : ''}` : 'Passes policy screen'}</span>
          <span className="small">{deal.source.filename} · {deal.source.pages} pages · {deal.source.ocr} · {Object.keys(deal.fields).length} fields · {lowConf} below 90% confidence</span>
        </div>
        <span className="spacer" />
        <div className="tools">
          <button className="btn-light" onClick={reset}>New memo</button>
          <button className="btn-dark" style={{ marginLeft: 8 }} onClick={addToPipeline} disabled={added}>Add to pipeline <Ico.plus /></button>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 20 }}>
        <div className="uw-head">
          <span><b>Underwriting</b> <span className="small">deterministic — recalculates as you change policy</span></span>
          <span className="policy">
            <label>Max LTV <input type="number" value={Math.round(policy.maxLtv * 100)} onChange={e => setPolicy({ ...policy, maxLtv: +e.target.value / 100 })} />%</label>
            <label>Min DSCR <input type="number" step="0.05" value={policy.minDscr} onChange={e => setPolicy({ ...policy, minDscr: +e.target.value })} />x</label>
            <label>Min debt yield <input type="number" step="0.5" value={+(policy.minDebtYield * 100).toFixed(1)} onChange={e => setPolicy({ ...policy, minDebtYield: +e.target.value / 100 })} />%</label>
            <label>Rate <input type="number" step="0.125" value={+(policy.rate * 100).toFixed(3)} onChange={e => setPolicy({ ...policy, rate: +e.target.value / 100 })} />%</label>
            <label>Amort <input type="number" value={policy.amortYears} onChange={e => setPolicy({ ...policy, amortYears: +e.target.value })} />yr</label>
          </span>
        </div>
        <div className="metrics">
          {metrics.map(m => (
            <div key={m.label} className={`metric ${m.status}`}>
              <div className="m-label">{m.label}</div>
              <div className="m-value">{m.value}</div>
              {m.test && <div className="m-test">{m.status === 'pass' ? '✓ ' : m.status === 'fail' ? '✕ ' : ''}{m.test}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid">
        <table>
          <thead><tr>
            <th style={{ width: 280 }}><span className="h"><Ico.text /> Field</span></th>
            <th><span className="h"><Ico.tag /> Extracted value</span></th>
            <th className="num" style={{ width: 120 }}><span className="h"><Ico.percent /> Confidence</span></th>
            <th className="num" style={{ width: 110 }}><span className="h"><Ico.doc /> Page</span></th>
          </tr></thead>
          <tbody>
            {SECTIONS.map(sec => (
              <SectionRows key={sec} title={sec} defs={FIELD_DEFS.filter(d => d.section === sec)} fields={deal.fields} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const SectionRows = ({ title, defs, fields }: { title: string; defs: typeof FIELD_DEFS; fields: Record<string, Field> }) => (
  <>
    <tr className="section"><td colSpan={4}>{title}</td></tr>
    {defs.map(d => {
      const f = fields[d.key]
      const v = fmt(f, d.fmt)
      const conf = f?.confidence ?? 0
      return (
        <tr key={d.key} className={v === null ? 'muted' : ''}>
          <td className="small" style={{ color: 'var(--sub)' }}>{d.label}</td>
          <td>{v ?? <span className="status s-red"><Ico.x /> Not found</span>}</td>
          <td className="num mono">{v === null ? '—' : <span className={`status ${conf >= 0.9 ? 's-green' : conf >= 0.75 ? 's-amber' : 's-red'}`}>{Math.round(conf * 100)}%</span>}</td>
          <td className="num mono src">{f?.page ? `p. ${f.page}` : '—'}</td>
        </tr>
      )
    })}
  </>
)
