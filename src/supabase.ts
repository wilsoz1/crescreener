import { createClient } from '@supabase/supabase-js'

// The anon key is public by design; all data access is gated by RLS.
export const supabase = createClient(
  'https://ngmpmyuwacwbwtqtinos.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nbXBteXV3YWN3Ynd0cXRpbm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTY1NDQsImV4cCI6MjEwNDU3MjU0NH0.bwtntQy3JLw7ytM2obVWk3WBGS_7bjwRKcYB43pCFuw',
)

export type Org = { id: string; name: string; invite_code: string }
export type Customer = { id: string; name: string; company: string | null; email: string | null; phone: string | null }
export type PaymentType = 'P&I' | 'I/O' | 'Deferred' | 'I/O Deferred' | 'Construction'
export type DbLoan = {
  id: string; loan_number: string; type: string; stage: string; amount: number; rate: string | null
  term: string | null; ltv: number | null; dscr: number | null; maturity: string | null
  collateral: string | null; rm: string | null; payment_type: PaymentType
  draw_period_end: string | null; origination_date: string | null; customer_id: string | null
  customers: { name: string; company: string | null; email: string | null; phone: string | null } | null
}
export type ShareLink = {
  id: string; token: string; institution: string; expires_at: string; revoked: boolean
  access_count: number; last_accessed_at: string | null; created_at: string
}
export type Deposit = { id: string; account_name: string; type: string; balance: number; opened: string | null; customers: { company: string | null; name: string } | null }
export type CreditLine = { id: string; name: string; commitment: number; outstanding: number; rate: string | null; maturity: string | null; customers: { company: string | null; name: string } | null }
export type Attempt = { id: string; channel: string; recipient: string; subject: string | null; body: string; status: string; error: string | null; created_at: string; customers: { name: string; company: string | null } | null }
export type Doc = { id: string; filename: string; doc_type: string; confidence: number; status: string; created_at: string; loan_id: string | null; loans: { loan_number: string } | null; customers: { company: string | null } | null }

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`
