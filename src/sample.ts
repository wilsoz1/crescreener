import { DealSheet } from './types'

// What the backend returns for the bundled sample offering memorandum (used in demo mode
// when no extraction API is configured, and by the server's MOCK_OCR path).
const f = (text: string | null, number: number | null, confidence: number, page: number | null) => ({ text, number, confidence, page })

export const SAMPLE_DEAL: DealSheet = {
  source: { filename: 'Lakeside_Crossing_OM.pdf', pages: 38, ocr: 'Unlimited-OCR · Multi page parsing · 38 pages · 41.2s' },
  fields: {
    property_name: f('Lakeside Crossing Shopping Center', null, 0.99, 1),
    address: f('1850 E Warner Rd, Tempe, AZ 85284', null, 0.98, 1),
    property_type: f('Neighborhood retail center — grocery-anchored', null, 0.97, 3),
    year_built: f('2004 / renovated 2019', null, 0.95, 4),
    building_sf: f('62,400 SF', 62400, 0.98, 4),
    land_acres: f('6.8 acres', 6.8, 0.96, 4),
    units: f('18 suites', 18, 0.97, 12),
    parking: f('312 spaces (5.0 / 1,000 SF)', null, 0.94, 4),
    occupancy: f('93.2%', 0.932, 0.97, 12),
    tenant_count: f('16 tenants', 16, 0.96, 12),
    anchor_tenants: f('Sprouts Farmers Market (24,500 SF, exp. 2033) · Ace Hardware (9,800 SF, exp. 2030)', null, 0.95, 12),
    walt_years: f('5.8 years', 5.8, 0.9, 13),
    avg_rent_psf: f('$19.75 / SF NNN', 19.75, 0.93, 13),
    gross_potential_rent: f('$1,232,400', 1232400, 0.97, 18),
    vacancy_loss: f('($84,000) — 6.8%', 84000, 0.95, 18),
    other_income: f('$362,000 — NNN reimbursements', 362000, 0.94, 18),
    effective_gross_income: f('$1,510,400', 1510400, 0.97, 18),
    operating_expenses: f('$458,000 — $7.34 / SF', 458000, 0.96, 19),
    real_estate_taxes: f('$171,000', 171000, 0.98, 19),
    insurance: f('$38,500', 38500, 0.97, 19),
    noi_in_place: f('$1,052,400 (T-12 Jun 2026)', 1052400, 0.97, 18),
    noi_pro_forma: f('$1,098,000 (Year 1)', 1098000, 0.91, 20),
    purchase_price: f('$14,200,000', 14200000, 0.99, 2),
    price_psf: f('$227.56 / SF', 227.56, 0.96, 2),
    cap_rate: f('7.41% on T-12 NOI', 0.0741, 0.96, 2),
    closing_date: f('October 15, 2026', null, 0.88, 2),
    broker: f('CBRE — National Retail Partners, Phoenix', null, 0.97, 1),
    loan_amount: f('$9,500,000', 9500000, 0.98, 26),
    loan_ltv: f('66.9%', 0.669, 0.95, 26),
    loan_term: f('10-year term / 25-year amortization', null, 0.94, 26),
    rate_request: f('SOFR + 250 bps or 6.50% fixed, 5-yr reset', null, 0.86, 26),
    equity: f('$4,700,000 (33.1%)', 4700000, 0.95, 26),
    use_of_proceeds: f('Acquisition; $350K capital reserve for TI/LC', null, 0.9, 27),
    sponsor: f('Saguaro Retail Partners LLC (Arizona LLC)', null, 0.98, 30),
    sponsor_experience: f('14 retail assets · 1.1MM SF across AZ / NV since 2011 · 3 prior grocery-anchored centers', null, 0.9, 30),
    guarantor: f('Ramon Delgado (60%) · Mei Chen (40%) — joint & several', null, 0.93, 31),
    sponsor_net_worth: f('$22,400,000 combined', 22400000, 0.84, 31),
    sponsor_liquidity: f('$3,100,000 combined', 3100000, 0.84, 31),
  },
}
