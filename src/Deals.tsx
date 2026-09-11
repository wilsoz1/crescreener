import { useEffect, useMemo, useState } from 'react'
import { supabase, Org, money } from './supabase'
import { Deal, Facility, DEAL_STAGES } from './finance'
import { fmtDate } from './Loans'
import { Ico } from './Icons'

const stageCls: Record<string, string> = {
  Prospect: 's-gray', Application: 's-gray', KYC: 's-blue', Underwriting: 's-blue', Approval: 's-amber',
  Conditions: 's-amber', Documentation: 's-amber', Closing: 's-amber', Funded: 's-green', Declined: 's-red', Withdrawn: 's-gray',
}

export default function Deals({ org }: { org: Org }) {
  const [deals, setDeals] = useState<Deal[]>([])
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [stage, setStage] = useState<string>('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('deals').select('*, customers(name, company)').order('created_at', { ascending: false }),
      supabase.from('facilities').select('*'),
    ]).then(([d, f]) => {
      setDeals((d.data as Deal[]) ?? [])
      setFacilities((f.data as Facility[]) ?? [])
      setLoading(false)
    })
  }, [org.id])

  const totals = useMemo(() => {
    const m: Record<string, { n: number; amt: number }> = {}
    for (const d of deals) {
      const amt = facilities.filter(f => f.deal_id === d.id).reduce((s, f) => s + Number(f.amount), 0)
      m[d.stage] = { n: (m[d.stage]?.n ?? 0) + 1, amt: (m[d.stage]?.amt ?? 0) + amt }
    }
    return m
  }, [deals, facilities])

  const rows = stage === 'All' ? deals : deals.filter(d => d.stage === stage)
  if (loading) return <p className="subtitle">Loading pipeline…</p>

  return (
    <>
      <h1>Deal pipeline</h1>
      <p className="subtitle">Every credit request from prospect to funding — one package, multiple facilities, zero re-keying.</p>

      <div className="chips" style={{ marginBottom: 16 }}>
        <button className={`f-chip ${stage === 'All' ? 'on' : ''}`} onClick={() => setStage('All')}>All ({deals.length})</button>
        {DEAL_STAGES.filter(s => totals[s]).map(s => (
          <button key={s} className={`f-chip ${stage === s ? 'on' : ''}`} onClick={() => setStage(s)}>
            {s} ({totals[s].n} · {money(totals[s].amt)})
          </button>
        ))}
      </div>

      <div className="grid">
        <table>
          <thead><tr>
            <th>Deal</th><th>Borrower</th><th>Stage</th><th className="num">Facilities</th>
            <th className="num">Total request</th><th className="num">Probability</th><th>Expected close</th><th>RM</th><th className="num">Rating</th>
          </tr></thead>
          <tbody>
            {rows.map(d => {
              const fac = facilities.filter(f => f.deal_id === d.id)
              return (
                <tr key={d.id} className="rowlink" onClick={() => (window.location.hash = `#/app/deals/${d.id}`)}>
                  <td><a className="cell-link" href={`#/app/deals/${d.id}`}>{d.name}</a></td>
                  <td className="ellipsis" title={d.customers?.company ?? undefined}>{d.customers?.company ?? '—'}</td>
                  <td><span className={`status ${stageCls[d.stage] ?? 's-gray'}`}>{d.stage}</span></td>
                  <td className="num mono">{fac.length}</td>
                  <td className="num mono">{money(fac.reduce((s, f) => s + Number(f.amount), 0))}</td>
                  <td className="num mono">{d.probability == null ? '—' : `${Math.round(d.probability * 100)}%`}</td>
                  <td>{fmtDate(d.expected_close)}</td>
                  <td>{d.rm ?? '—'}</td>
                  <td className="num mono">{d.rating_override ?? d.rating ?? '—'}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={9} className="small">No deals in this stage.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small" style={{ marginTop: 10 }}><Ico.doc /> New requests screened on the <a href="#/app/screener">Screener</a> can be promoted into deals; funded deals book straight into <a href="#/app/loans">Loans</a> with no re-keying.</p>
    </>
  )
}
