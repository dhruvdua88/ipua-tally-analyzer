// ============================================================================
// Domain model for the Tally CSV analyzer.
// Source: tally-database-loader export (one CSV per table). Schema is inferred
// dynamically at parse time — these types describe the NORMALIZED model we
// build, not a fixed CSV layout.
// ============================================================================

/** A raw CSV table exactly as parsed, before normalization. */
export interface RawTable {
  name: string            // file base name without extension, e.g. "trn_accounting"
  headers: string[]       // inferred header row (BOM/quotes stripped)
  rows: Record<string, string>[]
}

/** Top-level ledger buckets shown in the Ledger Mapping module. */
export type LedgerCategory =
  | 'income'
  | 'expense'
  | 'party'
  | 'bank_cash'
  | 'advance_received'
  | 'advance_paid'
  | 'gst'
  | 'tds'
  | 'statutory'
  | 'asset'
  | 'liability'
  | 'capital'
  | 'unclassified'

/** Finer classification used by the analytic engines. */
export type LedgerSubtype =
  | 'sales' | 'other_income' | 'sponsorship'
  | 'direct_expense' | 'indirect_expense' | 'purchase'
  | 'debtor' | 'creditor'
  | 'bank' | 'cash'
  | 'advance_received' | 'advance_paid'
  | 'gst_input' | 'gst_output' | 'gst_rcm' | 'gst_payable'
  | 'tds_payable' | 'tds_receivable' | 'tcs'
  | 'statutory_due'
  | 'fixed_asset' | 'current_asset' | 'investment' | 'loan_advance_asset'
  | 'current_liability' | 'loan_liability' | 'provision'
  | 'capital' | 'reserve'
  | 'suspense'
  | 'unclassified'

export interface Group {
  name: string
  parent: string
  primaryGroup: string
  isRevenue: boolean
  isDeemedPositive: boolean
  isReserved: boolean
  affectsGrossProfit: boolean
  sortPosition: number
}

export interface Ledger {
  name: string
  parent: string            // group name
  primaryGroup: string      // resolved primary group
  alias?: string
  isRevenue: boolean
  isDeemedPositive: boolean
  openingBalance: number
  closingBalance: number
  gstn?: string
  gstRegType?: string
  itPan?: string
  taxRate?: number
  mailingState?: string
  billCreditPeriod?: number
  // classification (auto, user-overridable)
  category: LedgerCategory
  subtype: LedgerSubtype
  source: 'auto' | 'manual'
  reason: string            // why auto-classifier chose this
}

export interface VoucherType {
  name: string
  parent: string
  numberingMethod?: string
  isDeemedPositive: boolean
  affectsStock: boolean
}

export interface Voucher {
  guid: string
  date: string              // YYYY-MM-DD
  month: string             // YYYY-MM
  voucherType: string
  voucherNumber: string
  referenceNumber: string
  referenceDate: string
  narration: string
  partyName: string
  placeOfSupply: string
  isInvoice: boolean
  isAccounting: boolean
  isInventory: boolean
}

/** One enriched accounting line — the analog of daybook_accounting_lines. */
export interface DaybookLine {
  id: string                // `${guid}#${lineNo}`
  voucherGuid: string
  lineNo: number
  date: string
  month: string
  voucherType: string
  voucherNumber: string
  partyName: string
  narration: string
  ledgerName: string
  ledgerGroup: string       // ledger.parent
  primaryGroup: string
  isDeemedPositive: boolean
  isRevenue: boolean
  amount: number            // conventional signed value: Dr = +, Cr = − (inversion auto-corrected)
  natural: number           // increase-positive: +ve = increases the ledger's natural balance (income/expense both +ve)
  drcr: 'Dr' | 'Cr'
  category: LedgerCategory
  subtype: LedgerSubtype
}

export interface Party {
  name: string
  group: string
  type: 'debtor' | 'creditor' | 'other'
  gstn?: string
  itPan?: string
  state?: string
  openingBalance: number
  closingBalance: number
  totalDr: number
  totalCr: number
  net: number               // net movement across daybook
  voucherCount: number
}

