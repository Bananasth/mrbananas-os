'use client'

import { useActionState } from 'react'
import { Input } from '@/components/ui/input'
import { createRecipeAction, type FormState } from '../actions'
import { Field, FormMessage, Select, SubmitButton } from '../_components/form'
import type { Product } from '@/server/services'

const init: FormState = {}

export function RecipeForm({ products }: { products: Product[] }) {
  const [state, action] = useActionState(createRecipeAction, init)
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
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
      <Field label="ชื่อสูตร · Recipe name" htmlFor="name">
        <Input id="name" name="name" required placeholder="Latte v1" />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton variant="cta">เพิ่มสูตร · Add recipe</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  )
}
