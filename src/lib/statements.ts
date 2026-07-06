import type { Dataset, Ledger } from './types'

// ============================================================================
// Schedule III (Companies Act 2013) draft financial statements — Balance Sheet,
// Statement of P&L / Income & Expenditure, and Notes.
//
// Ported from dhruvdua88/tally-fin-statements (financial_statements.py).
// Adapted to THIS app's sign convention: balances are CONVENTIONAL (Dr = +,
// Cr = −). The reference uses raw Tally (Dr = −), so every asset formula that
// negates there is a plain sum here, and every liability formula is negated.
//
// Balancing method (from the reference): equity carries the FULL cumulative
// P&L A/c balance; the residual (off-journal / rounding) is shown as a single
// "Year-end reconciliation" plug so the face always balances. The size of that
// plug is the quality indicator.
// ============================================================================

export interface StmtLine {
  key: string
  label: string
  note?: number
  amount: number
  bold?: boolean
  muted?: boolean
}
export interface NoteLedger { name: string; amount: number; group?: boolean; sub?: boolean }
export interface StmtNote {
  no: number
  title: string
  faceKey: string
  rows: NoteLedger[]
  total: number
}
export interface StmtValidation { severity: 'error' | 'warning' | 'info'; category: string; message: string }

export interface FinStatements {
  company: string
  periodFrom: string
  periodTo: string
  bs: {
    equityLiab: StmtLine[]
    assets: StmtLine[]
    totalEquityLiab: number   // printed (== totalAssets via plug)
    totalAssets: number
    plug: number
    plugPct: number
  }
  pnl: StmtLine[]
  pnlSummary: { revenue: number; otherIncome: number; totalRevenue: number; totalExpenses: number; pbt: number; tax: number; pat: number; currentYearProfit: number }
  notes: StmtNote[]
  validations: StmtValidation[]
}

const PL_LEDGER_RE = /profit\s*(&|and)?\s*loss|p\s*&\s*l\b|p\s*and\s*l\b/i
const DEFERRED_TAX_RE = /deferred\s*tax/i
const FINANCE_PARENTS = ['Finance Costs', 'Finance Cost', 'Interest & Late Filing Fees', 'Interest', 'Bank Charges']
const EMPLOYEE_PARENTS = ['Employee benefit expenses', 'Contribution to Provident Funds & Others', 'Salary', 'Salaries', 'Staff Salary', 'Staff Welfare']

