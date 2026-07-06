import type { Dataset, GstMonthRow, DaybookLine } from './types'

interface Acc {
  outputGst: number; inputGst: number; rcm: number
  gstPayableLedger: number; gstPaid: number
  salesTaxable: number; salesWithoutGst: number; gstWithoutSales: number
}
const zero = (): Acc => ({ outputGst: 0, inputGst: 0, rcm: 0, gstPayableLedger: 0, gstPaid: 0, salesTaxable: 0, salesWithoutGst: 0, gstWithoutSales: 0 })

/** Month-wise GST reconciliation across output, input, RCM, payable, paid. */
export function computeGstRecon(ds: Dataset): GstMonthRow[] {
  const byVoucher = new Map<string, DaybookLine[]>()
  for (const l of ds.lines) {
    let a = byVoucher.get(l.voucherGuid); if (!a) { a = []; byVoucher.set(l.voucherGuid, a) }
    a.push(l)
  }

  const months = new Map<string, Acc>()
  const get = (m: string) => { let a = months.get(m); if (!a) { a = zero(); months.set(m, a) } return a }

  for (const [, lines] of byVoucher) {
    const month = lines[0].month || 'unknown'
    const acc = get(month)
    const gstLines = lines.filter((l) => l.category === 'gst')
    const incomeLines = lines.filter((l) => l.category === 'income')
    const isPayment = /payment/i.test(lines[0].voucherType)

    for (const l of lines) {
      if (l.category !== 'gst') continue
      const mag = Math.abs(l.amount)
      switch (l.subtype) {
        case 'gst_output': acc.outputGst += mag; break
        case 'gst_input': acc.inputGst += mag; break
        case 'gst_rcm': acc.rcm += mag; break
        case 'gst_payable':
          acc.gstPayableLedger += l.amount // signed net movement
          if (isPayment && l.amount > 0) acc.gstPaid += l.amount // debit to payable in a payment voucher = paid
          break
      }
    }

    // sales value
    const salesVal = incomeLines.reduce((s, l) => s + Math.abs(l.amount), 0)
    const outVal = gstLines.filter((l) => l.subtype === 'gst_output').reduce((s, l) => s + Math.abs(l.amount), 0)
    if (salesVal > 0) {
      acc.salesTaxable += salesVal
      if (outVal <= 1) acc.salesWithoutGst += salesVal // sale booked without output GST
    }
    if (outVal > 0 && salesVal <= 1) acc.gstWithoutSales += outVal // output GST with no sale line
  }

  const rows: GstMonthRow[] = [...months.entries()]
    .filter(([m]) => m !== 'unknown')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, a]) => {
      const netLiability = a.outputGst - a.inputGst
      const flags: string[] = []
      if (a.salesWithoutGst > 1) flags.push('Sales without GST')
      if (a.gstWithoutSales > 1) flags.push('GST without sales')
      if (a.inputGst > a.outputGst * 1.5 && a.outputGst > 0) flags.push('ITC > output (accumulation)')
      if (a.rcm > 0 && a.inputGst <= 1) flags.push('RCM paid, ITC not claimed?')
      if (netLiability > 1 && a.gstPaid <= 1) flags.push('Liability unpaid this month')
      return {
        month,
        outputGst: a.outputGst, inputGst: a.inputGst, rcm: a.rcm,
        gstPayableLedger: a.gstPayableLedger, gstPaid: a.gstPaid,
        salesTaxable: a.salesTaxable, salesWithoutGst: a.salesWithoutGst, gstWithoutSales: a.gstWithoutSales,
        netLiability, flags,
      }
    })
  return rows
}
