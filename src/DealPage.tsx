import { useEffect, useMemo, useState } from 'react'
import { supabase, Org, Spread, money, daysLate } from './supabase'
import {
  Deal, Facility, Party, PolicyRule, DealException, Approval, Condition, TPOrder, CollateralRec,
  FundingAuth, Screening, Envelope, DEAL_STAGES, facilityMath, amortPreview, dealMetrics, runPolicy,
  applyPolicy, eligibleValue, stressDSCR,
} from './finance'
import { DbLoan } from './supabase'
import { fmtDate } from './Loans'
import { DraftButton } from './Ai'
import { confirmDialog, promptDialog, toast, currentUserName, Skeleton } from './dialogs'
import { Ico } from './Icons'

const TABS = ['Overview', 'Facilities', 'Parties', 'Policy & Rating', 'Approvals', 'Conditions', 'Closing & Funding'] as const
type Tab = (typeof TABS)[number]

const Card = ({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <div className="grid" style={{ marginBottom: 20 }}>
    <div className="uw-head"><span><b>{title}</b> {sub && <span className="small">{sub}</span>}</span>{right}</div>
    {children}
  </div>
)

export default function DealPage({ org, dealId, initialTab }: { org: Org; dealId: string; initialTab?: string }) {
  const [deal, setDeal] = useState<Deal | null>(null)
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [parties, setParties] = useState<Party[]>([])
  const [rules, setRules] = useState<PolicyRule[]>([])
  const [exceptions, setExceptions] = useState<DealException[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [conditions, setConditions] = useState<Condition[]>([])
  const [orders, setOrders] = useState<TPOrder[]>([])
  const [collateral, setCollateral] = useState<CollateralRec[]>([])
  const [funding, setFunding] = useState<FundingAuth | null>(null)
  const [screenings, setScreenings] = useState<Screening[]>([])
  const [envelopes, setEnvelopes] = useState<Envelope[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [tab, setTabState] = useState<Tab>((TABS as readonly string[]).includes(initialTab ?? '') ? (initialTab as Tab) : 'Overview')
  const setTab = (t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', `#/app/deals/${dealId}/${encodeURIComponent(t)}`)
  }
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const { data: d } = await supabase.from('deals').select('*, customers(name, company)').eq('id', dealId).single()
    const deal = d as Deal | null
    setDeal(deal)
    const [f, p, r, ex, ap, co, or_, col, fu, sc, en, ln] = await Promise.all([
      supabase.from('facilities').select('*').eq('deal_id', dealId).order('amount', { ascending: false }),
      supabase.from('deal_parties').select('*').eq('deal_id', dealId),
      supabase.from('policy_rules').select('*').order('name'),
      supabase.from('deal_exceptions').select('*').eq('deal_id', dealId),
      supabase.from('deal_approvals').select('*').eq('deal_id', dealId).order('step_order'),
      supabase.from('conditions').select('*').eq('deal_id', dealId).order('category'),
      supabase.from('third_party_orders').select('*').eq('deal_id', dealId),
      supabase.from('collateral').select('*').eq('deal_id', dealId),
      supabase.from('funding_auths').select('*').eq('deal_id', dealId).limit(1),
      supabase.from('screenings').select('*').eq('deal_id', dealId).order('checked_at', { ascending: false }),
      supabase.from('esign_envelopes').select('*').eq('deal_id', dealId),
      supabase.from('loans').select('*, customers(name, company, email, phone)'),
    ])
    setFacilities((f.data as Facility[]) ?? []); setParties((p.data as Party[]) ?? [])
    setRules((r.data as PolicyRule[]) ?? []); setExceptions((ex.data as DealException[]) ?? [])
    setApprovals((ap.data as Approval[]) ?? []); setConditions((co.data as Condition[]) ?? [])
    setOrders((or_.data as TPOrder[]) ?? []); setCollateral((col.data as CollateralRec[]) ?? [])
    setFunding(((fu.data as FundingAuth[]) ?? [])[0] ?? null)
    setScreenings((sc.data as Screening[]) ?? []); setEnvelopes((en.data as Envelope[]) ?? [])
    setLoans((ln.data as DbLoan[]) ?? [])
    if (deal?.customer_id) {
      const { data } = await supabase.from('financial_spreads').select('*').eq('customer_id', deal.customer_id).order('period')
      setSpreads((data as Spread[]) ?? [])
    } else setSpreads([])
    setLoading(false)
  }
  useEffect(() => { load() }, [dealId])

  const metrics = useMemo(() => (deal ? dealMetrics(facilities, collateral, spreads, deal) : null), [deal, facilities, collateral, spreads])

  if (loading || !deal || !metrics) return <Skeleton rows={7} />

  const openEx = exceptions.filter(e => e.status === 'open')
  const pendingAp = approvals.filter(a => a.decision === 'Pending')
  const openCond = conditions.filter(c => c.status === 'open' || c.status === 'received')
  const reviewScr = screenings.filter(s => s.status !== 'clear')
  const srcTotal = deal.sources.reduce((s, x) => s + x.amount, 0)
  const useTotal = deal.uses.reduce((s, x) => s + x.amount, 0)
  const healthy = !openEx.length && !reviewScr.length && srcTotal === useTotal

  const badges: Partial<Record<Tab, { n: number; cls: string }>> = {
    'Policy & Rating': openEx.length ? { n: openEx.length, cls: 'red' } : undefined,
    Approvals: pendingAp.length ? { n: pendingAp.length, cls: 'amber' } : undefined,
    Conditions: openCond.length ? { n: openCond.length, cls: 'amber' } : undefined,
  }

  const setStage = async (stage: string) => {
    await supabase.from('deals').update({ stage }).eq('id', dealId)
    load()
  }

  return (
    <>
      <div className="crumb-row"><a href="#/app/pipeline">← Pipeline</a></div>
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{deal.name}</h1>
          <p className="subtitle" style={{ marginBottom: 10 }}>{deal.purpose} · RM {deal.rm ?? '—'}</p>
          <div className="stat-row">
            <span><b>{money(metrics.total_amount)}</b><i>{facilities.length} facilit{facilities.length === 1 ? 'y' : 'ies'}</i></span>
            <span><b>{metrics.ltv == null ? '—' : `${(metrics.ltv * 100).toFixed(1)}%`}</b><i>LTV vs. collateral</i></span>
            <span><b>{metrics.dscr == null ? '—' : `${metrics.dscr.toFixed(2)}x`}</b><i>DSCR (latest spread)</i></span>
            <span><b>{deal.rating_override ?? deal.rating ?? '—'}</b><i>risk rating{deal.rating_override ? ' (override)' : ''}</i></span>
            <span><b>{fmtDate(deal.expected_close)}</b><i>expected close · {deal.probability == null ? '—' : Math.round(deal.probability * 100) + '%'}</i></span>
          </div>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <DraftButton kind="credit_memo" dealId={dealId} label="Draft credit memo" />
          <select className="mini" aria-label="Deal stage" value={deal.stage} onChange={e => setStage(e.target.value)}>
            {[...DEAL_STAGES, 'Declined', 'Withdrawn'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="stage-track" aria-label="Deal progress">
        {DEAL_STAGES.map((s, i) => {
          const cur = DEAL_STAGES.indexOf(deal.stage as typeof DEAL_STAGES[number])
          return <span key={s} className={`stage-dot ${i < cur ? 'done' : i === cur ? 'on' : ''}`}>{s}</span>
        })}
      </div>

      {deal.stage === 'Funded' && facilities.some(f => f.loan_id) && (
        <div className="alert-strip ok">
          <span className="status s-green"><Ico.check /> Funded</span>
          <span className="small">Booked as {facilities.filter(f => f.loan_id).map((f, i) => (
            <span key={f.id}>{i > 0 && ', '}<a className="cell-link" href={`#/app/loans/${f.loan_id}`}>{loans.find(l => l.id === f.loan_id)?.loan_number ?? 'loan'}</a></span>
          ))} — servicing continues on the loan record{facilities.filter(f => f.loan_id).length > 1 ? 's' : ''}.</span>
        </div>
      )}
      {deal.stage !== 'Funded' && (healthy && !pendingAp.length && !openCond.length ? (
        <div className="alert-strip ok"><span className="status s-green"><Ico.check /> Nothing blocking this deal</span></div>
      ) : (
        <div className="alert-strip">
          {openEx.length > 0 && <span className="status s-red"><Ico.x /> {openEx.length} policy exception{openEx.length > 1 ? 's' : ''} open</span>}
          {reviewScr.length > 0 && <span className="status s-amber"><Ico.clock /> {reviewScr.length} screening{reviewScr.length > 1 ? 's' : ''} need review</span>}
          {pendingAp.length > 0 && <span className="status s-amber"><Ico.clock /> {pendingAp.length} approval{pendingAp.length > 1 ? 's' : ''} pending</span>}
          {openCond.length > 0 && <span className="status s-amber"><Ico.clock /> {openCond.length} condition{openCond.length > 1 ? 's' : ''} outstanding</span>}
          {srcTotal !== useTotal && <span className="status s-red"><Ico.x /> Sources ≠ uses ({money(srcTotal)} vs {money(useTotal)})</span>}
        </div>
      ))}

      <div className="detail-tabs" style={{ marginTop: 16 }}>
        {TABS.map(t => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}{badges[t] && <span className={`tab-badge ${badges[t]!.cls}`}>{badges[t]!.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <Overview {...{ deal, org, openEx, pendingAp, openCond, screenings, parties, srcTotal, useTotal, setTab, onChange: load }} />}
      {tab === 'Facilities' && <FacilitiesTab facilities={facilities} spreads={spreads} />}
      {tab === 'Parties' && <PartiesTab parties={parties} loans={loans} facilities={facilities} />}
      {tab === 'Policy & Rating' && <PolicyTab {...{ org, deal, rules, metrics, exceptions, approvals, onChange: load }} />}
      {tab === 'Approvals' && <ApprovalsTab {...{ approvals, onChange: load }} />}
      {tab === 'Conditions' && <ConditionsTab {...{ org, dealId, conditions, orders, onChange: load }} />}
      {tab === 'Closing & Funding' && <ClosingTab {...{ org, deal, facilities, approvals, conditions, screenings, envelopes, funding, collateral, onChange: load }} />}
    </>
  )
}

// ——— Overview: triage + screenings + sources & uses ———
function Overview({ deal, org, openEx, pendingAp, openCond, screenings, parties, srcTotal, useTotal, setTab, onChange }: {
  deal: Deal; org: Org; openEx: DealException[]; pendingAp: Approval[]; openCond: Condition[]
  screenings: Screening[]; parties: Party[]; srcTotal: number; useTotal: number
  setTab: (t: Tab) => void; onChange: () => void
}) {
  const [running, setRunning] = useState(false)
  const runScreenings = async () => {
    setRunning(true)
    // Simulated adapter: real KYC/OFAC vendors plug in behind the same rows.
    const unscreened = parties.filter(p => !screenings.some(s => s.party_name === p.name && s.kind === 'OFAC / sanctions'))
    for (const p of unscreened) {
      await supabase.from('screenings').insert([
        { org_id: org.id, deal_id: deal.id, party_name: p.name, kind: 'OFAC / sanctions', status: 'clear' },
        { org_id: org.id, deal_id: deal.id, party_name: p.name, kind: p.role === 'Guarantor' ? 'Identity' : 'Business verification', status: 'clear' },
      ])
    }
    setRunning(false)
    onChange()
  }
  const items = [
    ...openEx.map(e => ({ sev: 'red' as const, text: `Policy exception open: ${e.rule_name} — ${e.actual}`, tab: 'Policy & Rating' as Tab })),
    ...(srcTotal !== useTotal ? [{ sev: 'red' as const, text: `Sources (${money(srcTotal)}) do not equal uses (${money(useTotal)})`, tab: 'Overview' as Tab }] : []),
    ...screenings.filter(s => s.status !== 'clear').map(s => ({ sev: 'amber' as const, text: `${s.kind} screening for ${s.party_name}: ${s.status}`, tab: 'Overview' as Tab })),
    ...pendingAp.map(a => ({ sev: 'amber' as const, text: `${a.role_label} approval pending`, tab: 'Approvals' as Tab })),
    ...openCond.map(c => ({ sev: 'amber' as const, text: `${c.category} condition: ${c.item}${c.due_date && daysLate(c.due_date) > 0 ? ` (past due ${daysLate(c.due_date)}d)` : ''}`, tab: 'Conditions' as Tab })),
  ]
  return (
    <div className="two-col">
      <div>
        <Card title="Needs attention" sub={items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : undefined}>
          {items.length ? items.slice(0, 10).map((it, i) => (
            <div className="alert" key={i}>
              <span className={`dot2 ${it.sev}`} />
              <span style={{ flex: 1 }}>{it.text}</span>
              <button className="linkish" onClick={() => setTab(it.tab)}>{it.tab} →</button>
            </div>
          )) : <p className="small" style={{ padding: 14 }}>Nothing needs attention on this deal.</p>}
        </Card>
        {(deal.sources.length > 0 || deal.uses.length > 0) && (
          <Card title="Sources & uses" sub={srcTotal === useTotal ? 'balanced' : 'OUT OF BALANCE'}>
            <table>
              <tbody>
                {deal.sources.map((s, i) => <tr key={`s${i}`}><td className="small">Source</td><td>{s.label}</td><td className="num mono">{money(s.amount)}</td></tr>)}
                <tr><td /><td className="bold">Total sources</td><td className="num mono bold">{money(srcTotal)}</td></tr>
                {deal.uses.map((u, i) => <tr key={`u${i}`}><td className="small">Use</td><td>{u.label}</td><td className="num mono">{money(u.amount)}</td></tr>)}
                <tr><td /><td className="bold">Total uses</td><td className="num mono bold">{money(useTotal)}</td></tr>
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <Card title="KYC / screening" sub="simulated provider — OFAC, identity & business verification plug in here"
        right={<button className="btn-dark" onClick={runScreenings} disabled={running}>{running ? 'Screening…' : 'Screen all parties'}</button>}>
        <table>
          <thead><tr><th>Party</th><th>Check</th><th>Status</th><th>When</th></tr></thead>
          <tbody>
            {screenings.map(s => (
              <tr key={s.id}>
                <td>{s.party_name}</td>
                <td className="small">{s.kind}</td>
                <td><span className={`status ${s.status === 'clear' ? 's-green' : s.status === 'review' ? 's-amber' : 's-red'}`}>{s.status}</span></td>
                <td className="small mono">{new Date(s.checked_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
              </tr>
            ))}
            {!screenings.length && <tr><td colSpan={4} className="small">No screenings yet — run them before underwriting goes far.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Facilities: structure + payment engine + stress ———
function FacilitiesTab({ facilities, spreads }: { facilities: Facility[]; spreads: Spread[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const reviewed = spreads.filter(s => s.status === 'reviewed')
  const ebitda = reviewed.length ? Number(reviewed[reviewed.length - 1].data.ebitda ?? NaN) : NaN
  return (
    <>
      <Card title="Facilities" sub="payments computed by the deterministic engine — click a facility for its amortization">
        <table>
          <thead><tr><th>Facility</th><th className="num">Amount</th><th>Rate</th><th className="num">Term / Amort</th><th className="num">Monthly P&I</th><th className="num">Balloon</th><th className="num">Fee</th></tr></thead>
          <tbody>
            {facilities.map(f => {
              const m = facilityMath(f)
              return (
                <React.Fragment key={f.id}>
                  <tr className="rowlink" onClick={() => setOpen(o => (o === f.id ? null : f.id))}>
                    <td><b>{f.facility_type}</b>{f.loan_id && <a className="cell-link" href={`#/app/loans/${f.loan_id}`} style={{ marginLeft: 8 }} onClick={e => e.stopPropagation()}>Booked →</a>}</td>
                    <td className="num mono">{money(f.amount)}</td>
                    <td className="mono">{f.rate_display ?? '—'}</td>
                    <td className="num mono">{f.term_months ?? '—'} / {f.amort_months ?? 'IO'}</td>
                    <td className="num mono">{m.payment ? money(m.payment) : m.ioPayment ? `${money(m.ioPayment)} (IO)` : '—'}</td>
                    <td className="num mono">{m.balloon ? money(m.balloon) : '—'}</td>
                    <td className="num mono">{f.origination_fee_bps ? money((f.amount * f.origination_fee_bps) / 10000) : '—'}</td>
                  </tr>
                  {open === f.id && f.amort_months && (
                    <tr><td colSpan={7} style={{ background: 'var(--hover)' }}>
                      <table style={{ minWidth: 0 }}>
                        <thead><tr><th>#</th><th className="num">Payment</th><th className="num">Interest</th><th className="num">Principal</th><th className="num">Balance</th></tr></thead>
                        <tbody>
                          {amortPreview(f).map(r => (
                            <tr key={r.n}><td className="mono">{r.n}</td><td className="num mono">{money(r.payment)}</td><td className="num mono">{money(r.interest)}</td><td className="num mono">{money(r.principal)}</td><td className="num mono">{money(r.balance)}</td></tr>
                          ))}
                          <tr><td colSpan={5} className="small">First 6 of {f.amort_months} payments{f.term_months && f.term_months < f.amort_months ? ` · balloon at month ${f.term_months}` : ''}.</td></tr>
                        </tbody>
                      </table>
                    </td></tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </Card>
      <Card title="Sensitivity" sub={isNaN(ebitda) ? 'needs a reviewed borrower spread' : `base EBITDA ${money(ebitda)} from ${reviewed[reviewed.length - 1].period}`}>
        {isNaN(ebitda) ? <p className="small" style={{ padding: 14 }}>Upload and review a borrower financial statement to unlock stress testing.</p> : (
          <table>
            <thead><tr><th>Scenario</th><th className="num">Rate +0 bps</th><th className="num">+100 bps</th><th className="num">+200 bps</th></tr></thead>
            <tbody>
              {[0, 0.10, 0.15].map(cut => (
                <tr key={cut}>
                  <td>{cut === 0 ? <b>Base EBITDA</b> : `EBITDA −${cut * 100}%`}</td>
                  {[0, 100, 200].map(bps => {
                    const v = stressDSCR(facilities, ebitda, bps, cut)
                    return <td key={bps} className="num mono">{v == null ? '—' : <span className={v < 1.2 ? 'status s-red' : v < 1.35 ? 'status s-amber' : ''}>{v.toFixed(2)}x</span>}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
import React from 'react'

// ——— Parties & relationship exposure ———
function PartiesTab({ parties, loans, facilities }: { parties: Party[]; loans: DbLoan[]; facilities: Facility[] }) {
  const partyCustomerIds = parties.map(p => p.customer_id).filter(Boolean)
  const related = loans.filter(l => l.customer_id && partyCustomerIds.includes(l.customer_id) && !facilities.some(f => f.loan_id === l.id))
  const existing = related.reduce((s, l) => s + Number(l.current_balance ?? l.amount), 0)
  const proposed = facilities.filter(f => !f.loan_id).reduce((s, f) => s + Number(f.amount), 0)
  return (
    <div className="two-col">
      <Card title="Parties">
        <table>
          <thead><tr><th>Name</th><th>Role</th><th className="num">Ownership</th></tr></thead>
          <tbody>
            {parties.map(p => (
              <tr key={p.id}><td><b>{p.name}</b></td><td><span className="pill">{p.role}</span></td><td className="num mono">{p.ownership_pct ? `${p.ownership_pct}%` : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Relationship exposure" sub="existing loans to these parties + this request">
        <table>
          <tbody>
            {related.map(l => (
              <tr key={l.id}>
                <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
                <td className="ellipsis">{l.customers?.company}</td>
                <td className="small">{l.type}</td>
                <td className="num mono">{money(Number(l.current_balance ?? l.amount))}</td>
              </tr>
            ))}
            <tr><td colSpan={3} className="bold">Existing exposure</td><td className="num mono bold">{money(existing)}</td></tr>
            <tr><td colSpan={3} className="bold">This request</td><td className="num mono bold">{money(proposed)}</td></tr>
            <tr><td colSpan={3} className="bold">Total relationship</td><td className="num mono bold">{money(existing + proposed)}</td></tr>
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Policy & rating ———
function PolicyTab({ org, deal, rules, metrics, exceptions, approvals, onChange }: {
  org: Org; deal: Deal; rules: PolicyRule[]; metrics: ReturnType<typeof dealMetrics>
  exceptions: DealException[]; approvals: Approval[]; onChange: () => void
}) {
  const [running, setRunning] = useState(false)
  const [overriding, setOverriding] = useState(false)
  const [ovr, setOvr] = useState(String(deal.rating_override ?? deal.rating ?? 4))
  const [reason, setReason] = useState('')
  const { exceptions: fired } = runPolicy(rules, metrics)

  const rerun = async () => {
    setRunning(true)
    await applyPolicy(org.id, deal.id, rules, metrics, exceptions, approvals)
    setRunning(false)
    onChange()
  }
  const decide = async (e: DealException, status: 'approved' | 'declined') => {
    const approver = await promptDialog(`${status === 'approved' ? 'Approve' : 'Decline'} exception`, 'Approver name (logged)', { body: `${e.rule_name} — ${e.actual}`, initial: await currentUserName(), confirmText: status === 'approved' ? 'Approve' : 'Decline' })
    if (!approver) return
    const mitigants = status === 'approved' ? await promptDialog('Mitigants', 'Recorded on the exception', { confirmText: 'Save' }) ?? '' : null
    await supabase.from('deal_exceptions').update({ status, approver, mitigants, decided_at: new Date().toISOString() }).eq('id', e.id)
    toast(`Exception ${status}`)
    onChange()
  }
  const saveOverride = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('deals').update({
      rating_override: +ovr, override_reason: reason,
      override_by: (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown',
    }).eq('id', deal.id)
    setOverriding(false)
    onChange()
  }
  const factors = Object.entries(deal.rating_factors)

  return (
    <>
      <div className="two-col">
        <Card title="Risk rating" sub="override requires a logged justification">
          <table className="kv"><tbody>
            {factors.map(([k, v]) => <tr key={k}><td style={{ textTransform: 'capitalize' }}>{k}</td><td className="mono">{v}</td></tr>)}
            <tr><td className="bold">Model rating</td><td className="mono bold">{deal.rating ?? '—'}</td></tr>
            {deal.rating_override && <tr><td className="bold">Override</td><td><b className="mono">{deal.rating_override}</b> <span className="small">by {deal.override_by} — “{deal.override_reason}”</span></td></tr>}
          </tbody></table>
          <div style={{ padding: '0 14px 14px' }}>
            {overriding ? (
              <form onSubmit={saveOverride} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="number" min={1} max={9} required value={ovr} onChange={e => setOvr(e.target.value)} aria-label="Override rating" style={{ width: 70, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', font: 'inherit' }} />
                <input required placeholder="Justification (required, logged)" value={reason} onChange={e => setReason(e.target.value)} aria-label="Override justification" style={{ flex: 1, minWidth: 200, border: '1px solid var(--line)', borderRadius: 7, padding: '6px 8px', font: 'inherit' }} />
                <button className="btn-dark">Save override</button>
              </form>
            ) : <button className="btn-light" onClick={() => setOverriding(true)}>Override rating</button>}
          </div>
        </Card>
        <Card title="Policy check" sub="credit policy runs as code — deterministic, not discretionary"
          right={<button className="btn-dark" onClick={rerun} disabled={running}>{running ? 'Running…' : 'Re-run policy check'}</button>}>
          <table>
            <thead><tr><th>Rule</th><th>Result</th></tr></thead>
            <tbody>
              {rules.filter(r => r.enabled).map(r => {
                const hit = fired.find(f => f.rule.id === r.id)
                const routed = r.action.startsWith('route:') && runPolicy([r], metrics).routes.length > 0
                return (
                  <tr key={r.id}>
                    <td><b>{r.name}</b><div className="src">{r.action === 'exception' ? 'creates exception' : r.action.replace('route:', 'routes to ')}</div></td>
                    <td>{hit ? <span className="status s-red"><Ico.x /> {hit.actual}</span>
                      : routed ? <span className="status s-amber"><Ico.chevron /> routed</span>
                      : <span className="status s-green"><Ico.check /> Pass</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <Card title="Policy exceptions" sub="each one carries requirement, actual, mitigants and a named approver">
        <table>
          <thead><tr><th>Exception</th><th>Requirement</th><th>Actual</th><th>Status</th><th /></tr></thead>
          <tbody>
            {exceptions.map(e => (
              <tr key={e.id}>
                <td><b>{e.rule_name}</b>{e.mitigants && <div className="src">Mitigants: {e.mitigants}</div>}</td>
                <td className="small">{e.requirement}</td>
                <td className="mono">{e.actual}</td>
                <td>{e.status === 'open' ? <span className="status s-red">Open</span>
                  : <span className={`status ${e.status === 'approved' ? 's-green' : 's-red'}`}>{e.status} · {e.approver}</span>}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {e.status === 'open' && <>
                    <button className="btn-light" onClick={() => decide(e, 'approved')}>Approve</button>{' '}
                    <button className="btn-light" onClick={() => decide(e, 'declined')}>Decline</button>
                  </>}
                </td>
              </tr>
            ))}
            {!exceptions.length && <tr><td colSpan={5} className="small">No exceptions — the request is inside policy.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  )
}

// ——— Approvals ———
function ApprovalsTab({ approvals, onChange }: { approvals: Approval[]; onChange: () => void }) {
  const decide = async (a: Approval, decision: string) => {
    const approver = await promptDialog(decision, 'Approver name (logged)', { body: `${a.role_label} — step ${a.step_order}`, initial: a.approver ?? await currentUserName(), confirmText: decision })
    if (!approver) return
    await supabase.from('deal_approvals').update({ decision, approver, decided_at: new Date().toISOString() }).eq('id', a.id)
    toast(`${a.role_label}: ${decision}`)
    onChange()
  }
  return (
    <Card title="Approval chain" sub="routing set by policy — every decision named, timestamped and permanent">
      <div className="tl">
        {approvals.map(a => (
          <div className="tl-item" key={a.id}>
            <div className="tl-rail"><div className="tl-dot" style={{ background: a.decision === 'Pending' ? 'var(--line)' : a.decision.startsWith('Approved') ? 'var(--green)' : 'var(--red)' }} /><div className="tl-line" /></div>
            <div className="tl-body" style={{ flex: 1 }}>
              <b>{a.step_order}. {a.role_label}</b>{' '}
              <span className={`status ${a.decision === 'Pending' ? 's-gray' : a.decision.startsWith('Approved') ? 's-green' : a.decision === 'Declined' ? 's-red' : 's-amber'}`}>{a.decision}</span>
              <div className="tl-meta">{a.approver ?? 'Unassigned'}{a.decided_at && ` · ${new Date(a.decided_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}</div>
              {a.comment && <div className="small">{a.comment}</div>}
              {a.decision === 'Pending' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {['Approved', 'Approved with conditions', 'Returned for changes', 'Declined'].map(d => (
                    <button key={d} className={d === 'Approved' ? 'btn-dark' : 'btn-light'} onClick={() => decide(a, d)}>{d}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {!approvals.length && <p className="small" style={{ padding: 14 }}>No approval chain yet — run the policy check to route this deal.</p>}
      </div>
    </Card>
  )
}

// ——— Conditions precedent + third-party orders ———
function ConditionsTab({ org, dealId, conditions, orders, onChange }: {
  org: Org; dealId: string; conditions: Condition[]; orders: TPOrder[]; onChange: () => void
}) {
  const [item, setItem] = useState('')
  const [category, setCategory] = useState('Credit')
  const advance = async (c: Condition) => {
    const next = c.status === 'open' ? 'received' : 'satisfied'
    const evidence = next === 'satisfied'
      ? await promptDialog('Satisfy condition', 'Evidence (file name or note — required)', { body: c.item, initial: c.evidence ?? '', confirmText: 'Satisfy' })
      : c.evidence
    if (next === 'satisfied' && !evidence) return
    await supabase.from('conditions').update({ status: next, evidence }).eq('id', c.id)
    toast(next === 'satisfied' ? 'Condition satisfied' : 'Marked received')
    onChange()
  }
  const waive = async (c: Condition) => {
    const who = await promptDialog('Waive condition', 'Waiver authority (logged)', { body: c.item, initial: await currentUserName(), confirmText: 'Waive' })
    if (!who) return
    await supabase.from('conditions').update({ status: 'waived', waived_by: who }).eq('id', c.id)
    toast('Condition waived')
    onChange()
  }
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('conditions').insert({ org_id: org.id, deal_id: dealId, category, item })
    setItem('')
    onChange()
  }
  const condStatus = (c: Condition) =>
    c.status === 'satisfied' ? <span className="status s-green"><Ico.check /> Satisfied</span>
    : c.status === 'waived' ? <span className="status s-gray">Waived · {c.waived_by}</span>
    : c.status === 'received' ? <span className="status s-blue">Received</span>
    : <span className="status s-amber">Open</span>
  return (
    <>
      <Card title="Conditions precedent" sub="funding is blocked until every condition is satisfied or formally waived">
        <form onSubmit={add} className="note-form">
          <select className="mini" aria-label="Category" value={category} onChange={e => setCategory(e.target.value)}>
            {['Credit', 'Collateral', 'Legal', 'Documentation', 'Funding'].map(c => <option key={c}>{c}</option>)}
          </select>
          <input required aria-label="New condition" placeholder="Add a condition — e.g. 'Payoff letter for existing equipment loan'" value={item} onChange={e => setItem(e.target.value)} />
          <button className="btn-dark">Add</button>
        </form>
        <table>
          <thead><tr><th>Category</th><th>Condition</th><th>Owner</th><th>Due</th><th>Status</th><th /></tr></thead>
          <tbody>
            {conditions.map(c => (
              <tr key={c.id}>
                <td className="small">{c.category}</td>
                <td><b>{c.item}</b>{c.evidence && <div className="src">Evidence: {c.evidence}</div>}</td>
                <td className="small">{c.owner ?? '—'}</td>
                <td>{fmtDate(c.due_date)}</td>
                <td>{condStatus(c)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {(c.status === 'open' || c.status === 'received') && <>
                    <button className="btn-light" onClick={() => advance(c)}>{c.status === 'open' ? 'Mark received' : 'Satisfy'}</button>{' '}
                    <button className="btn-light" onClick={() => waive(c)}>Waive</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Third-party reports" sub="appraisals, environmental, title — closing is gated on required reviews">
        <table>
          <thead><tr><th>Report</th><th>Vendor</th><th>Ordered</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id}>
                <td><b>{o.report_type}</b>{o.reviewed_by && <div className="src">Reviewed by {o.reviewed_by}</div>}</td>
                <td className="small">{o.vendor ?? '—'}</td>
                <td>{fmtDate(o.ordered_date)}</td>
                <td>{fmtDate(o.due_date)}</td>
                <td><span className={`status ${o.status === 'reviewed' ? 's-green' : o.status === 'received' ? 's-blue' : o.status === 'expired' ? 's-red' : 's-amber'}`}>{o.status}</span></td>
              </tr>
            ))}
            {!orders.length && <tr><td colSpan={5} className="small">No reports ordered.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  )
}

// ——— Closing dashboard, e-sign, funding auth (maker/checker), core booking ———
function ClosingTab({ org, deal, facilities, approvals, conditions, screenings, envelopes, funding, collateral, onChange }: {
  org: Org; deal: Deal; facilities: Facility[]; approvals: Approval[]; conditions: Condition[]
  screenings: Screening[]; envelopes: Envelope[]; funding: FundingAuth | null; collateral: CollateralRec[]; onChange: () => void
}) {
  const checks: { label: string; ok: boolean }[] = [
    { label: 'All screenings clear', ok: screenings.length > 0 && screenings.every(s => s.status === 'clear') },
    { label: 'Approval chain complete', ok: approvals.length > 0 && approvals.every(a => a.decision.startsWith('Approved')) },
    { label: 'Conditions satisfied or waived', ok: conditions.length > 0 && conditions.every(c => c.status === 'satisfied' || c.status === 'waived') },
    { label: 'Documents signed', ok: envelopes.length > 0 && envelopes.every(e => e.status === 'signed') },
    { label: 'Funding authorized (dual control)', ok: funding?.status === 'authorized' || funding?.status === 'funded' },
  ]
  const readyToBook = checks.every(c => c.ok) && deal.stage !== 'Funded'

  const sendEnvelope = async () => {
    if (!envelopes.length) {
      await supabase.from('esign_envelopes').insert({ org_id: org.id, deal_id: deal.id, title: 'Loan documents', status: 'sent', sent_at: new Date().toISOString() })
    } else {
      await supabase.from('esign_envelopes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', envelopes[0].id)
    }
    onChange()
  }
  const markSigned = async (e: Envelope) => {
    await supabase.from('esign_envelopes').update({ status: 'signed', completed_at: new Date().toISOString() }).eq('id', e.id)
    onChange()
  }
  const submitFunding = async () => {
    if (!funding) return
    await supabase.from('funding_auths').update({ status: 'pending_second' }).eq('id', funding.id)
    onChange()
  }
  const authorize = async () => {
    if (!funding) return
    const who = await promptDialog('Authorize funding', 'Second authorizer (must differ from preparer)', { body: `Prepared by ${funding.prepared_by} · net proceeds ${money(funding.net_proceeds)} to ${funding.wire_recipient}`, initial: await currentUserName(), confirmText: 'Authorize' })
    if (!who) return
    if (who.trim().toLowerCase() === (funding.prepared_by ?? '').trim().toLowerCase()) {
      toast('Dual control: the second authorizer cannot be the preparer')
      return
    }
    await supabase.from('funding_auths').update({ status: 'authorized', approved_by: who }).eq('id', funding.id)
    toast('Funding authorized')
    onChange()
  }
  const bookToCore = async () => {
    if (!(await confirmDialog(`Book ${facilities.length} facilit${facilities.length === 1 ? 'y' : 'ies'} to the core?`, 'Terms flow straight from the approved structure — no re-keying.', { confirmText: 'Book & fund' }))) return
    const year = new Date().getFullYear()
    for (const f of facilities.filter(f => !f.loan_id)) {
      const m = facilityMath(f)
      const maturity = f.term_months ? new Date(Date.now() + f.term_months * 30.44 * 86400000).toISOString().slice(0, 10) : null
      const { data: loan } = await supabase.from('loans').insert({
        org_id: org.id, customer_id: deal.customer_id,
        loan_number: `CL-${year}-${Math.floor(100 + Math.random() * 900)}`,
        type: f.facility_type, stage: 'Servicing', amount: f.amount,
        rate: f.rate_display, term: `${f.term_months ? Math.round(f.term_months / 12) : '—'} / ${f.amort_months ? Math.round(f.amort_months / 12) : 'IO'}`,
        payment_type: f.amort_months ? (f.io_months > 0 ? 'I/O Deferred' : 'P&I') : 'I/O',
        maturity, origination_date: new Date().toISOString().slice(0, 10),
        current_balance: f.amount, next_payment_amount: m.payment ?? m.ioPayment,
        next_payment_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        collateral: collateral[0]?.description ?? null, rm: deal.rm, dscr: null, ltv: null,
      }).select().single()
      if (loan) {
        await supabase.from('facilities').update({ loan_id: loan.id }).eq('id', f.id)
        await supabase.from('core_bookings').insert({
          org_id: org.id, deal_id: deal.id, loan_id: loan.id,
          payload: { loan_number: loan.loan_number, amount: f.amount, rate: f.rate_display, term_months: f.term_months, amort_months: f.amort_months, payment: m.payment ?? m.ioPayment, customer_id: deal.customer_id, rm: deal.rm },
        })
      }
    }
    if (funding) await supabase.from('funding_auths').update({ status: 'funded', funded_at: new Date().toISOString() }).eq('id', funding.id)
    await supabase.from('deals').update({ stage: 'Funded' }).eq('id', deal.id)
    toast('Booked to core — loans created, deal funded')
    onChange()
  }

  return (
    <>
      <Card title="Closing dashboard" sub="every gate must be green before booking">
        {checks.map(c => (
          <div className="alert" key={c.label}>
            {c.ok ? <span className="status s-green"><Ico.check /> </span> : <span className="status s-amber"><Ico.clock /> </span>}
            <span>{c.label}</span>
          </div>
        ))}
        <div style={{ padding: 14 }}>
          <button className="btn-dark" disabled={!readyToBook} onClick={bookToCore} title={readyToBook ? '' : 'Blocked until every gate above is green'}>
            <Ico.check /> {deal.stage === 'Funded' ? 'Booked' : 'Book to core & fund'}
          </button>
          {!readyToBook && deal.stage !== 'Funded' && <span className="small" style={{ marginLeft: 10 }}>Blocked — clear the gates above.</span>}
        </div>
      </Card>
      <div className="two-col">
        <Card title="E-signature" sub="simulated provider — DocuSign/Adobe Sign plug in behind the same envelope"
          right={!envelopes.length || envelopes[0].status === 'draft' ? <button className="btn-dark" onClick={sendEnvelope}>Send for signature</button> : undefined}>
          <table><tbody>
            {envelopes.map(e => (
              <tr key={e.id}>
                <td><b>{e.title}</b><div className="src">{(e.recipients ?? []).map(r => r.name).join(', ') || 'No recipients'}</div></td>
                <td><span className={`status ${e.status === 'signed' ? 's-green' : e.status === 'declined' ? 's-red' : 's-amber'}`}>{e.status}</span></td>
                <td>{e.status === 'sent' && <button className="btn-light" onClick={() => markSigned(e)}>Mark signed (sim)</button>}</td>
              </tr>
            ))}
            {!envelopes.length && <tr><td className="small">No envelope yet.</td></tr>}
          </tbody></table>
        </Card>
        <Card title="Funding authorization" sub="maker/checker — preparer and authorizer must differ">
          {funding ? (
            <>
              <table className="kv"><tbody>
                <tr><td>Commitment</td><td className="mono">{money(funding.commitment)}</td></tr>
                <tr><td>Initial advance</td><td className="mono">{money(funding.initial_advance)}</td></tr>
                <tr><td>Fees</td><td className="mono">{money(funding.fees)}</td></tr>
                <tr><td>Net proceeds</td><td className="mono bold">{money(funding.net_proceeds)}</td></tr>
                <tr><td>Wire to</td><td>{funding.wire_recipient} <span className="mono small">···{funding.wire_account_last4}</span></td></tr>
                <tr><td>Prepared by</td><td>{funding.prepared_by}</td></tr>
                <tr><td>Status</td><td><span className={`status ${funding.status === 'authorized' || funding.status === 'funded' ? 's-green' : 's-amber'}`}>{funding.status.replace('_', ' ')}</span>{funding.approved_by && <span className="small"> · second: {funding.approved_by}</span>}</td></tr>
              </tbody></table>
              <div style={{ padding: '0 14px 14px' }}>
                {funding.status === 'draft' && <button className="btn-dark" onClick={submitFunding}>Submit for second approval</button>}
                {funding.status === 'pending_second' && <button className="btn-dark" onClick={authorize}>Authorize (second signer)</button>}
              </div>
            </>
          ) : <p className="small" style={{ padding: 14 }}>No funding authorization drafted yet.</p>}
        </Card>
      </div>
    </>
  )
}
