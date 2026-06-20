'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { receiveInventoryAction, type FormState } from '../../actions'
import { Field, FormMessage, Select, SubmitButton } from '../../_components/form'
import type { InventoryItem } from '@/server/services'

const init: FormState = {}

export function ReceiveForm({ branchId, items }: { branchId: string; items: InventoryItem[] }) {
  const [state, action] = useActionState(receiveInventoryAction, init)
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="branchId" value={branchId} />
      <Field label="วัตถุดิบ · Item" htmlFor="itemId">
        <Select id="itemId" name="itemId" required defaultValue="">
          <option value="" disabled>
            — เลือก / choose —
          </option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.item_kind} · {it.base_unit} · {it.id.slice(0, 8)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="จำนวน · Quantity" htmlFor="qty">
        <Input id="qty" name="qty" type="number" step="0.001" min="0" required placeholder="10" />
      </Field>
      <Field label="หน่วย · Unit" htmlFor="unit">
        <Input id="unit" name="unit" required placeholder="kg / loaf" />
      </Field>
      <Field label="วันหมดอายุ · Expires (optional)" htmlFor="expiresAt">
        <Input id="expiresAt" name="expiresAt" type="datetime-local" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton variant="cta">รับเข้าสต๊อก · Receive stock</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  )
}
