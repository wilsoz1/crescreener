// Shared contract between the extraction backend and the UI.
// The backend returns `fields` keyed by FIELD_DEFS keys; the UI owns labels/sections and underwriting math.

export type Field = { text: string | null; number: number | null; confidence: number; page: number | null }
export type MemoKind = 'cre_property' | 'operating_company'
export type DealSheet = {
  kind?: MemoKind // absent (older payloads) means cre_property
  source: { filename: string; pages: number; ocr: string }
  fields: Record<string, Field>
}

export type Section = 'Property' | 'Rent Roll & Occupancy' | 'Income & Expenses' | 'Pricing' | 'Loan Request' | 'Sponsor'
export type FieldDef = { key: string; label: string; section: Section; fmt?: 'money' | 'pct' | 'num' | 'x' | 'text' }

export const FIELD_DEFS: FieldDef[] = [
  { key: 'property_name', label: 'Property name', section: 'Property' },
  { key: 'address', label: 'Address', section: 'Property' },
  { key: 'property_type', label: 'Property type', section: 'Property' },
  { key: 'year_built', label: 'Year built / renovated', section: 'Property' },
  { key: 'building_sf', label: 'Building SF', section: 'Property', fmt: 'num' },
  { key: 'land_acres', label: 'Land (acres)', section: 'Property', fmt: 'num' },
  { key: 'units', label: 'Units / suites', section: 'Property', fmt: 'num' },
  { key: 'parking', label: 'Parking', section: 'Property' },
  { key: 'occupancy', label: 'Occupancy', section: 'Rent Roll & Occupancy', fmt: 'pct' },
  { key: 'tenant_count', label: 'Tenants', section: 'Rent Roll & Occupancy', fmt: 'num' },
  { key: 'anchor_tenants', label: 'Anchor / major tenants', section: 'Rent Roll & Occupancy' },
  { key: 'walt_years', label: 'WALT (years)', section: 'Rent Roll & Occupancy', fmt: 'num' },
  { key: 'avg_rent_psf', label: 'Avg in-place rent / SF', section: 'Rent Roll & Occupancy', fmt: 'money' },
  { key: 'gross_potential_rent', label: 'Gross potential rent', section: 'Income & Expenses', fmt: 'money' },
  { key: 'vacancy_loss', label: 'Vacancy & credit loss', section: 'Income & Expenses', fmt: 'money' },
  { key: 'other_income', label: 'Other income / reimbursements', section: 'Income & Expenses', fmt: 'money' },
  { key: 'effective_gross_income', label: 'Effective gross income', section: 'Income & Expenses', fmt: 'money' },
  { key: 'operating_expenses', label: 'Operating expenses', section: 'Income & Expenses', fmt: 'money' },
  { key: 'real_estate_taxes', label: 'Real estate taxes', section: 'Income & Expenses', fmt: 'money' },
  { key: 'insurance', label: 'Insurance', section: 'Income & Expenses', fmt: 'money' },
  { key: 'noi_in_place', label: 'NOI (in-place / T-12)', section: 'Income & Expenses', fmt: 'money' },
  { key: 'noi_pro_forma', label: 'NOI (pro forma / Yr 1)', section: 'Income & Expenses', fmt: 'money' },
  { key: 'purchase_price', label: 'Purchase price', section: 'Pricing', fmt: 'money' },
  { key: 'price_psf', label: 'Price / SF', section: 'Pricing', fmt: 'money' },
  { key: 'cap_rate', label: 'Cap rate (stated)', section: 'Pricing', fmt: 'pct' },
  { key: 'closing_date', label: 'Target closing', section: 'Pricing' },
  { key: 'broker', label: 'Broker / listing firm', section: 'Pricing' },
  { key: 'loan_amount', label: 'Loan request', section: 'Loan Request', fmt: 'money' },
  { key: 'loan_ltv', label: 'Requested LTV', section: 'Loan Request', fmt: 'pct' },
  { key: 'loan_term', label: 'Requested term / amortization', section: 'Loan Request' },
  { key: 'rate_request', label: 'Rate request / assumption', section: 'Loan Request' },
  { key: 'equity', label: 'Sponsor equity', section: 'Loan Request', fmt: 'money' },
  { key: 'use_of_proceeds', label: 'Use of proceeds', section: 'Loan Request' },
  { key: 'sponsor', label: 'Sponsor / borrower entity', section: 'Sponsor' },
  { key: 'sponsor_experience', label: 'Sponsor track record', section: 'Sponsor' },
  { key: 'guarantor', label: 'Guarantor(s)', section: 'Sponsor' },
  { key: 'sponsor_net_worth', label: 'Guarantor net worth', section: 'Sponsor', fmt: 'money' },
  { key: 'sponsor_liquidity', label: 'Guarantor liquidity', section: 'Sponsor', fmt: 'money' },
]

