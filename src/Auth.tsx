import { useState } from 'react'
import { supabase } from './supabase'
import { AppSession } from './useSession'

export function SignIn({ mode }: { mode: 'signin' | 'signup' }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } =
      mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } })
        : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErr(error.message)
    else window.location.hash = '#/app'
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <h2>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h2>
        <p className="small" style={{ marginBottom: 18 }}>
          {mode === 'signup' ? 'Free while in early access — no card required.' : 'Welcome back.'}
        </p>
        {mode === 'signup' && (
          <label>Full name<input value={name} onChange={e => setName(e.target.value)} required placeholder="Jane Rivera" /></label>
        )}
        <label>Work email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@yourbank.com" /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="8+ characters" /></label>
        {err && <div className="demo-note">{err}</div>}
        <button className="btn-dark" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: 10 }}>
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
        <p className="small" style={{ marginTop: 14 }}>
          {mode === 'signup'
            ? <>Already have an account? <a href="#/signin">Sign in</a></>
            : <>New here? <a href="#/signup">Create an account</a></>}
        </p>
      </form>
    </div>
  )
}

// After auth but before org membership: create a bank workspace or join by invite code.
export function Onboarding({ app }: { app: AppSession }) {
  const [orgName, setOrgName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: 'create_org' | 'join_org', args: Record<string, string>) => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) setErr(error.message)
    else { app.refreshOrg(); window.location.hash = '#/app' }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h2>Set up your workspace</h2>
        <p className="small" style={{ marginBottom: 18 }}>Create your bank's workspace (seeded with a demo portfolio) or join a teammate's with an invite code.</p>
        <form onSubmit={e => { e.preventDefault(); run('create_org', { p_name: orgName }) }}>
          <label>Bank / organization name<input value={orgName} onChange={e => setOrgName(e.target.value)} required placeholder="First National Demo Bank" /></label>
          <button className="btn-dark" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: 10 }}>Create workspace</button>
        </form>
        <div className="auth-divider">or</div>
        <form onSubmit={e => { e.preventDefault(); run('join_org', { p_code: code }) }}>
          <label>Invite code<input value={code} onChange={e => setCode(e.target.value)} required placeholder="e.g. 4f2a9c1b" /></label>
          <button className="btn-light" disabled={busy} style={{ width: '100%', justifyContent: 'center', padding: 10 }}>Join existing workspace</button>
        </form>
        {err && <div className="demo-note" style={{ marginTop: 12 }}>{err}</div>}
      </div>
    </div>
  )
}
