import type {
  RawTable, Dataset, Group, Ledger, VoucherType, Voucher, DaybookLine, Party, Bill, BankLine,
} from './types'
import { parseAmount } from './format'
import { classifyLedger } from './classify'

// ---- flexible column + table access ------------------------------------

function findTable(tables: RawTable[], ...names: string[]): RawTable | undefined {
  for (const nm of names) {
    const t = tables.find((x) => x.name.toLowerCase() === nm.toLowerCase())
    if (t) return t
  }
  // fallback: contains
  for (const nm of names) {
    const t = tables.find((x) => x.name.toLowerCase().includes(nm.toLowerCase()))
    if (t) return t
  }
  return undefined
}

/** Get a field from a row by trying candidate header names (case-insensitive). */
function pick(row: Record<string, string>, keys: string[], candidates: string[]): string {
  for (const c of candidates) {
    // exact (case-insensitive)
    const hit = keys.find((k) => k.toLowerCase() === c.toLowerCase())
    if (hit && row[hit] != null) return row[hit]
  }
  for (const c of candidates) {
    const hit = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()))
    if (hit && row[hit] != null) return row[hit]
  }
  return ''
}

const bool = (v: string) => v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes'
const ym = (d: string) => (d && d.length >= 7 ? d.slice(0, 7) : '')

// ---- main --------------------------------------------------------------

