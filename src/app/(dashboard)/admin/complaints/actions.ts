'use server'

import { revalidatePath } from 'next/cache'
import { fileComplaintRpc, setComplaintStatus, resolveComplaint, assignComplaintToMe } from '@/server/services'

export type CState = { ok?: boolean; error?: string }

export async function fileComplaintAction(_p: CState, fd: FormData): Promise<CState> {
  const orderItemId = String(fd.get('order_item_id') ?? '')
  if (!orderItemId) return { error: 'เลือกรายการ · Select an item.' }
  const res = await fileComplaintRpc({
    orderItemId,
    category: String(fd.get('category') ?? 'other'),
    severity: String(fd.get('severity') || 'medium'),
    description: String(fd.get('description') ?? '').trim() || null,
  })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/complaints')
  return { ok: true }
}

export async function setStatusAction(complaintId: string, status: string): Promise<CState> {
  const res = await setComplaintStatus({ complaintId, status, note: null })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/complaints')
  revalidatePath(`/admin/complaints/${complaintId}`)
  return { ok: true }
}

export async function assignAction(complaintId: string): Promise<CState> {
  const res = await assignComplaintToMe(complaintId)
  if (!res.ok) return { error: res.error.message }
  revalidatePath(`/admin/complaints/${complaintId}`)
  return { ok: true }
}

export async function resolveAction(
  complaintId: string, resolutionType: string, note: string | null, customerContacted: boolean,
): Promise<CState> {
  const res = await resolveComplaint({ complaintId, resolutionType, note, customerContacted })
  if (!res.ok) return { error: res.error.message }
  revalidatePath('/admin/complaints')
  revalidatePath(`/admin/complaints/${complaintId}`)
  return { ok: true }
}