export const SECTIONS: Section[] = ['Property', 'Rent Roll & Occupancy', 'Income & Expenses', 'Pricing', 'Loan Request', 'Sponsor']

// ——— Operating-company track: a business (practice) and its spread, not a building ———

export type BizSection = 'Company' | 'Financials — latest year' | 'Prior year' | 'Loan Request' | 'Guarantors'
export type BizFieldDef = { key: string; label: string; section: BizSection; fmt?: 'money' | 'pct' | 'num' | 'x' | 'text' }

export const BIZ_FIELD_DEFS: BizFieldDef[] = [
  { key: 'company_name', label: 'Company', section: 'Company' },
  { key: 'entity_type', label: 'Entity type', section: 'Company' },
  { key: 'industry', label: 'Industry / specialty', section: 'Company' },
  { key: 'address', label: 'Address', section: 'Company' },
  { key: 'year_founded', label: 'Founded / operating since', section: 'Company' },
  { key: 'locations', label: 'Locations', section: 'Company' },
  { key: 'owners', label: 'Owners', section: 'Company' },
  { key: 'employee_count', label: 'Employees', section: 'Company', fmt: 'num' },
  { key: 'period_latest', label: 'Period', section: 'Financials — latest year' },
  { key: 'revenue', label: 'Revenue / gross receipts', section: 'Financials — latest year', fmt: 'money' },
  { key: 'cogs', label: 'Cost of goods sold', section: 'Financials — latest year', fmt: 'money' },
  { key: 'operating_expenses', label: 'Operating expenses', section: 'Financials — latest year', fmt: 'money' },
  { key: 'officer_comp', label: 'Officer compensation', section: 'Financials — latest year', fmt: 'money' },
  { key: 'ebitda', label: 'EBITDA', section: 'Financials — latest year', fmt: 'money' },
  { key: 'depreciation', label: 'Depreciation & amort.', section: 'Financials — latest year', fmt: 'money' },
  { key: 'interest_expense', label: 'Interest expense', section: 'Financials — latest year', fmt: 'money' },
  { key: 'net_income', label: 'Net / ordinary income', section: 'Financials — latest year', fmt: 'money' },
  { key: 'distributions', label: 'Distributions', section: 'Financials — latest year', fmt: 'money' },
  { key: 'total_debt', label: 'Total debt', section: 'Financials — latest year', fmt: 'money' },
  { key: 'tangible_net_worth', label: 'Tangible net worth', section: 'Financials — latest year', fmt: 'money' },
  { key: 'period_prior', label: 'Period', section: 'Prior year' },
  { key: 'revenue_prior', label: 'Revenue', section: 'Prior year', fmt: 'money' },
  { key: 'ebitda_prior', label: 'EBITDA', section: 'Prior year', fmt: 'money' },
  { key: 'net_income_prior', label: 'Net income', section: 'Prior year', fmt: 'money' },
  { key: 'loan_amount', label: 'Loan request', section: 'Loan Request', fmt: 'money' },
  { key: 'loan_purpose', label: 'Purpose', section: 'Loan Request' },
  { key: 'loan_term', label: 'Requested term / amortization', section: 'Loan Request' },
  { key: 'rate_request', label: 'Rate request', section: 'Loan Request' },
  { key: 'equity_injection', label: 'Equity injection', section: 'Loan Request', fmt: 'money' },
  { key: 'collateral_offered', label: 'Collateral offered', section: 'Loan Request' },
  { key: 'guarantor', label: 'Guarantor(s)', section: 'Guarantors' },
  { key: 'guarantor_net_worth', label: 'Guarantor net worth', section: 'Guarantors', fmt: 'money' },
  { key: 'guarantor_liquidity', label: 'Guarantor liquidity', section: 'Guarantors', fmt: 'money' },
]

export const SECTIONS_BIZ: BizSection[] = ['Company', 'Financials — latest year', 'Prior year', 'Loan Request', 'Guarantors']

// ——— Underwriting (deterministic; bank policy defaults are editable in the UI) ———

export type Policy = { maxLtv: number; minDscr: number; minDebtYield: number; rate: number; amortYears: number; maxLeverage: number }
export const DEFAULT_POLICY: Policy = { maxLtv: 0.75, minDscr: 1.25, minDebtYield: 0.085, rate: 0.0675, amortYears: 25, maxLeverage: 4 }

export type Metric = { label: string; value: string; test?: string; status: 'pass' | 'fail' | 'na' }

const annualDebtService = (loan: number, rate: number, years: number) => {
  const r = rate / 12, n = years * 12
  return (loan * r / (1 - Math.pow(1 + r, -n))) * 12
}

