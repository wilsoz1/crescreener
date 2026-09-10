import { useEffect, useState } from 'react'
import Marketing from './Marketing'
import Screener from './Screener'
import Portfolio from './Portfolio'
import LoanDetail from './LoanDetail'
import Dashboard from './Dashboard'
import Loans from './Loans'
import LoanPage from './LoanPage'
import SharePage from './SharePage'
import { SignIn, Onboarding } from './Auth'
import { useSession } from './useSession'
import { supabase } from './supabase'
import { Ico } from './Icons'

const useHash = () => {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  const app = useSession()
  const route = hash.replace(/^#\//, '')
  const [section, sub, subId] = route.split('/')
  const authed = !!app.session

  // Auth-only sections bounce to sign-in.
  useEffect(() => {
    if (!app.loading && section === 'app' && !authed) window.location.hash = '#/signin'
  }, [app.loading, section, authed])

  // Public share links render standalone — no app chrome, no auth. (After all hooks.)
  if (section === 'share' && sub) {
    return (
      <>
        <div className="window-title">CRE Screener</div>
        <div className="frame"><SharePage token={sub} /></div>
      </>
    )
  }

  const appTab = section === 'app' ? (sub ?? 'dashboard') : null

  return (
    <>
      <div className="window-title">CRE Screener</div>
      <div className="frame">
        <header className="topbar">
          <a className="brand" href="#/" style={{ color: 'inherit' }}><Ico.logo /></a>
          <nav className="navlinks">
            {authed && app.org ? (
              <>
                <a href="#/app" className={appTab === 'dashboard' ? 'on' : ''}>Dashboard</a>
                <a href="#/app/loans" className={appTab === 'loans' ? 'on' : ''}>Loans</a>
                <a href="#/app/screener" className={appTab === 'screener' ? 'on' : ''}>Screener</a>
              </>
            ) : (
              <>
                <a href="#/screener" className={section === 'screener' ? 'on' : ''}>Screener demo</a>
                <a href="#/portfolio" className={section === 'portfolio' || section === 'loans' ? 'on' : ''}>Portfolio demo</a>
              </>
            )}
          </nav>
          <span className="spacer" />
          {authed ? (
            <>
              <span className="edited">{app.org?.name ?? app.session?.user.email}</span>
              <button className="btn-light" onClick={() => supabase.auth.signOut().then(() => (window.location.hash = '#/'))}>Sign out</button>
            </>
          ) : (
            <>
              <a className="btn-light" href="#/signin" style={{ textDecoration: 'none' }}>Sign in</a>
              <a className="btn-dark" href="#/signup" style={{ textDecoration: 'none' }}>Start free</a>
            </>
          )}
        </header>
        <div className={section === '' ? '' : 'page'}>
          {section === '' && <Marketing authed={authed} />}
          {section === 'signin' && <SignIn mode="signin" />}
          {section === 'signup' && <SignIn mode="signup" />}
          {section === 'screener' && <Screener org={null} />}
          {section === 'portfolio' && <Portfolio />}
          {section === 'loans' && sub && <LoanDetail id={sub} />}
          {section === 'app' && (
            app.loading ? <p className="subtitle">Loading…</p>
            : !authed ? null
            : !app.org ? <Onboarding app={app} />
            : appTab === 'loans' && subId ? <LoanPage org={app.org} loanId={subId} />
            : appTab === 'loans' ? <Loans org={app.org} />
            : appTab === 'screener' ? <Screener org={app.org} />
            : <Dashboard org={app.org} />
          )}
        </div>
      </div>
    </>
  )
}