export function normalize(tables: RawTable[]): Dataset {
  // config / metadata
  const config = findTable(tables, 'config')
  const cfg: Record<string, string> = {}
  if (config) for (const r of config.rows) {
    const k = pick(r, config.headers, ['name']); const v = pick(r, config.headers, ['value'])
    if (k) cfg[k.toLowerCase()] = v
  }

  // ---- groups: resolve primary group by walking parents ----
  const gt = findTable(tables, 'mst_group')
  const rawGroups: Group[] = []
  const groupByName = new Map<string, Group>()
  if (gt) for (const r of gt.rows) {
    const gr: Group = {
      name: pick(r, gt.headers, ['name']),
      parent: pick(r, gt.headers, ['parent']),
      primaryGroup: pick(r, gt.headers, ['primary_group', 'primarygroup']),
      isRevenue: bool(pick(r, gt.headers, ['is_revenue'])),
      isDeemedPositive: bool(pick(r, gt.headers, ['is_deemedpositive'])),
      isReserved: bool(pick(r, gt.headers, ['is_reserved'])),
      affectsGrossProfit: bool(pick(r, gt.headers, ['affects_gross_profit'])),
      sortPosition: Number(pick(r, gt.headers, ['sort_position'])) || 0,
    }
    rawGroups.push(gr)
    if (gr.name) groupByName.set(gr.name, gr)
  }
  const resolvePrimary = (groupName: string): string => {
    let cur = groupByName.get(groupName)
    let guard = 0
    while (cur && guard++ < 30) {
      if (cur.primaryGroup) return cur.primaryGroup
      if (!cur.parent) return cur.name
      const next = groupByName.get(cur.parent)
      if (!next) return cur.name
      cur = next
    }
    return groupName
  }
  for (const g of rawGroups) if (!g.primaryGroup) g.primaryGroup = resolvePrimary(g.name)

  // ---- detect sign convention -----------------------------------------
  // Some Tally-loader exports store debits as negative (credits positive) —
  // the inverse of the documented convention. Detect it from the natural-debit
  // ledgers (assets/expenses, is_deemedpositive=1): their closing balances
  // should net POSITIVE. If they net negative, the file is sign-inverted.
  const lt2 = findTable(tables, 'mst_ledger')
  let debitLedgerSum = 0
  if (lt2) for (const r of lt2.rows) {
    if (bool(pick(r, lt2.headers, ['is_deemedpositive']))) {
      debitLedgerSum += parseAmount(pick(r, lt2.headers, ['closing_balance']))
    }
  }
  const inverted = debitLedgerSum < 0
  const conv = (raw: number) => (inverted ? -raw : raw) // -> conventional Dr +, Cr −

  // ---- ledgers + classification ----
  const ledgers: Ledger[] = []
  const ledgerByName = new Map<string, Ledger>()
  if (lt2) for (const r of lt2.rows) {
    const lt = lt2
    const name = pick(r, lt.headers, ['name'])
    if (!name) continue
    const parent = pick(r, lt.headers, ['parent'])
    const primaryGroup = resolvePrimary(parent)
    const isRevenue = bool(pick(r, lt.headers, ['is_revenue']))
    const isDeemedPositive = bool(pick(r, lt.headers, ['is_deemedpositive']))
    const cl = classifyLedger({ name, group: parent, primaryGroup, isRevenue, isDeemedPositive })
    const led: Ledger = {
      name, parent, primaryGroup, isRevenue, isDeemedPositive,
      alias: pick(r, lt.headers, ['alias']) || undefined,
      openingBalance: conv(parseAmount(pick(r, lt.headers, ['opening_balance']))),
      closingBalance: conv(parseAmount(pick(r, lt.headers, ['closing_balance']))),
      gstn: pick(r, lt.headers, ['gstn']) || undefined,
      gstRegType: pick(r, lt.headers, ['gst_registration_type']) || undefined,
      itPan: pick(r, lt.headers, ['it_pan']) || undefined,
      taxRate: parseAmount(pick(r, lt.headers, ['tax_rate'])) || undefined,
      mailingState: pick(r, lt.headers, ['mailing_state']) || undefined,
      billCreditPeriod: Number(pick(r, lt.headers, ['bill_credit_period'])) || undefined,
      category: cl.category, subtype: cl.subtype, source: 'auto', reason: cl.reason,
    }
    ledgers.push(led)
    ledgerByName.set(name, led)
  }

  // ---- voucher types ----
  const vtt = findTable(tables, 'mst_vouchertype')
  const voucherTypes: VoucherType[] = []
  if (vtt) for (const r of vtt.rows) {
    voucherTypes.push({
      name: pick(r, vtt.headers, ['name']),
      parent: pick(r, vtt.headers, ['parent']),
      numberingMethod: pick(r, vtt.headers, ['numbering_method']) || undefined,
      isDeemedPositive: bool(pick(r, vtt.headers, ['is_deemedpositive'])),
      affectsStock: bool(pick(r, vtt.headers, ['affects_stock'])),
    })
  }

  // ---- vouchers ----
  const vt = findTable(tables, 'trn_voucher')
  const vouchers: Voucher[] = []
  const voucherByGuid = new Map<string, Voucher>()
  if (vt) for (const r of vt.rows) {
    const guid = pick(r, vt.headers, ['guid'])
    const date = pick(r, vt.headers, ['date'])
    const v: Voucher = {
      guid, date, month: ym(date),
      voucherType: pick(r, vt.headers, ['voucher_type', 'vouchertype']),
      voucherNumber: pick(r, vt.headers, ['voucher_number', 'vouchernumber']),
      referenceNumber: pick(r, vt.headers, ['reference_number']),
      referenceDate: pick(r, vt.headers, ['reference_date']),
      narration: pick(r, vt.headers, ['narration']),
      partyName: pick(r, vt.headers, ['party_name', 'partyname']),
      placeOfSupply: pick(r, vt.headers, ['place_of_supply']),
      isInvoice: bool(pick(r, vt.headers, ['is_invoice'])),
      isAccounting: bool(pick(r, vt.headers, ['is_accounting_voucher'])),
      isInventory: bool(pick(r, vt.headers, ['is_inventory_voucher'])),
    }
    vouchers.push(v)
    if (guid) voucherByGuid.set(guid, v)
  }

  // ---- accounting lines -> enriched daybook ----
  const at = findTable(tables, 'trn_accounting')
  const lines: DaybookLine[] = []
  const lineCounter = new Map<string, number>()
  if (at) for (const r of at.rows) {
    const guid = pick(r, at.headers, ['guid'])
    const ledgerName = pick(r, at.headers, ['ledger'])
    const raw = parseAmount(pick(r, at.headers, ['amount']))
    const amount = conv(raw) // conventional: Dr +, Cr −
    const v = voucherByGuid.get(guid)
    const led = ledgerByName.get(ledgerName)
    const lineNo = (lineCounter.get(guid) ?? 0) + 1
    lineCounter.set(guid, lineNo)
    const isDeemedPositive = led?.isDeemedPositive ?? false
    const drcr: 'Dr' | 'Cr' = amount >= 0 ? 'Dr' : 'Cr'
    // natural: positive = increases the ledger's own natural balance
    const natural = isDeemedPositive ? amount : -amount
    lines.push({
      id: `${guid}#${lineNo}`,
      voucherGuid: guid,
      lineNo,
      date: v?.date ?? '',
      month: v?.month ?? '',
      voucherType: v?.voucherType ?? '',
      voucherNumber: v?.voucherNumber ?? '',
      partyName: v?.partyName ?? '',
      narration: v?.narration ?? '',
      ledgerName,
      ledgerGroup: led?.parent ?? '',
      primaryGroup: led?.primaryGroup ?? '',
      isDeemedPositive,
      isRevenue: led?.isRevenue ?? false,
      amount,
      natural,
      drcr,
      category: led?.category ?? 'unclassified',
      subtype: led?.subtype ?? 'unclassified',
    })
  }

  // ---- parties (debtor/creditor ledgers + movement aggregation) ----
  const partyAgg = new Map<string, { dr: number; cr: number; count: number; vset: Set<string> }>()
  for (const l of lines) {
    const led = ledgerByName.get(l.ledgerName)
    if (!led || led.category !== 'party') continue
    let a = partyAgg.get(l.ledgerName)
    if (!a) { a = { dr: 0, cr: 0, count: 0, vset: new Set() }; partyAgg.set(l.ledgerName, a) }
    if (l.amount >= 0) a.dr += l.amount; else a.cr += Math.abs(l.amount)
    a.vset.add(l.voucherGuid)
  }
  const parties: Party[] = []
  for (const led of ledgers) {
    if (led.category !== 'party') continue
    const a = partyAgg.get(led.name)
    parties.push({
      name: led.name,
      group: led.parent,
      type: led.subtype === 'creditor' ? 'creditor' : led.subtype === 'debtor' ? 'debtor' : 'other',
      gstn: led.gstn, itPan: led.itPan, state: led.mailingState,
      openingBalance: led.openingBalance,
      closingBalance: led.closingBalance,
      totalDr: a?.dr ?? 0,
      totalCr: a?.cr ?? 0,
      net: (a?.dr ?? 0) - (a?.cr ?? 0),
      voucherCount: a?.vset.size ?? 0,
    })
  }

  // ---- bills ----
  const bt = findTable(tables, 'trn_bill')
  const bills: Bill[] = []
  if (bt) for (const r of bt.rows) {
    bills.push({
      voucherGuid: pick(r, bt.headers, ['guid']),
      ledger: pick(r, bt.headers, ['ledger']),
      name: pick(r, bt.headers, ['name']),
      amount: conv(parseAmount(pick(r, bt.headers, ['amount']))),
      billType: pick(r, bt.headers, ['billtype', 'bill_type']),
      creditPeriod: Number(pick(r, bt.headers, ['bill_credit_period'])) || undefined,
    })
  }

  // ---- bank lines ----
  const bkt = findTable(tables, 'trn_bank')
  const bankLines: BankLine[] = []
  if (bkt) for (const r of bkt.rows) {
    bankLines.push({
      voucherGuid: pick(r, bkt.headers, ['guid']),
      ledger: pick(r, bkt.headers, ['ledger']),
      transactionType: pick(r, bkt.headers, ['transaction_type']),
      instrumentDate: pick(r, bkt.headers, ['instrument_date']),
      instrumentNumber: pick(r, bkt.headers, ['instrument_number']),
      bankName: pick(r, bkt.headers, ['bank_name']),
      amount: conv(parseAmount(pick(r, bkt.headers, ['amount']))),
      bankersDate: pick(r, bkt.headers, ['bankers_date']),
    })
  }

  // ---- period from data ----
  const dates = vouchers.map((v) => v.date).filter(Boolean).sort()
  const cget = (...keys: string[]) => { for (const k of keys) if (cfg[k]) return cfg[k]; return '' }
  const periodFrom = (cget('period from', 'period_from') || dates[0] || '').slice(0, 10)
  const periodTo = (cget('period to', 'period_to') || dates[dates.length - 1] || '').slice(0, 10)

  return {
    company: cget('company name', 'company_name', 'company') || 'Tally Company',
    periodFrom, periodTo,
    generatedAt: cget('update timestamp', 'generated_at'),
    groups: rawGroups, ledgers, voucherTypes, vouchers, lines, parties, bills, bankLines,
    raw: tables,
    importedAt: 0, // stamped by caller (Date.now not available in some contexts)
  }
}
