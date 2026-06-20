'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { createProductAction, type FormState } from '../actions'
import { Field, FormMessage, Select, SubmitButton } from '../_components/form'
import type { InventoryItem } from '@/server/services'

const init: FormState = {}

export function ProductForm({ items }: { items: InventoryItem[] }) {
  const [state, action] = useActionState(createProductAction, init)
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="รหัสสินค้า · SKU" htmlFor="sku">
        <Input id="sku" name="sku" required placeholder="LATTE" />
      </Field>
      <Field label="ชื่อ · Name" htmlFor="name">
        <Input id="name" name="name" required placeholder="Latte" />
      </Field>
      <Field label="หมวดหมู่ · Category" htmlFor="category">
        <Select id="category" name="category" defaultValue="beverage">
          <option value="beverage">beverage · เครื่องดื่ม</option>
          <option value="bakery">bakery · เบเกอรี่</option>
        </Select>
      </Field>
      <Field label="ประเภท · Type" htmlFor="type">
        <Select id="type" name="type" defaultValue="made_to_order">
          <option value="made_to_order">made_to_order · ทำสด</option>
          <option value="batch">batch · ผลิตเป็นล็อต</option>
        </Select>
      </Field>
      <Field label="ผูกสต๊อก (เฉพาะ batch) · Inventory item" htmlFor="inventoryItemId">
        <Select id="inventoryItemId" name="inventoryItemId" defaultValue="">
          <option value="">— ไม่ผูก / none —</option>
          {items.map((it) => (
            <option key={it.id} value={it.id}>
              {it.item_kind} · {it.base_unit} · {it.id.slice(0, 8)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex items-end gap-3">
        <SubmitButton variant="cta">เพิ่มสินค้า · Add product</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  )
}
