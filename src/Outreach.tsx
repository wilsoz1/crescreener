import { useEffect, useState } from 'react'
import { supabase, Customer, Attempt, Org, Rule } from './supabase'
import { Ico } from './Icons'

const statusCls: Record<string, string> = { sent: 's-green', simulated: 's-blue', failed: 's-red' }

function DelinquencyRules({ org, onRan }: { org: Org; onRan: () => void }) {
  const [rules, setRules] = useState<Rule[]>([])
  const [days, setDays] = useState('15')
  const [channel, setChannel] = useState<'email' | 'sms' | 'both'>('email')
  const [subject, setSubject] = useState('Payment past due — {{loan_number}}')
  const [body, setBody] = useState('Hi {{name}}, the {{due_date}} payment of {{amount}} on {{loan_number}} is {{days_late}} days past due. Please contact us. — {{lender}}')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = () => supabase.from('outreach_rules').select('*').order('days_past_due').then(({ data }) => setRules((data as Rule[]) ?? []))
  useEffect(() => { load() }, [org.id])

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('outreach_rules').insert({ org_id: org.id, days_past_due: +days, channel, subject: channel === 'sms' ? null : subject, body })
    setAdding(false)
    load()
  }
  const toggle = async (r: Rule) => { await supabase.from('outreach_rules').update({ enabled: !r.enabled }).eq('id', r.id); load() }
  const remove = async (r: Rule) => { await supabase.from('outreach_rules').delete().eq('id', r.id); load() }

  const runNow = async () => {
    setRunning(true); setResult(null)
    try {
      const res = await fetch('https://ngmpmyuwacwbwtqtinos.supabase.co/functions/v1/run-rules', { method: 'POST' })
      const out = await res.json()
      setResult(`${out.overdue} past-due payment${out.overdue === 1 ? '' : 's'} found · ${out.sent} message${out.sent === 1 ? '' : 's'} sent · ${out.skipped_already_sent} already handled`)
      onRan()
    } catch (e) {
      setResult(`Run failed: ${(e as Error).message}`)
    }
    setRunning(false)
  }

  return (
    <div className="grid" style={{ marginTop: 20 }}>
      <div className="uw-head">
        <span><b>Delinquency rules</b> <span className="small">when a payment goes unpaid, outreach fires automatically — daily at 9am ET, once per rule per payment</span></span>
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <button className="btn-light" onClick={() => setAdding(a => !a)}>Add rule</button>
          <button className="btn-dark" onClick={runNow} disabled={running}>{running ? 'Running…' : 'Run rules now'}</button>
        </span>
      </div>
      {result && <div className="demo-note" style={{ margin: 12 }}>{result}</div>}
      {adding && (
        <form className="rule-form" onSubmit={addRule}>
          <label>Days past due<input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} /></label>
          <label>Channel
            <select value={channel} onChange={e => setChannel(e.target.value as 'email' | 'sms' | 'both')}>
              <option value="email">Email</option><option value="sms">Text (SMS)</option><option value="both">Email + text</option>
            </select>
          </label>
          {channel !== 'sms' && <label style={{ flex: 1 }}>Subject<input value={subject} onChange={e => setSubject(e.target.value)} /></label>}
          <label style={{ flexBasis: '100%' }}>Message <span className="small">placeholders: {'{{name}} {{company}} {{loan_number}} {{amount}} {{due_date}} {{days_late}} {{lender}}'}</span>
            <textarea rows={2} value={body} onChange={e => setBody(e.target.value)} required />
          </label>
          <button className="btn-dark">Save rule</button>
        </form>
      )}
      <table>
        <thead><tr><th>Trigger</th><th>Channel</th><th>Message</th><th>Status</th><th /></tr></thead>
        <tbody>
          {rules.map(r => (
            <tr key={r.id}>
              <td><b>{r.days_past_due}+ days past due</b></td>
              <td><span className="pill">{r.channel === 'both' ? 'email + sms' : r.channel}</span></td>
              <td className="ellipsis small" title={r.body}>{r.subject ? <b>{r.subject} — </b> : null}{r.body}</td>
              <td><span className={`status ${r.enabled ? 's-green' : 's-gray'}`}>{r.enabled ? 'Enabled' : 'Paused'}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn-light" onClick={() => toggle(r)}>{r.enabled ? 'Pause' : 'Enable'}</button>{' '}
                <button className="btn-light" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
          {!rules.length && <tr><td colSpan={5} className="small">No rules — add one to automate past-due follow-up.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export default function Outreach({ org }: { org: Org }) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [customerId, setCustomerId] = useState('')
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = () => {
    supabase.from('customers').select('*').order('name').then(({ data }) => {
      setCustomers((data as Customer[]) ?? [])
      setCustomerId(prev => prev || (data?.[0]?.id ?? ''))
    })
    supabase.from('outreach_attempts').select('*, customers(name, company)').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => setAttempts((data as Attempt[]) ?? []))
  }
  useEffect(load, [org.id])

  const customer = customers.find(c => c.id === customerId)
  const recipient = channel === 'email' ? customer?.email : customer?.phone

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customer || !recipient) { setErr(`This customer has no ${channel === 'email' ? 'email address' : 'phone number'} on file.`); return }
    setBusy(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('send-outreach', {
      body: { org_id: org.id, customer_id: customer.id, channel, recipient, subject: channel === 'email' ? subject : null, body },
    })
    setBusy(false)
    if (error || data?.error) { setErr(error?.message ?? data.error); return }
    setSubject(''); setBody('')
    load()
  }

  return (
    <>
      <h1>Customer outreach</h1>
      <p className="subtitle">Send document requests and reminders by email or text. Every attempt is logged — channel, recipient, status, and timestamp.</p>

      <div className="two-col" style={{ gridTemplateColumns: '380px 1fr' }}>
        <form className="grid compose" onSubmit={send}>
          <div className="uw-head"><span><b>Compose</b></span></div>
          <div className="compose-body">
            <label>Customer
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                {customers.map(c => <option key={c.id} value={c.id}>{c.company ?? c.name} — {c.name}</option>)}
              </select>
            </label>
            <label>Channel
              <div className="seg">
                <button type="button" className={channel === 'email' ? 'on' : ''} onClick={() => setChannel('email')}>Email</button>
                <button type="button" className={channel === 'sms' ? 'on' : ''} onClick={() => setChannel('sms')}>Text (SMS)</button>
              </div>
            </label>
            <label>To<input value={recipient ?? ''} readOnly placeholder={`No ${channel} on file`} /></label>
            {channel === 'email' && (
              <label>Subject<input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Q2 interim financials due Aug 14" /></label>
            )}
            <label>Message<textarea rows={6} required value={body} onChange={e => setBody(e.target.value)} placeholder={channel === 'sms' ? 'Reminder: your Q2 borrowing-base certificate was due Jul 20. — First National' : 'Hi Marcus, a quick reminder that…'} /></label>
            {err && <div className="demo-note">{err}</div>}
            <button className="btn-dark" disabled={busy || !customers.length} style={{ justifyContent: 'center', padding: 10 }}>
              {busy ? 'Sending…' : `Send ${channel === 'email' ? 'email' : 'text'}`}
            </button>
            <p className="small">Sends go through your Resend / Twilio accounts once their API keys are configured; until then attempts are logged as <span className="status s-blue">simulated</span>.</p>
          </div>
        </form>

        <div className="grid">
          <div className="uw-head"><span><b>Outreach log</b> <span className="small">{attempts.length} attempts</span></span></div>
          <table>
            <thead><tr><th>When</th><th>Customer</th><th>Channel</th><th>To</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>
              {attempts.map(a => (
                <tr key={a.id}>
                  <td className="small mono">{new Date(a.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="ellipsis">{a.customers?.company ?? a.customers?.name ?? '—'}</td>
                  <td><span className="pill">{a.channel === 'email' ? <Ico.text /> : <Ico.hash />}{a.channel}</span>{a.rule_id && <span className="pill" style={{ marginLeft: 4 }}>auto</span>}</td>
                  <td className="small">{a.recipient}</td>
                  <td className="ellipsis small" title={a.body}>{a.subject ? <b>{a.subject} — </b> : null}{a.body}</td>
                  <td><span className={`status ${statusCls[a.status] ?? 's-gray'}`}>{a.status}</span>{a.error && <div className="small">{a.error}</div>}</td>
                </tr>
              ))}
              {!attempts.length && <tr><td colSpan={6} className="small">No outreach yet — send your first message.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <DelinquencyRules org={org} onRan={load} />
    </>
  )
}