export function computeStatements(ds: Dataset): FinStatements {
  // ledgers excluding the P&L A/c control ledger (retained earnings)
  const plLedger = ds.ledgers.find((l) => PL_LEDGER_RE.test(l.name) && !/payable|provision|charges/i.test(l.name))
  const led = ds.ledgers.filter((l) => l !== plLedger)

  const byPg = (pg: string) => led.filter((l) => l.primaryGroup === pg)
  const sumC = (pg: string) => byPg(pg).reduce((s, l) => s + l.closingBalance, 0) // signed Dr+/Cr−
  const assetVal = (...pgs: string[]) => pgs.reduce((s, pg) => s + sumC(pg), 0)    // Dr+ ⇒ +ve asset
  const liabVal = (...pgs: string[]) => pgs.reduce((s, pg) => s - sumC(pg), 0)     // Cr− ⇒ +ve liability

  // ---- retained earnings from the P&L A/c ledger (credit ⇒ negative closing) ----
  const pnlBalance = plLedger ? -plLedger.closingBalance : 0   // positive = accumulated surplus
  const pnlOpening = plLedger ? -plLedger.openingBalance : 0
  const currentYearProfit = pnlBalance - pnlOpening

  // ---- deferred tax (name-detected) ----
  const dtLedger = led.find((l) => DEFERRED_TAX_RE.test(l.name))
  const dtRaw = dtLedger ? -dtLedger.closingBalance : 0        // +ve ⇒ liability (DTL), −ve ⇒ asset (DTA)
  const dtl = Math.max(0, dtRaw)
  const dta = Math.max(0, -dtRaw)

  // ---- capital account split (reserves live inside it too) ----
  const capital = byPg('Capital Account')
  const shareCapital = -capital.filter((l) => !/reserve/i.test(l.name) && !/profit/i.test(l.name)).reduce((s, l) => s + l.closingBalance, 0)
  const capitalReserves = -capital.filter((l) => /reserve/i.test(l.name)).reduce((s, l) => s + l.closingBalance, 0)

  // ---- bank accounts sign split (credit balance = OD/borrowing) ----
  const banks = byPg('Bank Accounts')
  const bankDebit = banks.filter((l) => l.closingBalance > 0).reduce((s, l) => s + l.closingBalance, 0)   // cash asset
  const bankCredit = banks.filter((l) => l.closingBalance < 0).reduce((s, l) => s - l.closingBalance, 0)  // OD liability (positive)

  // ---- reclassify net-wrong-side balances for a clean draft face --------
  // (moves an equal amount to both sides, so the Balance Sheet still ties)
  const debtors = byPg('Sundry Debtors')
  const receivablesAsset = debtors.filter((l) => l.closingBalance > 0).reduce((s, l) => s + l.closingBalance, 0)     // real receivable (Dr)
  const advancesFromCustomers = debtors.filter((l) => l.closingBalance < 0).reduce((s, l) => s - l.closingBalance, 0) // Cr in debtor = customer advance (liability)
  const creditors = byPg('Sundry Creditors')
  const payablesLiab = creditors.filter((l) => l.closingBalance < 0).reduce((s, l) => s - l.closingBalance, 0)        // real payable (Cr)
  const advancesToVendors = creditors.filter((l) => l.closingBalance > 0).reduce((s, l) => s + l.closingBalance, 0)   // Dr in creditor = vendor advance (asset)

  const dutiesRaw = liabVal('Duties & Taxes')  // +ve = net payable, −ve = net recoverable
  const dutiesPayable = Math.max(0, dutiesRaw)
  const dutiesRecoverable = Math.max(0, -dutiesRaw)

  // ========================= BALANCE SHEET ==============================
  const reserves = liabVal('Reserves & Surplus') + capitalReserves + pnlBalance
  const ltBorrow = liabVal('Secured Loans', 'Unsecured Loans', 'Loans (Liability)')
  const stBorrow = liabVal('Bank OD A/c') + bankCredit
  const tradePay = payablesLiab
  const otherCL = liabVal('Current Liabilities', 'Branch / Divisions', 'Suspense A/c') - dtl + advancesFromCustomers + dutiesPayable
  const provisions = liabVal('Provisions')

  const fixedAssets = assetVal('Fixed Assets')
  const investments = assetVal('Investments')
  const ltLoans = assetVal('Deposits (Asset)', 'Loans & Advances (Asset)')
  const otherNCA = assetVal('Misc. Expenses (ASSET)')
  const inventories = assetVal('Stock-in-hand')
  const receivables = receivablesAsset
  const cashBank = assetVal('Cash-in-hand') + bankDebit
  const otherCA = assetVal('Current Assets') + advancesToVendors + dutiesRecoverable

  const totalEquity = shareCapital + reserves
  const totalNCL = ltBorrow + dtl
  const totalCL = stBorrow + tradePay + otherCL + provisions
  const totalEquityLiabRaw = totalEquity + totalNCL + totalCL

  const totalNCA = fixedAssets + investments + ltLoans + dta + otherNCA
  const totalCA = inventories + receivables + cashBank + otherCA
  const totalAssets = totalNCA + totalCA

  const plug = totalAssets - totalEquityLiabRaw
  const plugPct = Math.abs(totalAssets) > 1 ? (Math.abs(plug) / Math.abs(totalAssets)) * 100 : 0

  const equityLiab: StmtLine[] = [
    { key: 'h_eq', label: 'EQUITY', amount: NaN, bold: true },
    { key: 'sharecap', label: 'Share Capital / Corpus', note: 1, amount: shareCapital },
    { key: 'reserves', label: 'Reserves & Surplus', note: 2, amount: reserves },
    { key: 't_eq', label: 'Total Equity', amount: totalEquity, bold: true },
    { key: 'h_ncl', label: 'NON-CURRENT LIABILITIES', amount: NaN, bold: true },
    { key: 'ltborrow', label: 'Long-Term Borrowings', note: 3, amount: ltBorrow },
    ...(dtl ? [{ key: 'dtl', label: 'Deferred Tax Liability', amount: dtl }] : []),
    { key: 't_ncl', label: 'Total Non-Current Liabilities', amount: totalNCL, bold: true },
    { key: 'h_cl', label: 'CURRENT LIABILITIES', amount: NaN, bold: true },
    { key: 'stborrow', label: 'Short-Term Borrowings', note: 4, amount: stBorrow },
    { key: 'tradepay', label: 'Trade Payables', note: 5, amount: tradePay },
    { key: 'othercl', label: 'Other Current Liabilities', note: 6, amount: otherCL },
    { key: 'provisions', label: 'Short-Term Provisions', note: 7, amount: provisions },
    { key: 'plug', label: 'Year-end reconciliation (auto-balance)', amount: plug, muted: true },
    { key: 't_cl', label: 'Total Current Liabilities', amount: totalCL + plug, bold: true },
    { key: 'total_el', label: 'TOTAL EQUITY & LIABILITIES', amount: totalAssets, bold: true },
  ]
  const assets: StmtLine[] = [
    { key: 'h_nca', label: 'NON-CURRENT ASSETS', amount: NaN, bold: true },
    { key: 'fa', label: 'Fixed Assets (Net Block)', note: 8, amount: fixedAssets },
    { key: 'inv', label: 'Non-Current Investments', note: 9, amount: investments },
    { key: 'ltloans', label: 'Long-Term Loans & Advances', note: 10, amount: ltLoans },
    ...(dta ? [{ key: 'dta', label: 'Deferred Tax Asset', amount: dta }] : []),
    ...(otherNCA ? [{ key: 'onca', label: 'Other Non-Current Assets', amount: otherNCA }] : []),
    { key: 't_nca', label: 'Total Non-Current Assets', amount: totalNCA, bold: true },
    { key: 'h_ca', label: 'CURRENT ASSETS', amount: NaN, bold: true },
    { key: 'stock', label: 'Inventories', note: 11, amount: inventories },
    { key: 'recv', label: 'Trade Receivables', note: 12, amount: receivables },
    { key: 'cash', label: 'Cash & Cash Equivalents', note: 13, amount: cashBank },
    { key: 'otherca', label: 'Other Current Assets', note: 14, amount: otherCA },
    { key: 't_ca', label: 'Total Current Assets', amount: totalCA, bold: true },
    { key: 'total_assets', label: 'TOTAL ASSETS', amount: totalAssets, bold: true },
  ]

  // ============================ P&L =====================================
  const revVal = (...pgs: string[]) => pgs.reduce((s, pg) => s - sumC(pg), 0) // income Cr− ⇒ +ve
  const expVal = (...pgs: string[]) => pgs.reduce((s, pg) => s + sumC(pg), 0) // expense Dr+ ⇒ +ve

  const revenue = revVal('Sales Accounts', 'Direct Incomes')
  const otherIncome = revVal('Indirect Incomes')
  const totalRevenue = revenue + otherIncome

  const purchases = expVal('Purchase Accounts')
  const directExp = expVal('Direct Expenses')
  // Indirect-expense carve-outs by parent (sub-group)
  const indirect = byPg('Indirect Expenses')
  const parentIn = (sets: string[], l: Ledger) => sets.some((p) => p.toLowerCase() === (l.parent || '').toLowerCase())
  const financeCosts = indirect.filter((l) => parentIn(FINANCE_PARENTS, l)).reduce((s, l) => s + l.closingBalance, 0)
  const employeeCosts = indirect.filter((l) => parentIn(EMPLOYEE_PARENTS, l)).reduce((s, l) => s + l.closingBalance, 0)
  const deprec = indirect.filter((l) => /deprec|amortis|amortiz/i.test(l.name)).reduce((s, l) => s + l.closingBalance, 0)
  const otherExp = indirect.filter((l) => !parentIn([...FINANCE_PARENTS, ...EMPLOYEE_PARENTS], l) && !/deprec|amortis|amortiz/i.test(l.name)).reduce((s, l) => s + l.closingBalance, 0)

  const totalExpenses = purchases + directExp + employeeCosts + financeCosts + deprec + otherExp
  const pbt = totalRevenue - totalExpenses
  const tax = pbt - currentYearProfit
  const pat = pbt - tax

  const pnl: StmtLine[] = [
    { key: 'h_inc', label: 'INCOME', amount: NaN, bold: true },
    { key: 'rev', label: 'Revenue from Operations', amount: revenue },
    { key: 'oinc', label: 'Other Income', amount: otherIncome },
    { key: 't_rev', label: 'Total Income', amount: totalRevenue, bold: true },
    { key: 'h_exp', label: 'EXPENSES', amount: NaN, bold: true },
    ...(purchases ? [{ key: 'pur', label: 'Purchases / Cost of Materials', amount: purchases }] : []),
    ...(directExp ? [{ key: 'dexp', label: 'Direct Expenses', amount: directExp }] : []),
    ...(employeeCosts ? [{ key: 'emp', label: 'Employee Benefit Expenses', amount: employeeCosts }] : []),
    ...(financeCosts ? [{ key: 'fin', label: 'Finance Costs', amount: financeCosts }] : []),
    ...(deprec ? [{ key: 'dep', label: 'Depreciation & Amortisation', amount: deprec }] : []),
    { key: 'oexp', label: 'Other Expenses', amount: otherExp },
    { key: 't_exp', label: 'Total Expenses', amount: totalExpenses, bold: true },
    { key: 'pbt', label: 'Surplus / (Deficit) Before Tax', amount: pbt, bold: true },
    { key: 'tax', label: 'Tax Expense (balancing)', amount: tax },
    { key: 'pat', label: 'Surplus / (Deficit) After Tax', amount: pat, bold: true },
  ]

  // ============================ NOTES ===================================
  const notes: StmtNote[] = []
  const noteFromGroups = (no: number, title: string, faceKey: string, pgs: string[], sign: 1 | -1, total: number, extra?: NoteLedger[]) => {
    const rows: NoteLedger[] = []
    for (const pg of pgs) {
      const ls = byPg(pg).filter((l) => Math.abs(l.closingBalance) > 0.5)
      if (!ls.length) continue
      const grouped = new Map<string, Ledger[]>()
      for (const l of ls) { const k = l.parent || pg; if (!grouped.has(k)) grouped.set(k, []); grouped.get(k)!.push(l) }
      for (const [parent, arr] of grouped) {
        if (grouped.size > 1 || pgs.length > 1) rows.push({ name: parent, amount: sign * arr.reduce((s, l) => s + l.closingBalance, 0), group: true })
        for (const l of arr) rows.push({ name: l.name, amount: sign * l.closingBalance, sub: grouped.size > 1 || pgs.length > 1 })
      }
    }
    if (extra) rows.push(...extra)
    notes.push({ no, title, faceKey, rows, total })
  }

  noteFromGroups(1, 'Share Capital / Corpus', 'sharecap', ['Capital Account'], -1, shareCapital)
  // note 1 should exclude reserve/profit — rebuild rows:
  notes[notes.length - 1].rows = capital.filter((l) => !/reserve|profit/i.test(l.name) && Math.abs(l.closingBalance) > 0.5).map((l) => ({ name: l.name, amount: -l.closingBalance }))

  notes.push({
    no: 2, title: 'Reserves & Surplus', faceKey: 'reserves', total: reserves,
    rows: [
      ...byPg('Reserves & Surplus').filter((l) => Math.abs(l.closingBalance) > 0.5).map((l) => ({ name: l.name, amount: -l.closingBalance })),
      ...capital.filter((l) => /reserve/i.test(l.name)).map((l) => ({ name: l.name, amount: -l.closingBalance })),
      { name: 'Surplus in Statement of Income & Expenditure (P&L A/c)', amount: pnlBalance },
    ],
  })
  noteFromGroups(3, 'Long-Term Borrowings', 'ltborrow', ['Secured Loans', 'Unsecured Loans', 'Loans (Liability)'], -1, ltBorrow)
  noteFromGroups(4, 'Short-Term Borrowings', 'stborrow', ['Bank OD A/c'], -1, stBorrow,
    bankCredit ? banks.filter((l) => l.closingBalance < 0).map((l) => ({ name: `${l.name} (OD/credit)`, amount: -l.closingBalance })) : [])
  noteFromGroups(5, 'Trade Payables', 'tradepay', ['Sundry Creditors'], -1, tradePay)
  noteFromGroups(6, 'Other Current Liabilities', 'othercl', ['Current Liabilities', 'Branch / Divisions', 'Suspense A/c'], -1, otherCL,
    [...(advancesFromCustomers ? [{ name: 'Advances from Customers (debtors in credit)', amount: advancesFromCustomers }] : []),
     ...(dutiesPayable ? [{ name: 'Statutory dues payable (GST/TDS net)', amount: dutiesPayable }] : [])])
  noteFromGroups(7, 'Short-Term Provisions', 'provisions', ['Provisions'], -1, provisions)
  // Note 8 Fixed Assets — simple net block by ledger
  notes.push({
    no: 8, title: 'Fixed Assets', faceKey: 'fa', total: fixedAssets,
    rows: byPg('Fixed Assets').filter((l) => Math.abs(l.closingBalance) > 0.5).map((l) => ({ name: l.name, amount: l.closingBalance })),
  })
  noteFromGroups(9, 'Non-Current Investments', 'inv', ['Investments'], 1, investments)
  noteFromGroups(10, 'Long-Term Loans & Advances', 'ltloans', ['Deposits (Asset)', 'Loans & Advances (Asset)'], 1, ltLoans)
  notes.push({ no: 11, title: 'Inventories', faceKey: 'stock', total: inventories, rows: byPg('Stock-in-hand').map((l) => ({ name: l.name, amount: l.closingBalance })) })
  noteFromGroups(12, 'Trade Receivables', 'recv', ['Sundry Debtors'], 1, receivables)
  // Note 13 Cash & Bank
  notes.push({
    no: 13, title: 'Cash & Cash Equivalents', faceKey: 'cash', total: cashBank,
    rows: [
      ...byPg('Cash-in-hand').filter((l) => Math.abs(l.closingBalance) > 0.5).map((l) => ({ name: l.name, amount: l.closingBalance })),
      ...banks.filter((l) => l.closingBalance > 0).map((l) => ({ name: l.name, amount: l.closingBalance })),
    ],
  })
  noteFromGroups(14, 'Other Current Assets', 'otherca', ['Current Assets'], 1, otherCA,
    [...(advancesToVendors ? [{ name: 'Advances to Vendors (creditors in debit)', amount: advancesToVendors }] : []),
     ...(dutiesRecoverable ? [{ name: 'Balances with Govt Authorities (GST/TDS recoverable)', amount: dutiesRecoverable }] : [])])
  // Duties & Taxes breakdown (net) — helpful extra note
  notes.push({
    no: 15, title: 'Duties & Taxes (Net) — memo', faceKey: 'duties', total: dutiesRaw,
    rows: byPg('Duties & Taxes').filter((l) => Math.abs(l.closingBalance) > 0.5)
      .sort((a, b) => Math.abs(b.closingBalance) - Math.abs(a.closingBalance))
      .map((l) => ({ name: l.name, amount: -l.closingBalance })),
  })

  // ========================= VALIDATION =================================
  const validations: StmtValidation[] = []
  validations.push({ severity: plugPct < 0.01 ? 'info' : plugPct < 1 ? 'warning' : 'error', category: 'Balance Sheet',
    message: `Reconciliation plug ₹${Math.round(plug).toLocaleString('en-IN')} (${plugPct.toFixed(2)}% of assets)${plugPct >= 1 ? ' — MATERIAL, investigate opening balances / unposted entries' : ''}` })
  const pnlDiff = Math.abs(pbt - currentYearProfit)
  validations.push({ severity: pnlDiff < 1 ? 'info' : pnlDiff < 50000 ? 'warning' : 'error', category: 'P&L',
    message: `P&L surplus vs P&L A/c movement differs by ₹${Math.round(pnlDiff).toLocaleString('en-IN')}${plLedger ? '' : ' (no P&L A/c ledger found — tax plug unavailable)'}` })
  if (shareCapital < 0) validations.push({ severity: 'error', category: 'Equity', message: 'Share capital / corpus is negative' })
  if (cashBank < -10000) validations.push({ severity: 'warning', category: 'Assets', message: `Cash & bank negative ₹${Math.round(cashBank).toLocaleString('en-IN')}` })
  if (revenue > 0 && receivables > revenue) validations.push({ severity: 'warning', category: 'Assets', message: 'Trade receivables exceed revenue (debtor days > 365)' })
  // unclassified material ledgers
  for (const l of led) {
    const known = ['Fixed Assets', 'Investments', 'Deposits (Asset)', 'Loans & Advances (Asset)', 'Misc. Expenses (ASSET)', 'Stock-in-hand', 'Sundry Debtors', 'Cash-in-hand', 'Bank Accounts', 'Current Assets', 'Capital Account', 'Reserves & Surplus', 'Secured Loans', 'Unsecured Loans', 'Loans (Liability)', 'Bank OD A/c', 'Sundry Creditors', 'Current Liabilities', 'Branch / Divisions', 'Duties & Taxes', 'Provisions', 'Suspense A/c', 'Sales Accounts', 'Direct Incomes', 'Indirect Incomes', 'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses']
    if (!known.includes(l.primaryGroup) && Math.abs(l.closingBalance) > 50000)
      validations.push({ severity: 'warning', category: 'Classification', message: `Unmapped ledger "${l.name}" (${l.primaryGroup || 'no group'}) ₹${Math.round(Math.abs(l.closingBalance)).toLocaleString('en-IN')} — falls into the plug` })
  }

  return {
    company: ds.company, periodFrom: ds.periodFrom, periodTo: ds.periodTo,
    bs: { equityLiab, assets, totalEquityLiab: totalAssets, totalAssets, plug, plugPct },
    pnl,
    pnlSummary: { revenue, otherIncome, totalRevenue, totalExpenses, pbt, tax, pat, currentYearProfit },
    notes,
    validations,
  }
}
