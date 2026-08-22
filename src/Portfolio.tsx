import { useState } from 'react'
import { loans, portfolioCovenants, dueTicklers, fmtFull, Stage } from './data'
import { Ico } from './Icons'

const views = ['Loans', 'Covenants', 'Ticklers'] as const
type View = (typeof views)[number]

const typeColor: Record<string, string> = {
  'Owner-Occupied CRE': '#22a35a', 'Investor CRE': '#0ea5b7', 'Agricultural RE': '#84a821',
  'Business Acquisition': '#f2822c', Equipment: '#6b7280', 'Working Capital LOC': '#3b82f6', Construction: '#a855f7',
}
const stageStyle: Record<Stage, { cls: string; icon: keyof typeof Ico; label: string }> = {
  Servicing: { cls: 's-green', icon: 'check', label: 'Active' },
  Closing: { cls: 's-amber', icon: 'clock', label: 'Closing' },
  Approval: { cls: 's-amber', icon: 'clock', label: 'Approval' },
  Underwriting: { cls: 's-blue', icon: 'clock', label: 'Underwriting' },
  Application: { cls: 's-gray', icon: 'clock', label: 'Application' },
}
const covStyle: Record<string, { cls: string; icon: keyof typeof Ico; label: string }> = {
  Pass: { cls: 's-green', icon: 'check', label: 'Pass' },
  Near: { cls: 's-amber', icon: 'clock', label: 'Near' },
  Fail: { cls: 's-red', icon: 'x', label: 'Fail' },
}
const tickStyle: Record<string, { cls: string; icon: keyof typeof Ico; label: string }> = {
  Complete: { cls: 's-green', icon: 'check', label: 'Complete' },
  Requested: { cls: 's-amber', icon: 'clock', label: 'Requested' },
  Upcoming: { cls: 's-gray', icon: 'clock', label: 'Upcoming' },
  'Past Due': { cls: 's-red', icon: 'x', label: 'Past Due' },
}

const Status = ({ s }: { s: { cls: string; icon: keyof typeof Ico; label: string } }) => {
  const I = Ico[s.icon]
  return <span className={`status ${s.cls}`}><I /> {s.label}</span>
}
const H = ({ icon, children, num }: { icon: keyof typeof Ico; children: React.ReactNode; num?: boolean }) => {
  const I = Ico[icon]
  return <th className={num ? 'num' : ''}><span className="h"><I /> {children}</span></th>
}
const Check = () => <td className="check"><span /></td>
const openLoan = (id: string) => (window.location.hash = `#/loans/${id}`)

export default function Portfolio() {
  const [view, setView] = useState<View>('Loans')

  return (
    <>
      <div className="dbtag"><Ico.lock /> Private Database</div>
      <h1>Commercial Loan Portfolio</h1>
      <p className="subtitle">Loan tracking across all stages, borrowers, covenants, ticklers, and approvals</p>

      <div className="viewbar">
        <div className="tabs">
          {views.map(v => <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}
          <button className="plus"><Ico.plus /></button>
        </div>
        <span className="spacer" />
        <div className="tools">
          <button className="iconbtn"><Ico.sort /></button>
          <button className="iconbtn"><Ico.filter /></button>
          <button className="iconbtn"><Ico.group /></button>
          <button className="iconbtn"><Ico.search /></button>
          <button className="iconbtn"><Ico.sliders /></button>
          <button className="btn-dark" style={{ marginLeft: 8 }}>Add <Ico.plus /></button>
        </div>
      </div>

      <div className="grid">
        {view === 'Loans' && (
          <table>
            <thead><tr>
              <th className="check"><span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #cfd4da', borderRadius: 4, verticalAlign: 'middle' }} /></th>
              <H icon="doc">Loans</H>
              <H icon="tag">Loan Type</H>
              <H icon="building">Borrower</H>
              <H icon="status">Stage</H>
              <H icon="dollar" num>Amount</H>
              <H icon="percent">Rate</H>
              <H icon="hash" num>Term</H>
              <H icon="percent" num>LTV</H>
              <H icon="hash" num>DSCR</H>
              <H icon="cal">Maturity</H>
              <H icon="person">RM</H>
              <H icon="shield" num>Risk</H>
              <th style={{ width: 60 }}><span className="h" style={{ color: 'var(--sub)' }}><Ico.plus /> <Ico.dots /></span></th>
            </tr></thead>
            <tbody>
              {loans.map(l => (
                <tr key={l.id} className={`rowlink ${l.stage === 'Application' ? 'muted' : ''}`} onClick={() => openLoan(l.id)}>
                  <Check />
                  <td className="mono">{l.id}</td>
                  <td><span className="pill"><i style={{ background: typeColor[l.type] }} />{l.type}</span></td>
                  <td className="ellipsis">{l.borrower}</td>
                  <td><Status s={stageStyle[l.stage]} /></td>
                  <td className="num mono">{fmtFull(l.amount)}</td>
                  <td className="mono">{l.rate}</td>
                  <td className="num mono">{l.term}</td>
                  <td className="num mono">{l.ltv === null ? '—' : `${l.ltv}%`}</td>
                  <td className="num mono">{l.dscr === null ? '—' : `${l.dscr.toFixed(2)}x`}</td>
                  <td>{l.maturity}</td>
                  <td>{l.rm}</td>
                  <td className="num mono">{l.riskRating || '—'}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'Covenants' && (
          <table>
            <thead><tr>
              <th className="check"><span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #cfd4da', borderRadius: 4, verticalAlign: 'middle' }} /></th>
              <H icon="doc">Loan</H>
              <H icon="building">Borrower</H>
              <H icon="shield">Covenant</H>
              <H icon="hash">Threshold</H>
              <H icon="hash">Actual</H>
              <H icon="status">Status</H>
              <H icon="cal">Next Test</H>
              <H icon="text">Source</H>
              <th style={{ width: 60 }} />
            </tr></thead>
            <tbody>
              {portfolioCovenants.map((c, i) => (
                <tr key={i} className="rowlink" onClick={() => openLoan(c.loan)}>
                  <Check />
                  <td className="mono">{c.loan}</td>
                  <td className="ellipsis">{c.borrower}</td>
                  <td>{c.covenant}</td>
                  <td className="mono">{c.threshold}</td>
                  <td className="mono">{c.actual}</td>
                  <td><Status s={covStyle[c.status]} /></td>
                  <td>{c.nextTest}</td>
                  <td className="src">{c.source}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {view === 'Ticklers' && (
          <table>
            <thead><tr>
              <th className="check"><span style={{ display: 'inline-block', width: 15, height: 15, border: '1.5px solid #cfd4da', borderRadius: 4, verticalAlign: 'middle' }} /></th>
              <H icon="doc">Loan</H>
              <H icon="building">Borrower</H>
              <H icon="text">Requirement</H>
              <H icon="person">Responsible</H>
              <H icon="cal">Due</H>
              <H icon="status">Status</H>
              <H icon="text">Source</H>
              <th style={{ width: 60 }} />
            </tr></thead>
            <tbody>
              {dueTicklers.map((t, i) => (
                <tr key={i} className={`rowlink ${t.status === 'Complete' ? 'muted' : ''}`} onClick={() => openLoan(t.loan)}>
                  <Check />
                  <td className="mono">{t.loan}</td>
                  <td className="ellipsis">{t.borrower}</td>
                  <td>{t.item}</td>
                  <td>{t.party}</td>
                  <td>{t.due}</td>
                  <td><Status s={tickStyle[t.status]} /></td>
                  <td className="src">{t.source}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