export interface Bill {
  voucherGuid: string
  ledger: string
  name: string
  amount: number
  billType: string
  creditPeriod?: number
}

export interface BankLine {
  voucherGuid: string
  ledger: string
  transactionType: string
  instrumentDate: string
  instrumentNumber: string
  bankName: string
  amount: number
  bankersDate: string
}

/** Full normalized dataset held in memory + persisted to Dexie. */
export interface Dataset {
  company: string
  periodFrom: string
  periodTo: string
  generatedAt: string
  groups: Group[]
  ledgers: Ledger[]
  voucherTypes: VoucherType[]
  vouchers: Voucher[]
  lines: DaybookLine[]
  parties: Party[]
  bills: Bill[]
  bankLines: BankLine[]
  raw: RawTable[]
  importedAt: number
}

// ---- TDS ---------------------------------------------------------------

export interface TdsRule {
  id: string
  section: string           // e.g. "194C", "194J"
  label: string
  rate: number              // percent
  threshold: number         // single-payment / annual threshold (INR)
  keywords: string[]        // ledger-name keywords that map an expense to this section
  enabled: boolean
}

export type TdsStatus =
  | 'deducted'
  | 'not_deducted'

export interface TdsReviewRow {
  lineId: string
  date: string
  voucherType: string
  voucherNumber: string
  party: string
  ledger: string            // base ledger (expense / vendor advance) the TDS relates to
  amount: number            // base amount (positive)
  narration: string
  tdsLedger: string         // TDS ledger name ('' if none deducted)
  tdsAmount: number         // TDS actually deducted (credit to TDS payable); 0 if none
  rate: number              // effective rate % = tdsAmount / amount
  section?: string          // section hint parsed from narration (e.g. 194C), optional
  status: TdsStatus
  note: string
}

// ---- GST on advances ---------------------------------------------------

export type AdvanceRisk = 'ok' | 'low' | 'medium' | 'high'

export interface AdvanceRow {
  voucherGuid: string
  date: string
  voucherNumber: string
  voucherType: string
  party: string
  amount: number            // advance received (positive)
  gstBooked: number         // GST on advance found in the voucher
  gstExpected: number
  adjustedLater: boolean    // later netted against an invoice
  likelyExemptOrGrant: boolean
  outstanding: boolean
  risk: AdvanceRisk
  note: string
}

// ---- GST reconciliation ------------------------------------------------

export interface GstMonthRow {
  month: string
  outputGst: number
  inputGst: number
  rcm: number
  gstPayableLedger: number  // movement in GST payable ledgers
  gstPaid: number           // GST paid via bank/cash against payable
  salesTaxable: number      // taxable sales value
  salesWithoutGst: number   // sales lines with no GST in the voucher
  gstWithoutSales: number   // GST output with no sales line
  netLiability: number      // output - input - rcm-credit ... computed
  flags: string[]
}

// ---- Exceptions --------------------------------------------------------

export type Severity = 'high' | 'medium' | 'low'
export type ExceptionType =
  | 'missing_tds'
  | 'gst_advance'
  | 'statutory_unpaid'
  | 'old_advance'
  | 'negative_party'
  | 'manual_journal'
  | 'unclassified_ledger'
  | 'duplicate_voucher'
  | 'missing_narration'

export interface ExceptionRow {
  id: string
  type: ExceptionType
  severity: Severity
  title: string
  detail: string
  amount?: number
  ref?: string              // voucher / ledger reference
  lineId?: string
  voucherGuid?: string
  ledgerName?: string
}

// ---- MIS / P&L / BS ----------------------------------------------------

export interface MonthAgg {
  month: string
  income: number
  expense: number
  surplus: number
}

export interface PnlNode {
  key: string
  label: string
  primaryGroups: string[]
  amount: number
  months: Record<string, number>
  ledgers: { name: string; amount: number; months: Record<string, number> }[]
}

export interface BsNode {
  key: string
  label: string
  side: 'asset' | 'liability'
  amount: number
  ledgers: { name: string; amount: number }[]
}
