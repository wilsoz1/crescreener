import { useState } from 'react'
import { detail, loans, fmtFull, fmtMoney } from './data'

const tabs = ['Overview', 'Documents', 'Spreads & Ratios', 'Covenants', 'Ticklers', 'Approvals', 'Closing'] as const
type Tab = (typeof tabs)[number]

const docBadge: Record<string, string> = {
  Verified: 's-green', 'Needs Review': 's-amber', Missing: 's-red', Incomplete: 's-amber',
}
const covBadge: Record<string, string> = { Pass: 's-green', Near: 's-amber', Fail: 's-red' }
const tickBadge: Record<string, string> = {
  Complete: 's-green', Requested: 's-amber', 'Past Due': 's-red', Upcoming: 's-gray',
}
const closeBadge: Record<string, string> = {
  Satisfied: 's-green', Received: 's-green', Ordered: 's-amber', Outstanding: 's-red', Waived: 's-gray',
}

export default function LoanDetail({ id }: { id?: string }) {
  const [tab, setTab] = useState<Tab>('Overview')
  const summary = loans.find(l => l.id === id)

  if (!summary) return <><h1>Loan not found</h1><p className="subtitle"><a href="#/">Back to portfolio</a></p></>

  if (summary.id !== detail.id) {
    return (
      <>
        <div className="dbtag">{summary.id} · {summary.type}</div><h1>{summary.borrower}</h1>
        <p className="subtitle">{summary.type} · {fmtMoney(summary.amount)} · {summary.stage}</p>
        <div className="demo-note">
          This prototype carries full lifecycle data for <a href={`#/loans/${detail.id}`}>CL-2026-041 · Harbor Point Logistics</a> only.
          Current status for this loan: {summary.nextAction}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="dbtag">{detail.id} · Owner-Occupied CRE</div><h1>{detail.borrower}</h1>
      <p className="subtitle">{detail.entity} · {detail.naics} · Servicing since Mar 2026</p>

      <div className="detail-tabs">
        {tabs.map(t => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'Overview' && <Overview />}
      {tab === 'Documents' && <Documents />}
      {tab === 'Spreads & Ratios' && <Spreads />}
      {tab === 'Covenants' && <Covenants />}
      {tab === 'Ticklers' && <Ticklers />}
      {tab === 'Approvals' && <Approvals />}
      {tab === 'Closing' && <Closing />}
    </>
  )
}

const Overview = () => (
  <div className="two-col">
    <div className="card">
      <h2>Approved structure <small>system of record — structured data, not narrative</small></h2>
      <table className="kv"><tbody>
        {detail.terms.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
      </tbody></table>
    </div>
    <div className="card">
      <h2>Guarantors</h2>
      <table>
        <thead><tr><th>Name</th><th>Ownership</th><th>Guarantee</th><th className="num">Net worth</th><th className="num">Liquidity</th></tr></thead>
        <tbody>
          {detail.guarantors.map(g => (
            <tr key={g.name}>
              <td><b>{g.name}</b></td><td>{g.ownership}</td><td>{g.guarantee}</td>
              <td className="num">{fmtFull(g.netWorth)}</td><td className="num">{fmtFull(g.liquidity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const Documents = () => (
  <div className="card">
    <h2>Document intelligence <small>classified & extracted by AI · every field keeps its source page · low confidence routes to a human</small></h2>
    <table>
      <thead><tr><th>File</th><th>Classification</th><th>Period</th><th>Status</th><th className="num">Confidence</th><th>Pages</th><th>Notes</th></tr></thead>
      <tbody>
        {detail.docs.map(d => (
          <tr key={d.name}>
            <td className="mono small">{d.name}</td>
            <td>{d.classification}</td>
            <td>{d.period}</td>
            <td><span className={`status ${docBadge[d.status]}`}>{d.status}</span></td>
            <td className="num mono">{d.confidence === null ? '—' : `${Math.round(d.confidence * 100)}%`}</td>
            <td className="mono small">{d.pages}</td>
            <td className="small">{d.flags.join(' · ') || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Spreads = () => (
  <>
    <div className="card">
      <h2>Financial spread <small>auto-extracted from 1065s and interims · analyst-approved Feb 2026</small></h2>
      <table>
        <thead><tr><th>Line item</th>{detail.spreadYears.map(y => <th key={y} className="num">{y}</th>)}</tr></thead>
        <tbody>
          {detail.spread.map(r => (
            <tr key={r.label}>
              <td className={r.bold ? 'bold' : ''}>{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className={`num mono ${r.bold ? 'bold' : ''}`}>{v === null ? '—' : fmtFull(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <div className="card">
      <h2>Underwriting ratios <small>deterministic calculation engine — separate from generative summaries</small></h2>
      <table>
        <thead><tr><th>Ratio</th>{detail.spreadYears.map(y => <th key={y} className="num">{y}</th>)}<th className="num">Policy</th></tr></thead>
        <tbody>
          {detail.ratios.map(r => (
            <tr key={r.name}>
              <td><b>{r.name}</b></td>
              {r.values.map((v, i) => <td key={i} className="num mono">{v}</td>)}
              <td className="num mono src">{r.target}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>
)

const Covenants = () => (
  <div className="card">
    <h2>Covenant compliance <small>extracted from executed loan documents · each covenant cites its source clause</small></h2>
    <table>
      <thead><tr><th>Covenant</th><th>Requirement</th><th>Actual</th><th>Status</th><th>Last / next test</th><th>Source</th></tr></thead>
      <tbody>
        {detail.covenants.map(c => (
          <tr key={c.name}>
            <td><b>{c.name}</b></td>
            <td className="small">{c.requirement}</td>
            <td className="mono">{c.actual}</td>
            <td><span className={`status ${covBadge[c.status]}`}>{c.status === 'Near' ? 'Near violation' : c.status}</span></td>
            <td className="small">{c.tested}</td>
            <td className="src">{c.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Ticklers = () => (
  <div className="card">
    <h2>Ticklers & reporting obligations <small>auto-created from loan documents at boarding — zero manual setup</small></h2>
    <table>
      <thead><tr><th>Requirement</th><th>Responsible</th><th>Frequency</th><th>Due</th><th>Status</th><th>Source</th></tr></thead>
      <tbody>
        {detail.ticklers.map(t => (
          <tr key={t.requirement}>
            <td><b>{t.requirement}</b></td>
            <td>{t.party}</td>
            <td className="small">{t.frequency}</td>
            <td className="mono">{t.due}</td>
            <td><span className={`status ${tickBadge[t.status]}`}>{t.status}</span></td>
            <td className="src">{t.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Approvals = () => (
  <div className="card">
    <h2>Approval & funding history <small>every decision human-made, every step logged</small></h2>
    <div className="tl">
      {detail.approvals.map(a => (
        <div className="tl-item" key={a.step}>
          <div className="tl-rail"><div className="tl-dot" /><div className="tl-line" /></div>
          <div className="tl-body">
            <b>{a.step}</b> — <span className="status s-green">{a.outcome}</span>
            <div className="tl-meta">{a.actor} · {a.date}</div>
            {a.notes && <div className="small">{a.notes}</div>}
          </div>
        </div>
      ))}
    </div>
  </div>
)

const Closing = () => (
  <div className="card">
    <h2>Closing checklist <small>generated automatically from approval conditions</small></h2>
    <table>
      <thead><tr><th>Category</th><th>Item</th><th>Responsible</th><th>Status</th><th>Evidence</th></tr></thead>
      <tbody>
        {detail.closing.map(c => (
          <tr key={c.item}>
            <td className="small">{c.category}</td>
            <td><b>{c.item}</b></td>
            <td>{c.responsible}</td>
            <td><span className={`status ${closeBadge[c.status]}`}>{c.status}</span></td>
            <td className="src">{c.evidence ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
