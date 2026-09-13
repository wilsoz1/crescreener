import { DealSheet } from './types'

// What the backend returns for the bundled sample offering memorandum (used in demo mode
// when no extraction API is configured, and by the server's MOCK_OCR path).
const f = (text: string | null, number: number | null, confidence: number, page: number | null) => ({ text, number, confidence, page })

export const SAMPLE_DEAL: DealSheet = {
  source: { filename: 'Mesa_Ridge_Dental_OM.pdf', pages: 38, ocr: 'Unlimited-OCR · Multi page parsing · 38 pages · 41.2s' },
  fields: {
    property_name: f('Mesa Ridge Dental Building', null, 0.99, 1),
    address: f('1850 E Warner Rd, Tempe, AZ 85284', null, 0.98, 1),
    property_type: f('Owner-occupied dental office — 70% owner, 2 leased suites', null, 0.97, 3),
    year_built: f('2004 / renovated 2019', null, 0.95, 4),
    building_sf: f('12,400 SF', 12400, 0.98, 4),
    land_acres: f('1.4 acres', 1.4, 0.96, 4),
    units: f('4 suites (8 operatories in owner suite)', 4, 0.97, 12),
    parking: f('62 spaces (5.0 / 1,000 SF)', null, 0.94, 4),
    occupancy: f('100% — owner suite + 2 tenants', 1.0, 0.97, 12),
    tenant_count: f('2 tenants (oral surgeon · orthodontist)', 2, 0.96, 12),
    anchor_tenants: f('East Valley Oral Surgery (2,200 SF, exp. 2031) · Warner Rd Orthodontics (1,500 SF, exp. 2029)', null, 0.95, 12),
    walt_years: f('4.6 years', 4.6, 0.9, 13),
    avg_rent_psf: f('$28.50 / SF NNN (tenant suites)', 28.5, 0.93, 13),
    gross_potential_rent: f('$105,450 (tenant suites)', 105450, 0.97, 18),
    vacancy_loss: f('($0) — fully occupied', 0, 0.95, 18),
    other_income: f('$31,200 — NNN reimbursements', 31200, 0.94, 18),
    effective_gross_income: f('$136,650 (excl. owner practice)', 136650, 0.97, 18),
    operating_expenses: f('$91,000 — $7.34 / SF', 91000, 0.96, 19),
    real_estate_taxes: f('$34,100', 34100, 0.98, 19),
    insurance: f('$12,800', 12800, 0.97, 19),
    noi_in_place: f('$412,400 practice EBITDA + rents (T-12 Jun 2026)', 412400, 0.97, 18),
    noi_pro_forma: f('$448,000 (Year 1 — 2 added operatories)', 448000, 0.91, 20),
    purchase_price: f('$4,350,000', 4350000, 0.99, 2),
    price_psf: f('$350.81 / SF', 350.81, 0.96, 2),
    cap_rate: f('9.48% on practice cash flow', 0.0948, 0.96, 2),
    closing_date: f('October 15, 2026', null, 0.88, 2),
    broker: f('Practice Transitions Group, Phoenix', null, 0.97, 1),
    loan_amount: f('$3,250,000', 3250000, 0.98, 26),
    loan_ltv: f('74.7%', 0.747, 0.95, 26),
    loan_term: f('10-year term / 25-year amortization', null, 0.94, 26),
    rate_request: f('SOFR + 250 bps or 6.50% fixed, 5-yr reset', null, 0.86, 26),
    equity: f('$1,100,000 (25.3%)', 1100000, 0.95, 26),
    use_of_proceeds: f('Building acquisition; $350K for 2 operatory build-outs & CBCT imaging', null, 0.9, 27),
    sponsor: f('Summit Smiles Dental Group PLLC (Arizona PLLC)', null, 0.98, 30),
    sponsor_experience: f('3 locations · 22 operatories across AZ since 2014 · 2 prior owner-occupied buildings', null, 0.9, 30),
    guarantor: f('Dr. Ramona Delgado DDS (60%) · Dr. Mei Chen DMD (40%) — joint & several', null, 0.93, 31),
    sponsor_net_worth: f('$8,400,000 combined', 8400000, 0.84, 31),
    sponsor_liquidity: f('$1,100,000 combined', 1100000, 0.84, 31),
  },
}
