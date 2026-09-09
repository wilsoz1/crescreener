import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase, Org } from './supabase'

export type AppSession = { loading: boolean; session: Session | null; org: Org | null; refreshOrg: () => void }

export function useSession(): AppSession {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setOrg(null); setLoading(false); return }
    setLoading(true)
    supabase
      .from('org_members')
      .select('orgs(id, name, invite_code)')
      .limit(1)
      .then(({ data }) => {
        const row = data?.[0] as { orgs: Org } | undefined
        setOrg(row?.orgs ?? null)
        setLoading(false)
      })
  }, [session, tick])

  return { loading, session, org, refreshOrg: () => setTick(t => t + 1) }
}
