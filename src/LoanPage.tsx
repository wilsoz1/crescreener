import { useEffect, useState } from 'react'
import { supabase, DbLoan, Doc, Org, ShareLink, Attempt, Payment, DbCovenant, DbTickler, Guarantor, Note, Spread, SPREAD_LINES, money, daysLate, spreadFromDocument } from './supabase'
import { fmtDate } from './Loans'
import { classifyType } from './Documents'
import { Ico } from './Icons'

const shareUrl = (token: string) => `${window.location.origin}/#/share/${token}`
const covCls = { Pass: 's-green', Near: 's-amber', Fail: 's-red' } as const
const TABS = ['Overview', 'Payments', 'Spreads', 'Compliance', 'Structure', 'Documents', 'Activity'] as const
type Tab = (typeof TABS)[number]

const payStatus = (p: Payment) => {
  if (p.status === 'paid') {
    const late = p.paid_date && p.paid_date > p.due_date
    return <span className={`status ${late ? 's-amber' : 's-green'}`}><Ico.check /> {late ? `Paid late (${fmtDate(p.paid_date)})` : 'Paid on time'}</span>
  }
  const d = daysLate(p.due_date)
  if (d <= 0) return <span className="status s-gray">Upcoming</span>
  return <span className="status s-red"><Ico.x /> {d} days past due</span>
}
const tickStatus = (t: DbTickler) => {
  if (t.status === 'complete') return <span className="status s-green"><Ico.check /> Complete</span>
  if (t.status === 'waived') return <span className="status s-gray">Waived</span>
  if (daysLate(t.due_date) > 0) return <span className="status s-red"><Ico.x /> Past due {daysLate(t.due_date)}d</span>
  return <span className={`status ${t.status === 'requested' ? 's-amber' : 's-gray'}`}>{t.status === 'requested' ? 'Requested' : 'Upcoming'}</span>
}

