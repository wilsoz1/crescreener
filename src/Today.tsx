// "Today" — the home page. One unified work queue across the whole book:
// the app tells you your job instead of making you visit five reports.
import { useEffect, useState } from 'react'
import { supabase, Org, Payment, money, daysLate, pastDueOf, runRules } from './supabase'
import { DbLoan } from './supabase'
import { AskBar, DraftButton } from './Ai'
import { Skeleton } from './dialogs'
import { Ico } from './Icons'

type Item = {
  sev: 0 | 1 | 2            // 0 = red, 1 = amber, 2 = info
  chip: string
  text: string
  who?: string
  action: string
  href: string
}

export default function Today({ org }: { org: Org }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [strip, setStrip] = useState<{ label: string; value: string; alert?: boolean }[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('id, loan_number, amount, current_balance, customers(company)'),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('deposits').select('balance'),
      supabase.from('credit_lines').select('commitment, outstanding'),
      supabase.from('covenants').select('id, name, actual, status, loan_id, loans(loan_number)'),
      supabase.from('ticklers').select('id, requirement, due_date, status, responsible, loan_id, loans(loan_number)'),
      supabase.from('documents').select('id, filename').eq('status', 'needs_review'),
      supabase.from('financial_spreads').select('id, period, customer_id, customers(company)').eq('status', 'draft'),
      supabase.from('deal_exceptions').select('id, rule_name, actual, deal_id, deals(name)').eq('status', 'open'),
      supabase.from('deal_approvals').select('id, role_label, deal_id, deals(name)').eq('decision', 'Pending'),
      supabase.from('conditions').select('id, item, due_date, owner, deal_id, deals(name)').in('status', ['open', 'received']),
      runRules(true).catch(() => ({ queued: [] })),
    ]).then(([ln, pay, dep, loc, cov, tick, docs, drafts, ex, ap, cond, queue]) => {
      const loans = (ln.data as unknown as (DbLoan & { customers: { company: string | null } | null })[]) ?? []
      const payments = (pay.data as Payment[]) ?? []
      const queued = (queue as { queued?: unknown[] }).queued ?? []
      const out: Item[] = []

      for (const l of loans) {
        const pd = pastDueOf(payments, l.id)
        if (pd) out.push({ sev: 0, chip: 'past due', text: `${l.customers?.company} — ${money(pd.amount)} past due ${pd.days} days on ${l.loan_number}`, action: 'Open loan', href: `#/app/loans/${l.id}/Payments` })
      }
      for (const c of (cov.data as unknown as { id: string; name: string; actual: string | null; status: string; loan_id: string; loans: { loan_number: string } | null }[]) ?? []) {
        if (c.status === 'Fail') out.push({ sev: 0, chip: 'covenant', text: `Covenant failing on ${c.loans?.loan_number}: ${c.name} (${c.actual ?? ''})`, action: 'Review', href: `#/app/loans/${c.loan_id}/Compliance` })
      }
      for (const e of (ex.data as unknown as { id: string; rule_name: string; actual: string; deal_id: string; deals: { name: string } | null }[]) ?? []) {
        out.push({ sev: 0, chip: 'exception', text: `Policy exception on ${e.deals?.name}: ${e.rule_name} — ${e.actual}`, action: 'Decide', href: `#/app/deals/${e.deal_id}/Policy & Rating` })
      }
      for (const a of (ap.data as unknown as { id: string; role_label: string; deal_id: string; deals: { name: string } | null }[]) ?? []) {
        out.push({ sev: 1, chip: 'approval', text: `${a.role_label} approval waiting on ${a.deals?.name}`, action: 'Review', href: `#/app/deals/${a.deal_id}/Approvals` })
      }
      for (const c of (cond.data as unknown as { id: string; item: string; due_date: string | null; owner: string | null; deal_id: string; deals: { name: string } | null }[]) ?? []) {
        const late = c.due_date ? daysLate(c.due_date) : -1
        out.push({ sev: late > 0 ? 0 : 1, chip: 'condition', text: `${c.item} (${c.deals?.name})${late > 0 ? ` — past due ${late}d` : c.due_date ? ` — due ${new Date(c.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`, who: c.owner ?? undefined, action: 'Open', href: `#/app/deals/${c.deal_id}/Conditions` })
      }
      for (const t of (tick.data as unknown as { id: string; requirement: string; due_date: string; status: string; responsible: string; loan_id: string; loans: { loan_number: string } | null }[]) ?? []) {
        if ((t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0)
          out.push({ sev: 1, chip: 'reporting', text: `${t.requirement} past due ${daysLate(t.due_date)}d on ${t.loans?.loan_number}`, who: t.responsible, action: 'Open', href: `#/app/loans/${t.loan_id}/Compliance` })
      }
      for (const s of (drafts.data as unknown as { id: string; period: string; customer_id: string; customers: { company: string | null } | null }[]) ?? []) {
        out.push({ sev: 2, chip: 'spread', text: `Draft spread awaiting review: ${s.customers?.company} · ${s.period}`, action: 'Review', href: `#/app/borrowers/${s.customer_id}` })
      }
      for (const d of (docs.data as { id: string; filename: string }[]) ?? []) {
        out.push({ sev: 2, chip: 'document', text: `Needs routing: ${d.filename}`, action: 'Route', href: '#/app/operations' })
      }
      if (queued.length) out.push({ sev: 1, chip: 'outreach', text: `${queued.length} delinquency message${queued.length > 1 ? 's' : ''} queued to send`, action: 'Release', href: '#/app/operations' })

      out.sort((a, b) => a.sev - b.sev)
      setItems(out)

      const loanTotal = loans.reduce((s, l) => s + Number(l.amount), 0)
      const balTotal = loans.reduce((s, l) => s + Number(l.current_balance ?? 0), 0)
      const depTotal = ((dep.data as { balance: number }[]) ?? []).reduce((s, d) => s + Number(d.balance), 0)
      const locs = (loc.data as { commitment: number; outstanding: number }[]) ?? []
      const commit = locs.reduce((s, c) => s + Number(c.commitment), 0)
      const drawn = locs.reduce((s, c) => s + Number(c.outstanding), 0)
      const pastDueTotal = loans.reduce((s, l) => s + (pastDueOf(payments, l.id)?.amount ?? 0), 0)
      setStrip([
        { label: `${loans.length} loans committed`, value: money(loanTotal) },
        { label: 'outstanding balances', value: money(balTotal) },
        { label: 'deposits', value: money(depTotal) },
        { label: `line utilization · ${money(drawn)} drawn`, value: commit ? `${Math.round((drawn / commit) * 100)}%` : '—' },
        ...(pastDueTotal ? [{ label: 'past due', value: money(pastDueTotal), alert: true }] : []),
      ])
    })
  }, [org.id])

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{greeting}</h1>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            {items === null ? 'Pulling your work together…'
              : items.length === 0 ? 'Nothing needs you right now — the book is clean.'
              : `${items.length} thing${items.length > 1 ? 's' : ''} need${items.length === 1 ? 's' : ''} attention across the book.`}
          </p>
          <div className="stat-row">
            {strip.map(s => <span key={s.label}><b style={s.alert ? { color: 'var(--red)' } : undefined}>{s.value}</b><i>{s.label}</i></span>)}
          </div>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <DraftButton kind="brief" label="Draft Monday brief" />
          <a className="btn-dark" href="#/app/screener" style={{ textDecoration: 'none' }}>Screen a new deal <Ico.chevron /></a>
        </div>
      </div>

      <div style={{ marginTop: 16 }}><AskBar /></div>

      {items === null ? <Skeleton rows={6} /> : (
        <div className="grid">
          <div className="uw-head"><span><b>Work queue</b> <span className="small">most urgent first — everything actionable in one place</span></span></div>
          {items.length === 0 && (
            <p className="small" style={{ padding: 18 }}>
              <Ico.check /> All clear. Payments current, covenants passing, approvals moving, documents routed.
            </p>
          )}
          {items.map((it, i) => (
            <div className="wq-row" key={i}>
              <span className={`dot2 ${it.sev === 0 ? 'red' : it.sev === 1 ? 'amber' : 'info'}`} />
              <span className="pill">{it.chip}</span>
              <span style={{ flex: 1 }}>{it.text}{it.who && <span className="small"> · {it.who}</span>}</span>
              <a className="btn-light" href={it.href} style={{ textDecoration: 'none' }}>{it.action}</a>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
