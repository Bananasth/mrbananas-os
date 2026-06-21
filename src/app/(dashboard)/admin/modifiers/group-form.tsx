"use client";

import { useActionState } from "react";
import { createGroupAction, type FormState } from "./actions";
import { Field, FormMessage, SubmitButton, fieldClass } from "../_components/forms";

const init: FormState = {};

export function GroupForm() {
  const [state, action] = useActionState(createGroupAction, init);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="ชื่อกลุ่ม · Name" htmlFor="name">
        <input id="name" name="name" required placeholder="Sweetness" className={fieldClass} />
      </Field>
      <Field label="คำอธิบาย · Description" htmlFor="description">
        <input id="description" name="description" className={fieldClass} />
      </Field>
      <Field label="การเลือก · Selection" htmlFor="selectionType">
        <select id="selectionType" name="selectionType" defaultValue="single" className={fieldClass}>
          <option value="single">single</option>
          <option value="multiple">multiple</option>
        </select>
      </Field>
      <Field label="แสดงผล · Display" htmlFor="displayType">
        <select id="displayType" name="displayType" defaultValue="radio" className={fieldClass}>
          <option value="radio">radio</option>
          <option value="checkbox">checkbox</option>
          <option value="button">button</option>
          <option value="dropdown">dropdown</option>
        </select>
      </Field>
      <Field label="เลือกต่ำสุด · Min" htmlFor="minSelect">
        <input id="minSelect" name="minSelect" type="number" min="0" defaultValue="0" className={fieldClass} />
      </Field>
      <Field label="เลือกสูงสุด · Max" htmlFor="maxSelect">
        <input id="maxSelect" name="maxSelect" type="number" min="1" defaultValue="1" className={fieldClass} />
      </Field>
      <Field label="ลำดับ · Sort" htmlFor="sortOrder">
        <input id="sortOrder" name="sortOrder" type="number" defaultValue="0" className={fieldClass} />
      </Field>
      <label className="flex items-end gap-2 pb-2">
        <input type="checkbox" name="isRequired" className="h-4 w-4" />
        <span className="text-sm">บังคับเลือก · Required</span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <SubmitButton>เพิ่มกลุ่ม · Add group</SubmitButton>
        <FormMessage ok={state.ok} error={state.error} />
      </div>
    </form>
  );
}