export default function LoanPage({ org, loanId }: { org: Org; loanId: string }) {
  const [loan, setLoan] = useState<DbLoan | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [outreach, setOutreach] = useState<Attempt[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [covenants, setCovenants] = useState<DbCovenant[]>([])
  const [ticklers, setTicklers] = useState<DbTickler[]>([])
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('Overview')

  const load = async () => {
    const { data: l } = await supabase.from('loans').select('*, customers(name, company, email, phone)').eq('id', loanId).single()
    setLoan((l as DbLoan) ?? null)
    if (l?.customer_id) {
      supabase.from('financial_spreads').select('*').eq('customer_id', l.customer_id).order('period')
        .then(({ data }) => setSpreads((data as Spread[]) ?? []))
    }
    const [d, s, pay, cov, tick, g, n, o] = await Promise.all([
      supabase.from('documents').select('*, loans(loan_number), customers(company)').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('share_links').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('loan_payments').select('*').eq('loan_id', loanId).order('due_date', { ascending: false }),
      supabase.from('covenants').select('*').eq('loan_id', loanId).order('created_at'),
      supabase.from('ticklers').select('*').eq('loan_id', loanId).order('due_date'),
      supabase.from('guarantors').select('*').eq('loan_id', loanId),
      supabase.from('loan_notes').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      l?.customer_id
        ? supabase.from('outreach_attempts').select('*, customers(name, company)').eq('customer_id', l.customer_id).order('created_at', { ascending: false }).limit(25)
        : Promise.resolve({ data: [] }),
    ])
    setDocs((d.data as Doc[]) ?? []); setLinks((s.data as ShareLink[]) ?? [])
    setPayments((pay.data as Payment[]) ?? []); setCovenants((cov.data as DbCovenant[]) ?? [])
    setTicklers((tick.data as DbTickler[]) ?? []); setGuarantors((g.data as Guarantor[]) ?? [])
    setNotes((n.data as Note[]) ?? []); setOutreach(((o as { data: Attempt[] | null }).data as Attempt[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [loanId])

  if (loading) return <p className="subtitle">Loading loan…</p>
  if (!loan) return <><h1>Loan not found</h1><p className="subtitle"><a href="#/app/loans">Back to all loans</a></p></>

  // Issue rollup — drives the header strip, the badges, and the Overview triage list.
  const overdue = payments.filter(p => p.status !== 'paid' && daysLate(p.due_date) > 0)
  const covFails = covenants.filter(c => c.status === 'Fail')
  const covNear = covenants.filter(c => c.status === 'Near')
  const tickPastDue = ticklers.filter(t => (t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0)
  const stalePfs = guarantors.filter(g => g.pfs_date && daysLate(g.pfs_date) > 365)
  const docsReview = docs.filter(d => d.status === 'needs_review')
  const healthy = !overdue.length && !covFails.length && !tickPastDue.length

  const draftSpreads = spreads.filter(s => s.status === 'draft')
  const badges: Partial<Record<Tab, { n: number; cls: string }>> = {
    Payments: overdue.length ? { n: overdue.length, cls: 'red' } : undefined,
    Spreads: draftSpreads.length ? { n: draftSpreads.length, cls: 'amber' } : undefined,
    Compliance: covFails.length + tickPastDue.length ? { n: covFails.length + tickPastDue.length, cls: covFails.length ? 'red' : 'amber' } : undefined,
    Documents: docsReview.length ? { n: docsReview.length, cls: 'amber' } : undefined,
  }

  return (
    <>
      <div className="crumb-row"><a href="#/app/loans">← All loans</a></div>

      {/* Level 0: identity + health + actions */}
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{loan.loan_number}</h1>
          <p className="subtitle" style={{ marginBottom: 10 }}>{loan.customers?.company} · {loan.type} · {loan.stage === 'Servicing' ? 'Active' : loan.stage}</p>
          <div className="stat-row">
            <span><b>{loan.current_balance === null ? money(loan.amount) : money(loan.current_balance)}</b><i>{loan.current_balance === null ? 'commitment' : `balance of ${money(loan.amount)}`}</i></span>
            <span><b>{loan.next_payment_amount ? money(loan.next_payment_amount) : '—'}</b><i>{loan.next_payment_date ? `next pmt · ${fmtDate(loan.next_payment_date)}` : 'next payment'}</i></span>
            <span><b>{loan.rate ?? '—'}</b><i>rate{loan.rate_floor ? ` · floor ${loan.rate_floor}` : ''}</i></span>
            <span><b>{fmtDate(loan.maturity)}</b><i>maturity</i></span>
          </div>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-light" onClick={() => setTab('Activity')}>Add note</button>
          <ShareControls org={org} loanId={loanId} docs={docs} onChange={load} />
        </div>
      </div>

      {healthy ? (
        <div className="alert-strip ok"><span className="status s-green"><Ico.check /> Current · in compliance</span>{covNear.length > 0 && <span className="status s-amber"><Ico.clock /> {covNear.length} covenant near threshold</span>}</div>
      ) : (
        <div className="alert-strip">
          {overdue.length > 0 && <span className="status s-red"><Ico.x /> {overdue.length} payment{overdue.length > 1 ? 's' : ''} past due — {money(overdue.reduce((s, p) => s + Number(p.amount), 0))} ({Math.max(...overdue.map(p => daysLate(p.due_date)))} days)</span>}
          {covFails.length > 0 && <span className="status s-red"><Ico.x /> {covFails.length} covenant failure{covFails.length > 1 ? 's' : ''}</span>}
          {tickPastDue.length > 0 && <span className="status s-amber"><Ico.clock /> {tickPastDue.length} reporting item{tickPastDue.length > 1 ? 's' : ''} past due</span>}
        </div>
      )}

      <div className="detail-tabs" style={{ marginTop: 16 }}>
        {TABS.map(t => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{badges[t] && <span className={`tab-badge ${badges[t]!.cls}`}>{badges[t]!.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <Overview {...{ overdue, covFails, covNear, tickPastDue, stalePfs, docsReview, notes, outreach, payments, setTab }} />}
      {tab === 'Payments' && <PaymentsTab loan={loan} payments={payments} />}
      {tab === 'Spreads' && <SpreadsTab loan={loan} spreads={spreads} onChange={load} />}
      {tab === 'Compliance' && <ComplianceTab covenants={covenants} ticklers={ticklers} />}
      {tab === 'Structure' && <StructureTab loan={loan} guarantors={guarantors} />}
      {tab === 'Documents' && <DocumentsTab org={org} loan={loan} docs={docs} links={links} onChange={load} />}
      {tab === 'Activity' && <ActivityTab org={org} loan={loan} notes={notes} outreach={outreach} onChange={load} />}
    </>
  )
}

const Card = ({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="grid" style={{ marginBottom: 20 }}>
    <div className="uw-head"><span><b>{title}</b> {sub && <span className="small">{sub}</span>}</span>{right}</div>
    {children}
  </div>
)

// ——— Overview: triage list + recent activity, nothing else ———
function Overview({ overdue, covFails, covNear, tickPastDue, stalePfs, docsReview, notes, outreach, payments, setTab }: {
  overdue: Payment[]; covFails: DbCovenant[]; covNear: DbCovenant[]; tickPastDue: DbTickler[]
  stalePfs: Guarantor[]; docsReview: Doc[]; notes: Note[]; outreach: Attempt[]; payments: Payment[]; setTab: (t: Tab) => void
}) {
  const items: { sev: 'red' | 'amber'; text: string; tab: Tab }[] = [
    ...overdue.map(p => ({ sev: 'red' as const, text: `Payment of ${money(Number(p.amount))} due ${fmtDate(p.due_date)} is ${daysLate(p.due_date)} days past due`, tab: 'Payments' as Tab })),
    ...covFails.map(c => ({ sev: 'red' as const, text: `Covenant failing: ${c.name} — ${c.actual ?? ''} vs. ${c.requirement}`, tab: 'Compliance' as Tab })),
    ...covNear.map(c => ({ sev: 'amber' as const, text: `Covenant near threshold: ${c.name} — ${c.actual ?? ''} vs. ${c.requirement}`, tab: 'Compliance' as Tab })),
    ...tickPastDue.map(t => ({ sev: 'amber' as const, text: `${t.requirement} past due ${daysLate(t.due_date)} days (${t.responsible})`, tab: 'Compliance' as Tab })),
    ...stalePfs.map(g => ({ sev: 'amber' as const, text: `${g.name}'s personal financial statement is over a year old (${fmtDate(g.pfs_date)})`, tab: 'Structure' as Tab })),
    ...docsReview.map(d => ({ sev: 'amber' as const, text: `Document needs review: ${d.filename}`, tab: 'Documents' as Tab })),
  ]

  type Ev = { at: string; text: string; chip: string }
  const events: Ev[] = [
    ...notes.map(n => ({ at: n.created_at, text: `${n.author}: ${n.body}`, chip: 'note' })),
    ...outreach.map(a => ({ at: a.created_at, text: `${a.rule_id ? 'Auto ' : ''}${a.channel} to ${a.recipient} — ${a.subject ?? a.body}`, chip: a.rule_id ? 'auto' : a.channel })),
    ...payments.filter(p => p.status === 'paid' && p.paid_date).map(p => ({ at: p.paid_date! + 'T12:00:00', text: `Payment of ${money(Number(p.amount))} received${p.paid_date! > p.due_date ? ' (late)' : ''}`, chip: 'payment' })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 6)

  return (
    <div className="two-col">
      <Card title="Needs attention" sub={items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : undefined}>
        {items.length ? items.map((it, i) => (
          <div className="alert" key={i}>
            <span className={`dot2 ${it.sev}`} />
            <span style={{ flex: 1 }}>{it.text}</span>
            <button className="linkish" onClick={() => setTab(it.tab)}>{it.tab} →</button>
          </div>
        )) : <p className="small" style={{ padding: 14 }}>Nothing needs attention. Payments current, covenants in compliance, reporting up to date.</p>}
      </Card>
      <Card title="Recent activity" sub="notes, outreach, payments">
        {events.length ? events.map((e, i) => (
          <div className="alert" key={i}>
            <span className="pill">{e.chip}</span>
            <span style={{ flex: 1 }} className="small">{e.text}</span>
            <span className="small mono">{new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        )) : <p className="small" style={{ padding: 14 }}>No activity yet.</p>}
      </Card>
    </div>
  )
}

// ——— Payments: balances + history (paid history collapsed) ———
function PaymentsTab({ loan, payments }: { loan: DbLoan; payments: Payment[] }) {
  const [showAll, setShowAll] = useState(false)
  const unpaid = payments.filter(p => p.status !== 'paid')
  const paid = payments.filter(p => p.status === 'paid')
  const shown = showAll ? payments : [...unpaid, ...paid.slice(0, 3)].sort((a, b) => (a.due_date < b.due_date ? 1 : -1))

  return (
    <div className="two-col">
      <Card title="Balances">
        <table className="kv"><tbody>
          <tr><td>Current balance</td><td className="mono">{loan.current_balance === null ? '—' : money(loan.current_balance)} <span className="small">of {money(loan.amount)} commitment</span></td></tr>
          <tr><td>Next payment</td><td className="mono">{loan.next_payment_amount ? `${money(loan.next_payment_amount)} on ${fmtDate(loan.next_payment_date)}` : '—'}</td></tr>
          {loan.budget_total !== null && <>
            <tr><td>Construction budget</td><td className="mono">{money(loan.budget_total)}</td></tr>
            <tr><td>Draws to date</td><td>
              <span className="mono">{money(loan.draws_to_date ?? 0)} ({Math.round(((loan.draws_to_date ?? 0) / loan.budget_total) * 100)}%)</span>
              <div className="bar big" style={{ maxWidth: 220 }}><span style={{ width: `${Math.min(((loan.draws_to_date ?? 0) / loan.budget_total) * 100, 100)}%` }} /></div>
            </td></tr>
            <tr><td>Interest reserve remaining</td><td className="mono">{money(loan.interest_reserve_remaining ?? 0)}</td></tr>
          </>}
        </tbody></table>
      </Card>
      <Card title="Payment history" sub="drives the delinquency rules"
        right={paid.length > 3 && <button className="linkish" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show recent' : `Show all ${payments.length}`}</button>}>
        <table>
          <thead><tr><th>Due</th><th className="num">Amount</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map(p => (
              <tr key={p.id}><td>{fmtDate(p.due_date)}</td><td className="num mono">{money(p.amount)}</td><td>{payStatus(p)}</td></tr>
            ))}
            {!payments.length && <tr><td colSpan={3} className="small">No payment schedule yet{loan.stage !== 'Servicing' ? ` — loan is in ${loan.stage}.` : '.'}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Spreads: borrower financials, one column per period, populated from uploaded statements ———
function SpreadsTab({ loan, spreads, onChange }: { loan: DbLoan; spreads: Spread[]; onChange: () => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const startEdit = (s: Spread) => {
    setEditing(s.id)
    setDraft(Object.fromEntries(SPREAD_LINES.map(([k]) => [k, s.data[k] == null ? '' : String(s.data[k])])))
  }
  const save = async (s: Spread, markReviewed: boolean) => {
    const data = Object.fromEntries(SPREAD_LINES.map(([k]) => [k, draft[k] === '' ? null : +draft[k]]))
    await supabase.from('financial_spreads').update({ data, ...(markReviewed ? { status: 'reviewed' } : {}) }).eq('id', s.id)
    setEditing(null)
    onChange()
  }
  const remove = async (s: Spread) => { await supabase.from('financial_spreads').delete().eq('id', s.id); onChange() }

  const annualDS = loan.next_payment_amount ? loan.next_payment_amount * 12 : null
  const num = (s: Spread, k: string) => (editing === s.id ? (draft[k] === '' ? null : +draft[k]) : s.data[k] ?? null)
  const ratio = (label: string, fn: (s: Spread) => string) => (
    <tr key={label} className="ratio-row"><td>{label}</td>{spreads.map(s => <td key={s.id} className="num mono">{fn(s)}</td>)}<td /></tr>
  )
  const fmt = (v: number | null) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`)

  if (!spreads.length) return (
    <Card title="Financial spreads">
      <p className="small" style={{ padding: 14 }}>
        No spreads yet for this borrower. Upload a <b>tax return</b> or <b>financial statement</b> on the Documents tab — a draft spread
        column is created automatically for each statement, ready for analyst input.
      </p>
    </Card>
  )

  return (
    <Card title="Financial spreads" sub="one column per statement — drafts are created automatically when tax returns or financials are uploaded">
      <table>
        <thead>
          <tr>
            <th style={{ width: 200 }}>Line item</th>
            {spreads.map(s => (
              <th key={s.id} className="num">
                <div>{s.period}</div>
                <div className="small" style={{ fontWeight: 400 }}>{s.statement_type}</div>
                <span className={`status ${s.status === 'reviewed' ? 's-green' : 's-amber'}`} style={{ marginTop: 4 }}>{s.status === 'reviewed' ? 'Reviewed' : 'Draft'}</span>
              </th>
            ))}
            <th style={{ width: 170 }} />
          </tr>
        </thead>
        <tbody>
          {SPREAD_LINES.map(([k, label]) => (
            <tr key={k}>
              <td className={k === 'ebitda' || k === 'net_income' ? 'bold' : ''}>{label}</td>
              {spreads.map(s => (
                <td key={s.id} className="num mono">
                  {editing === s.id
                    ? <input className="cell-input" type="number" value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} />
                    : fmt(s.data[k] ?? null)}
                </td>
              ))}
              <td />
            </tr>
          ))}
          {ratio('EBITDA margin', s => { const e = num(s, 'ebitda'), r = num(s, 'revenue'); return e != null && r ? `${((e / r) * 100).toFixed(1)}%` : '—' })}
          {ratio('Debt / EBITDA', s => { const e = num(s, 'ebitda'), d = num(s, 'total_debt'); return e && d != null ? `${(d / e).toFixed(1)}x` : '—' })}
          {ratio('Debt / TNW', s => { const t = num(s, 'tangible_net_worth'), d = num(s, 'total_debt'); return t && d != null ? `${(d / t).toFixed(1)}x` : '—' })}
          {ratio(`DSCR (this loan${annualDS ? `, ${money(annualDS)}/yr DS` : ''})`, s => { const e = num(s, 'ebitda'); return e != null && annualDS ? `${(e / annualDS).toFixed(2)}x` : '—' })}
          <tr>
            <td />
            {spreads.map(s => (
              <td key={s.id} className="num">
                {editing === s.id ? (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="btn-light" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-light" onClick={() => save(s, false)}>Save</button>
                    <button className="btn-dark" onClick={() => save(s, true)}>Save & review</button>
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="btn-light" onClick={() => startEdit(s)}>Edit</button>
                    <button className="btn-light" onClick={() => remove(s)}>Delete</button>
                  </span>
                )}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </Card>
  )
}

// ——— Compliance: covenants + ticklers ———
const ComplianceTab = ({ covenants, ticklers }: { covenants: DbCovenant[]; ticklers: DbTickler[] }) => (
  <>
    <Card title="Covenants" sub={`${covenants.length} tracked`}>
      <table>
        <thead><tr><th>Covenant</th><th>Requirement</th><th>Actual</th><th>Status</th><th>Next test</th></tr></thead>
        <tbody>
          {covenants.map(c => (
            <tr key={c.id}>
              <td><b>{c.name}</b><div className="src">{c.source}</div></td>
              <td className="small">{c.requirement}</td>
              <td className="small mono">{c.actual ?? '—'}</td>
              <td><span className={`status ${covCls[c.status]}`}>{c.status === 'Near' ? 'Near violation' : c.status}</span></td>
              <td className="small">{fmtDate(c.next_test)}</td>
            </tr>
          ))}
          {!covenants.length && <tr><td colSpan={5} className="small">No covenants recorded.</td></tr>}
        </tbody>
      </table>
    </Card>
    <Card title="Ticklers & reporting" sub="what the loan agreement requires, and when">
      <table>
        <thead><tr><th>Requirement</th><th>Responsible</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          {ticklers.map(t => (
            <tr key={t.id}>
              <td><b>{t.requirement}</b><div className="src">{t.source}</div></td>
              <td className="small">{t.responsible}</td>
              <td>{fmtDate(t.due_date)}</td>
              <td>{tickStatus(t)}</td>
            </tr>
          ))}
          {!ticklers.length && <tr><td colSpan={4} className="small">No ticklers yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  </>
)

// ——— Structure: full terms (top rows first) + guarantors ———
function StructureTab({ loan, guarantors }: { loan: DbLoan; guarantors: Guarantor[] }) {
  const [all, setAll] = useState(false)
  const rows: [string, string][] = [
    ['Borrower', loan.customers?.company ?? '—'],
    ['Contact', `${loan.customers?.name ?? '—'} · ${loan.customers?.email ?? 'no email'} · ${loan.customers?.phone ?? 'no phone'}`],
    ['Payment structure', loan.payment_type],
    ['Rate', `${loan.rate ?? '—'}${loan.rate_floor ? ` · floor ${loan.rate_floor}` : ''}`],
    ['Term / amortization', loan.term ?? '—'],
    ['Collateral', loan.collateral ?? '—'],
    ['Rate reset', fmtDate(loan.rate_reset_date)],
    ['I/O period ends', fmtDate(loan.io_end_date)],
    ['Origination → maturity', `${fmtDate(loan.origination_date)} → ${fmtDate(loan.maturity)}`],
    ['Draw period ends', fmtDate(loan.draw_period_end)],
    ['LTV / DSCR', `${loan.ltv === null ? '—' : Math.round(loan.ltv * 100) + '%'} / ${loan.dscr === null ? '—' : Number(loan.dscr).toFixed(2) + 'x'}`],
    ['Relationship manager', loan.rm ?? '—'],
  ]
  return (
    <div className="two-col">
      <Card title="Terms" right={<button className="linkish" onClick={() => setAll(a => !a)}>{all ? 'Key terms' : 'All terms'}</button>}>
        <table className="kv"><tbody>
          {(all ? rows : rows.slice(0, 6)).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>
      </Card>
      <Card title="Guarantors">
        <table>
          <thead><tr><th>Name</th><th className="num">Guarantee</th><th>Latest PFS</th><th className="num">Net worth</th><th className="num">Liquidity</th></tr></thead>
          <tbody>
            {guarantors.map(g => (
              <tr key={g.id}>
                <td><b>{g.name}</b></td>
                <td className="num">{g.guarantee_pct ? `${g.guarantee_pct}%` : ''} {g.guarantee_type}</td>
                <td>{fmtDate(g.pfs_date)}{g.pfs_date && daysLate(g.pfs_date) > 365 && <span className="status s-amber" style={{ marginLeft: 6 }}>Stale</span>}</td>
                <td className="num mono">{g.net_worth ? money(g.net_worth) : '—'}</td>
                <td className="num mono">{g.liquidity ? money(g.liquidity) : '—'}</td>
              </tr>
            ))}
            {!guarantors.length && <tr><td colSpan={5} className="small">No guarantors recorded.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Documents: per-loan upload + files + share links ———
const DocumentsTab = ({ org, loan, docs, links, onChange }: { org: Org; loan: DbLoan; docs: Doc[]; links: ShareLink[]; onChange: () => void }) => {
  const [busy, setBusy] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const revoke = async (id: string) => { await supabase.from('share_links').update({ revoked: true }).eq('id', id); onChange() }

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setBusy(file.name)
      const { docType, confidence } = classifyType(file.name)
      const path = `${org.id}/${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('documents').upload(path, file)
      if (!error) {
        const { data: row } = await supabase.from('documents').insert({
          org_id: org.id, loan_id: loan.id, customer_id: loan.customer_id,
          filename: file.name, storage_path: path, doc_type: docType, confidence, status: 'routed',
        }).select().single()
        // Financial statements & tax returns spawn a draft spread column for the analyst.
        if (row && loan.customer_id) await spreadFromDocument(org.id, loan.customer_id, row.id, file.name, docType)
      }
    }
    setBusy(null)
    onChange()
  }

  return (
    <div className="two-col">
      <Card title="Documents" sub={`${docs.length} on this loan`}>
        <label
          className={`drop slim ${drag ? 'drag' : ''}`} style={{ margin: 12, marginBottom: 4 }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        >
          <input type="file" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
          {busy ? <span className="small"><span className="spin" style={{ display: 'inline-block', verticalAlign: -2 }} /> Uploading {busy}…</span>
            : <><Ico.doc /> <b>Drop files for this loan</b> <span className="small">classified on upload, filed directly here</span></>}
        </label>
        <table><tbody>
          {docs.map(d => (
            <tr key={d.id}>
              <td className="mono small ellipsis" title={d.filename}>{d.filename}</td>
              <td><span className="pill">{d.doc_type}</span></td>
              <td className="small mono">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
            </tr>
          ))}
          {!docs.length && <tr><td className="small">None yet — drop files above, or use portfolio-wide routing on the Dashboard's Operations tab.</td></tr>}
        </tbody></table>
      </Card>
      <Card title="Share links" sub="every access is logged">
        <table>
          <thead><tr><th>Institution</th><th>Scope</th><th>Expires</th><th className="num">Opens</th><th>Status</th><th /></tr></thead>
          <tbody>
            {links.map(s => {
              const expired = new Date(s.expires_at) < new Date()
              return (
                <tr key={s.id}>
                  <td><b>{s.institution}</b><div className="small mono ellipsis">{shareUrl(s.token)}</div></td>
                  <td className="small">{s.doc_ids ? `${s.doc_ids.length} docs` : 'All docs'}{s.passcode ? ' · passcode' : ''}</td>
                  <td className="small">{new Date(s.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td className="num mono">{s.access_count}</td>
                  <td><span className={`status ${s.revoked ? 's-red' : expired ? 's-gray' : 's-green'}`}>{s.revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}</span></td>
                  <td>{!s.revoked && !expired && <button className="btn-light" onClick={() => revoke(s.id)}>Revoke</button>}</td>
                </tr>
              )
            })}
            {!links.length && <tr><td colSpan={6} className="small">Nothing shared yet — use Share documents above.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Activity: send outreach + note composer + merged communications record ———
function Compose({ org, loan, onSent }: { org: Org; loan: DbLoan; onSent: () => void }) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const recipient = channel === 'email' ? loan.customers?.email : loan.customers?.phone

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipient) { setErr(`No ${channel === 'email' ? 'email address' : 'phone number'} on file for this borrower.`); return }
    setBusy(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('send-outreach', {
      body: { org_id: org.id, customer_id: loan.customer_id, channel, recipient, subject: channel === 'email' ? subject : null, body },
    })
    setBusy(false)
    if (error || data?.error) { setErr(error?.message ?? data.error); return }
    setSubject(''); setBody('')
    onSent()
  }

  return (
    <form className="compose-inline" onSubmit={send}>
      <div className="seg" style={{ width: 220 }}>
        <button type="button" className={channel === 'email' ? 'on' : ''} onClick={() => setChannel('email')}>Email</button>
        <button type="button" className={channel === 'sms' ? 'on' : ''} onClick={() => setChannel('sms')}>Text</button>
      </div>
      <span className="small mono">to {recipient ?? `no ${channel} on file`}</span>
      {channel === 'email' && <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />}
      <input required placeholder={channel === 'sms' ? 'Text message…' : 'Message…'} value={body} onChange={e => setBody(e.target.value)} style={{ flex: 2 }} />
      <button className="btn-dark" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      {err && <span className="small" style={{ color: 'var(--red)', flexBasis: '100%' }}>{err}</span>}
    </form>
  )
}

function ActivityTab({ org, loan, notes, outreach, onChange }: { org: Org; loan: DbLoan; notes: Note[]; outreach: Attempt[]; onChange: () => void }) {
  const [body, setBody] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('loan_notes').insert({
      org_id: org.id, loan_id: loan.id, body,
      author: (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown',
      created_by: user?.id,
    })
    setBody('')
    onChange()
  }

  type Ev = { id: string; at: string; chip: string; head: string; detail?: string; status?: React.ReactNode }
  const events: Ev[] = [
    ...notes.map(n => ({ id: `n${n.id}`, at: n.created_at, chip: 'note', head: `${n.author}`, detail: n.body })),
    ...outreach.map(a => ({
      id: `o${a.id}`, at: a.created_at, chip: a.rule_id ? 'auto' : a.channel,
      head: `${a.channel} to ${a.recipient}${a.subject ? ` — ${a.subject}` : ''}`, detail: a.body,
      status: <span className={`status ${a.status === 'sent' ? 's-green' : a.status === 'failed' ? 's-red' : 's-blue'}`}>{a.status}</span>,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1))

  return (
    <Card title="Notes & activity" sub="send outreach, log calls — one record per borrower">
      <div className="notes">
        <Compose org={org} loan={loan} onSent={onChange} />
        <form onSubmit={add} className="note-form">
          <input required placeholder="Add a note — e.g. 'Called borrower re: Aug payment; promised funds by 9/15'" value={body} onChange={e => setBody(e.target.value)} />
          <button className="btn-dark">Add</button>
        </form>
        {events.map(e => (
          <div className="note" key={e.id} onClick={() => setExpanded(x => (x === e.id ? null : e.id))} style={{ cursor: e.detail ? 'pointer' : 'default' }}>
            <div className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="pill">{e.chip}</span>
              <b>{e.head}</b>
              {e.status}
              <span className="spacer" style={{ flex: 1 }} />
              <span className="mono">{new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            </div>
            {e.detail && (expanded === e.id || e.chip === 'note') && <div style={{ marginTop: 4 }}>{e.detail}</div>}
          </div>
        ))}
        {!events.length && <p className="small" style={{ padding: '0 14px 12px' }}>No activity yet.</p>}
      </div>
    </Card>
  )
}

// ——— Share popover (header action) ———
function ShareControls({ org, loanId, docs, onChange }: { org: Org; loanId: string; docs: Doc[]; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [institution, setInstitution] = useState('')
  const [passcode, setPasscode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const toggle = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('share_links').insert({
      org_id: org.id, loan_id: loanId, institution,
      passcode: passcode || null,
      doc_ids: selected.size && selected.size < docs.length ? [...selected] : null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single()
    if (!error && data) {
      setJustCreated(shareUrl(data.token))
      navigator.clipboard?.writeText(shareUrl(data.token)).catch(() => {})
      setOpen(false); setInstitution(''); setPasscode(''); setSelected(new Set())
      onChange()
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn-dark" onClick={() => { setOpen(o => !o); setJustCreated(null) }}><Ico.link /> Share documents</button>
      {open && (
        <form className="share-pop" onSubmit={create}>
          <b>Share documents with an institution</b>
          <p className="small">Protected link: unguessable token · expires in 14 days · revocable · every open logged.</p>
          <input required placeholder="Institution name" value={institution} onChange={e => setInstitution(e.target.value)} />
          <input placeholder="Optional passcode (share it separately)" value={passcode} onChange={e => setPasscode(e.target.value)} />
          <div className="share-docs-list">
            {docs.map(d => (
              <label key={d.id} className="share-doc">
                <input type="checkbox" checked={selected.size === 0 || selected.has(d.id)} onChange={() => toggle(d.id)} />
                <span className="ellipsis">{d.filename}</span>
              </label>
            ))}
            {!docs.length && <span className="small">No documents on this loan yet — the link will show an empty room.</span>}
          </div>
          <p className="small">{selected.size === 0 || selected.size === docs.length ? `Sharing all ${docs.length}` : `Sharing ${selected.size} of ${docs.length}`} document{docs.length === 1 ? '' : 's'}.</p>
          <button className="btn-dark" style={{ width: '100%', justifyContent: 'center' }}>Create link</button>
        </form>
      )}
      {justCreated && <div className="share-toast">Link created & copied<br /><span className="mono small">{justCreated}</span></div>}
    </div>
  )
}
