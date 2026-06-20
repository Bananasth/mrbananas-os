'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { upsertPriceAction, type FormState } from '../actions'
import { Field, FormMessage, Select, SubmitButton } from '../_components/form'
import type { Product } from '@/server/services'

const init: FormState = {}

export function PriceForm({ branchId, products }: { branchId: string; products: Product[] }) {
  const [state, action] = useActionState(upsertPriceAction, init)
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="branchId" value={branchId} />
      <Field label="สินค้า · Product" htmlFor="productId">
        <Select id="productId" name="productId" required defaultValue="">
          <option value="" disabled>
            — เลือกสินค้า / choose —
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ราคา (บาท) · Price (THB)" htmlFor="price">
        <Input id="price" name="price" type="number" step="0.01" min="0" placeholder="50.00" />
      </Field>
      <Field label="หมวดเมนู · Menu section" htmlFor="menuSection">
        <Input id="menuSection" name="menuSection" placeholder="Hot drinks" />
      </Field>
      <label className="flex items-end gap-2 pb-2">
        <input type="checkbox" name="isAvailable" defaultChecked className="h-4 w-4" />
        <span className="text-sm text-navy-800">วางขาย · Available</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton variant="cta">บันทึกราคา · Save price</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  )
}
