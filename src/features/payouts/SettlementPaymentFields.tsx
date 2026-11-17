import type { SettlementMethod } from '../../lib/types'
import { METHODS, indiaToday, needsReference, referenceLabel, referencePlaceholder, type PaymentDraft } from './settlementPayment'

/**
 * The payment part of a settlement: when the money moved, how, and the transaction number that
 * matches it to the bank statement. Shared by rider and merchant payouts.
 */
export default function SettlementPaymentFields({
  draft,
  amount,
  onChange,
}: {
  draft: PaymentDraft
  /** The amount being settled, either way; a zero settlement moves no money and needs no number. */
  amount: number
  onChange: (next: PaymentDraft) => void
}) {
  const required = needsReference(draft.method, amount)
  return (
    <>
      <label>
        Paid on
        <input
          type="date"
          value={draft.paidOn}
          max={indiaToday()}
          required
          onChange={(event) => onChange({ ...draft, paidOn: event.target.value })}
        />
      </label>
      <label>
        Paid by
        <select value={draft.method} onChange={(event) => onChange({ ...draft, method: event.target.value as SettlementMethod })}>
          {METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label>
        {referenceLabel(draft.method, required)}
        <input
          value={draft.reference}
          onChange={(event) => onChange({ ...draft, reference: event.target.value })}
          maxLength={120}
          required={required}
          placeholder={referencePlaceholder(draft.method)}
          autoComplete="off"
        />
      </label>
      <label>
        Note (optional)
        <input value={draft.note} onChange={(event) => onChange({ ...draft, note: event.target.value })} maxLength={500} />
      </label>
    </>
  )
}