// Operating company: the loan is repaid by business cash flow, so the tests are
// DSCR on EBITDA, post-close leverage, margin and trend — not LTV and cap rate.
export function underwriteBiz(fields: Record<string, Field>, p: Policy): Metric[] {
  const n = (k: string) => fields[k]?.number ?? null
  const loan = n('loan_amount'), ebitda = n('ebitda'), rev = n('revenue')
  const dist = n('distributions'), debt = n('total_debt'), revPrior = n('revenue_prior')
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`

  const ds = loan ? annualDebtService(loan, p.rate, p.amortYears) : null
  const dscr = ds && ebitda ? ebitda / ds : null
  const fcc = ds && ebitda != null && dist != null ? (ebitda - dist) / ds : null
  const lev = ebitda && debt != null && loan != null ? (debt + loan) / ebitda : null
  const margin = rev && ebitda != null ? ebitda / rev : null
  const growth = rev && revPrior ? rev / revPrior - 1 : null
  const maxLoanDscr = ebitda ? (ebitda / p.minDscr) / annualDebtService(1, p.rate, p.amortYears) : null

  return [
    { label: 'DSCR (EBITDA)', value: dscr ? `${dscr.toFixed(2)}x` : '—', test: `≥ ${p.minDscr.toFixed(2)}x @ ${pct(p.rate)} / ${p.amortYears}-yr`, status: dscr ? (dscr >= p.minDscr ? 'pass' : 'fail') : 'na' },
    { label: 'Fixed-charge coverage', value: fcc ? `${fcc.toFixed(2)}x` : '—', test: '(EBITDA − distributions) ÷ debt service', status: fcc ? (fcc >= 1.2 ? 'pass' : 'fail') : 'na' },
    { label: 'Post-close Debt / EBITDA', value: lev ? `${lev.toFixed(2)}x` : '—', test: `≤ ${p.maxLeverage.toFixed(2)}x`, status: lev ? (lev <= p.maxLeverage ? 'pass' : 'fail') : 'na' },
    { label: 'EBITDA margin', value: margin ? pct(margin) : '—', status: 'na' },
    { label: 'Revenue growth (YoY)', value: growth != null ? pct(growth) : '—', status: 'na' },
    { label: 'Annual debt service', value: ds ? money(ds) : '—', status: 'na' },
    { label: 'Max supportable loan', value: maxLoanDscr ? money(maxLoanDscr) : '—', test: 'DSCR constraint', status: maxLoanDscr && loan ? (loan <= maxLoanDscr ? 'pass' : 'fail') : 'na' },
  ]
}

export function underwrite(fields: Record<string, Field>, p: Policy): Metric[] {
  const n = (k: string) => fields[k]?.number ?? null
  const price = n('purchase_price'), loan = n('loan_amount')
  const noi = n('noi_in_place') ?? n('noi_pro_forma')
  const sf = n('building_sf'), egi = n('effective_gross_income'), opex = n('operating_expenses')
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const money = (v: number) => `$${Math.round(v).toLocaleString()}`

  const ltv = price && loan ? loan / price : null
  const cap = price && noi ? noi / price : null
  const ds = loan ? annualDebtService(loan, p.rate, p.amortYears) : null
  const dscr = ds && noi ? noi / ds : null
  const dy = loan && noi ? noi / loan : null
  const maxLoanLtv = price ? price * p.maxLtv : null
  const maxLoanDscr = noi ? (noi / p.minDscr) / annualDebtService(1, p.rate, p.amortYears) : null
  const maxLoan = maxLoanLtv && maxLoanDscr ? Math.min(maxLoanLtv, maxLoanDscr) : null
  const beo = egi && opex && ds ? (opex + ds) / egi : null

  return [
    { label: 'Loan-to-value', value: ltv ? pct(ltv) : '—', test: `≤ ${pct(p.maxLtv)}`, status: ltv ? (ltv <= p.maxLtv ? 'pass' : 'fail') : 'na' },
    { label: 'DSCR', value: dscr ? `${dscr.toFixed(2)}x` : '—', test: `≥ ${p.minDscr.toFixed(2)}x @ ${pct(p.rate)} / ${p.amortYears}-yr`, status: dscr ? (dscr >= p.minDscr ? 'pass' : 'fail') : 'na' },
    { label: 'Debt yield', value: dy ? pct(dy) : '—', test: `≥ ${pct(p.minDebtYield)}`, status: dy ? (dy >= p.minDebtYield ? 'pass' : 'fail') : 'na' },
    { label: 'Going-in cap rate', value: cap ? pct(cap) : '—', test: 'NOI ÷ price', status: 'na' },
    { label: 'Annual debt service', value: ds ? money(ds) : '—', status: 'na' },
    { label: 'Break-even occupancy', value: beo ? pct(beo) : '—', test: '(opex + debt service) ÷ EGI', status: beo ? (beo <= 0.85 ? 'pass' : 'fail') : 'na' },
    { label: 'Price / SF', value: price && sf ? money(price / sf) : '—', status: 'na' },
    { label: 'Max supportable loan', value: maxLoan ? money(maxLoan) : '—', test: 'lesser of LTV & DSCR constraints', status: maxLoan && loan ? (loan <= maxLoan ? 'pass' : 'fail') : 'na' },
  ]
}
