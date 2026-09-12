// App-wide dialogs and toasts: promise-based replacements for window.confirm / window.prompt,
// plus a toast() for action feedback. Mount <DialogHost /> once at the root.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type DialogSpec = {
  kind: 'confirm' | 'prompt'
  title: string
  body?: string
  label?: string
  initial?: string
  danger?: boolean
  confirmText?: string
  resolve: (v: string | boolean | null) => void
}

let pushDialog: ((d: DialogSpec) => void) | null = null
let pushToast: ((msg: string) => void) | null = null

export const confirmDialog = (title: string, body?: string, opts?: { danger?: boolean; confirmText?: string }) =>
  new Promise<boolean>(resolve => {
    if (!pushDialog) { resolve(window.confirm(`${title}\n${body ?? ''}`)); return }
    pushDialog({ kind: 'confirm', title, body, danger: opts?.danger, confirmText: opts?.confirmText, resolve: v => resolve(!!v) })
  })

export const promptDialog = (title: string, label: string, opts?: { body?: string; initial?: string; confirmText?: string }) =>
  new Promise<string | null>(resolve => {
    if (!pushDialog) { resolve(window.prompt(`${title}\n${label}`, opts?.initial ?? '')); return }
    pushDialog({ kind: 'prompt', title, label, body: opts?.body, initial: opts?.initial, confirmText: opts?.confirmText, resolve: v => resolve(typeof v === 'string' ? v : null) })
  })

export const toast = (msg: string) => pushToast?.(msg)

/** Name of the signed-in user, for auto-filling approver/preparer fields. */
export async function currentUserName(): Promise<string> {
  const user = (await supabase.auth.getUser()).data.user
  return (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown'
}

export function DialogHost() {
  const [dialog, setDialog] = useState<DialogSpec | null>(null)
  const [value, setValue] = useState('')
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([])

  useEffect(() => {
    pushDialog = d => { setDialog(d); setValue(d.initial ?? '') }
    pushToast = msg => {
      const id = Date.now() + Math.random()
      setToasts(t => [...t, { id, msg }])
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
    }
    return () => { pushDialog = null; pushToast = null }
  }, [])

  const close = (v: string | boolean | null) => {
    dialog?.resolve(v)
    setDialog(null)
  }

  return (
    <>
      {dialog && (
        <div className="dlg-overlay" onClick={() => close(dialog.kind === 'confirm' ? false : null)}>
          <form
            className="dlg" onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); close(dialog.kind === 'prompt' ? value : true) }}
          >
            <b>{dialog.title}</b>
            {dialog.body && <p className="small" style={{ margin: '6px 0 0' }}>{dialog.body}</p>}
            {dialog.kind === 'prompt' && (
              <label className="dlg-label">{dialog.label}
                <input autoFocus required value={value} onChange={e => setValue(e.target.value)} />
              </label>
            )}
            <div className="dlg-actions">
              <button type="button" className="btn-light" onClick={() => close(dialog.kind === 'confirm' ? false : null)}>Cancel</button>
              <button type="submit" className="btn-dark" style={dialog.danger ? { background: 'var(--red)' } : undefined} autoFocus={dialog.kind === 'confirm'}>
                {dialog.confirmText ?? (dialog.kind === 'confirm' ? 'Confirm' : 'Save')}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => <div className="toast" key={t.id}>{t.msg}</div>)}
      </div>
    </>
  )
}

/** Skeleton loader rows for list pages. */
export const Skeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="grid" aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="skel-row"><span style={{ width: `${55 + ((i * 17) % 35)}%` }} /></div>
    ))}
  </div>
)
