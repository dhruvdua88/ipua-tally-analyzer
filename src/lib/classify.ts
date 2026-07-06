import type { LedgerCategory, LedgerSubtype } from './types'

export interface ClassifyInput {
  name: string
  group: string           // ledger.parent
  primaryGroup: string    // resolved primary group
  isRevenue: boolean
  isDeemedPositive: boolean
}

export interface ClassifyResult {
  category: LedgerCategory
  subtype: LedgerSubtype
  reason: string
}

const has = (s: string, re: RegExp) => re.test(s)

/**
 * Rule-based ledger classifier. Evaluated in priority order so that specific
 * tax ledgers (GST / TDS / statutory / advances) win over the coarse group.
 * Nothing is hardcoded to this company's exact ledger names — matching is by
 * pattern + Tally primary group, both of which are stable across Tally books.
 */
export function classifyLedger(inp: ClassifyInput): ClassifyResult {
  const n = inp.name
  const g = inp.group
  const pg = inp.primaryGroup
  const ctx = `${n} ${g}`

  const isGstCtx = has(ctx, /\b(C?GST|SGST|IGST|UTGST|GST)\b/i) || has(pg, /Duties & Taxes/i)
  const isRcm = has(ctx, /\bRCM\b/i)

  // 1) GST ledgers -------------------------------------------------------
  if (has(ctx, /\b(C?GST|SGST|IGST|UTGST)\b/i) || has(g, /^GST/i)) {
    if (isRcm) {
      const sub = has(n, /PAY(A?BLE)?/i) ? 'gst_rcm' : has(n, /CREDIT|INPUT|ITC/i) ? 'gst_rcm' : 'gst_rcm'
      return { category: 'gst', subtype: sub as LedgerSubtype, reason: 'RCM GST ledger (name/group matches RCM)' }
    }
    if (has(n, /INPUT|CREDIT|ITC/i)) return { category: 'gst', subtype: 'gst_input', reason: 'Input/ITC GST ledger' }
    if (has(n, /OUTPUT/i)) return { category: 'gst', subtype: 'gst_output', reason: 'Output GST ledger' }
    if (has(n, /PAY(A?BLE)?/i)) return { category: 'gst', subtype: 'gst_payable', reason: 'GST payable ledger' }
    if (has(n, /ADVANCE/i)) return { category: 'gst', subtype: 'gst_output', reason: 'GST on advance (advance-tagged GST ledger)' }
    return { category: 'gst', subtype: 'gst_output', reason: 'GST ledger (generic)' }
  }

  // 2) TDS / TCS ---------------------------------------------------------
  if (has(n, /\bTDS\b/i) || has(n, /TAX DEDUCT/i)) {
    if (has(n, /RECEIV/i)) return { category: 'tds', subtype: 'tds_receivable', reason: 'TDS receivable ledger' }
    return { category: 'tds', subtype: 'tds_payable', reason: 'TDS payable ledger' }
  }
  if (has(n, /\bTCS\b/i)) return { category: 'tds', subtype: 'tcs', reason: 'TCS ledger' }

  // 3) Other statutory dues (Duties & Taxes, not GST/TDS) ---------------
  if (has(pg, /Duties & Taxes/i) || has(ctx, /\b(PF|EPF|ESI|ESIC|PROFESSION(AL)? TAX|\bPT\b|INCOME TAX|TDS PAYABLE|PROVIDENT)\b/i)) {
    return { category: 'statutory', subtype: 'statutory_due', reason: 'Statutory due (Duties & Taxes / payroll statutory)' }
  }

  // 4) Advances ----------------------------------------------------------
  const advName = has(n, /\bADVANCE/i) || has(n, /ADVANCE\b/i)
  if (advName || has(g, /Loans & Advances/i)) {
    // Direction: asset-side (paid) vs liability-side (received)
    const liabilitySide = has(pg, /Current Liabilities|Sundry Creditors|Loans/i) || has(n, /RECEIVED|FROM CUSTOMER|CUSTOMER ADVANCE/i)
    if (liabilitySide && !has(g, /Loans & Advances \(Asset\)/i)) {
      return { category: 'advance_received', subtype: 'advance_received', reason: 'Advance received (liability-side advance)' }
    }
    return { category: 'advance_paid', subtype: 'loan_advance_asset', reason: 'Advance paid (asset-side advance / Loans & Advances)' }
  }

  // 5) Bank & Cash -------------------------------------------------------
  if (has(pg, /Bank Accounts|Bank OD/i) || has(g, /Bank/i)) {
    return { category: 'bank_cash', subtype: 'bank', reason: 'Bank ledger' }
  }
  if (has(pg, /Cash-in-Hand/i) || has(n, /^CASH\b/i)) {
    return { category: 'bank_cash', subtype: 'cash', reason: 'Cash ledger' }
  }

  // 6) Parties -----------------------------------------------------------
  if (has(pg, /Sundry Debtors/i)) return { category: 'party', subtype: 'debtor', reason: 'Sundry Debtor' }
  if (has(pg, /Sundry Creditors/i)) return { category: 'party', subtype: 'creditor', reason: 'Sundry Creditor' }

  // 7) Income ------------------------------------------------------------
  if (has(g, /Sponsorship/i)) return { category: 'income', subtype: 'sponsorship', reason: 'Sponsorship income' }
  if (has(pg, /Sales Accounts/i)) return { category: 'income', subtype: 'sales', reason: 'Sales account' }
  if (has(pg, /Direct Incomes|Indirect Incomes/i) || (inp.isRevenue && !inp.isDeemedPositive && has(pg, /Income/i))) {
    return { category: 'income', subtype: 'other_income', reason: 'Income account' }
  }

  // 8) Expenses ----------------------------------------------------------
  if (has(pg, /Purchase Accounts/i)) return { category: 'expense', subtype: 'purchase', reason: 'Purchase account' }
  if (has(pg, /Direct Expenses/i)) return { category: 'expense', subtype: 'direct_expense', reason: 'Direct expense' }
  if (has(pg, /Indirect Expenses/i)) return { category: 'expense', subtype: 'indirect_expense', reason: 'Indirect expense' }

  // 9) Assets ------------------------------------------------------------
  if (has(pg, /Fixed Assets/i)) return { category: 'asset', subtype: 'fixed_asset', reason: 'Fixed asset' }
  if (has(pg, /Investments/i)) return { category: 'asset', subtype: 'investment', reason: 'Investment' }
  if (has(pg, /Stock-in-Hand|Deposits|Current Assets|Misc\. Expenses/i)) {
    return { category: 'asset', subtype: 'current_asset', reason: 'Current / other asset' }
  }

  // 10) Liabilities ------------------------------------------------------
  if (has(pg, /Provisions/i)) return { category: 'liability', subtype: 'provision', reason: 'Provision' }
  if (has(pg, /Loans|Secured Loans|Unsecured Loans|Bank OD/i)) return { category: 'liability', subtype: 'loan_liability', reason: 'Loan liability' }
  if (has(pg, /Current Liabilities|Branch/i)) return { category: 'liability', subtype: 'current_liability', reason: 'Current liability' }

  // 11) Capital ----------------------------------------------------------
  if (has(pg, /Reserves & Surplus/i)) return { category: 'capital', subtype: 'reserve', reason: 'Reserve & surplus' }
  if (has(pg, /Capital Account/i)) return { category: 'capital', subtype: 'capital', reason: 'Capital account' }

  // 12) Suspense / fallback ---------------------------------------------
  if (has(pg, /Suspense/i)) return { category: 'unclassified', subtype: 'suspense', reason: 'Suspense — needs review' }

  return { category: 'unclassified', subtype: 'unclassified', reason: `Unrecognized group "${pg || g}"` }
}

export const CATEGORY_META: Record<LedgerCategory, { label: string; color: string }> = {
  income: { label: 'Income', color: 'ok' },
  expense: { label: 'Expense', color: 'info' },
  party: { label: 'Party', color: 'gold' },
  bank_cash: { label: 'Bank / Cash', color: 'info' },
  advance_received: { label: 'Advance Received', color: 'warn' },
  advance_paid: { label: 'Advance Paid', color: 'warn' },
  gst: { label: 'GST', color: 'gold' },
  tds: { label: 'TDS', color: 'gold' },
  statutory: { label: 'Statutory Dues', color: 'warn' },
  asset: { label: 'Asset', color: 'info' },
  liability: { label: 'Liability', color: 'info' },
  capital: { label: 'Capital', color: 'muted' },
  unclassified: { label: 'Unclassified', color: 'risk' },
}

export const ALL_CATEGORIES: LedgerCategory[] = [
  'income', 'expense', 'party', 'bank_cash', 'advance_received', 'advance_paid',
  'gst', 'tds', 'statutory', 'asset', 'liability', 'capital', 'unclassified',
]
