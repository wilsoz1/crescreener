import { useEffect, useState } from 'react'
import { supabase, Customer, Attempt, Org } from './supabase'
import { Ico } from './Icons'

const statusCls: Record<string, string> = { sent: 's-green', simulated: 's-blue', failed: 's-red' }

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
                  <td><span className="pill">{a.channel === 'email' ? <Ico.text /> : <Ico.hash />}{a.channel}</span></td>
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
    </>
  )
}
