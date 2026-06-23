/**
 * PromptPay dynamic-QR (EMVCo) payload generation — pure, no I/O, unit-testable.
 *
 * Builds the EMV QR Code Payment Specification string for a fixed amount, for a merchant
 * PromptPay proxy that is either a Thai mobile number (proxy type 01) or a national/tax id
 * (proxy type 02). The string is then rasterized to an image elsewhere (the `qrcode` lib).
 *
 * Verified against the standard reference vector:
 *   target '0812345678', amount 100.00 ->
 *   00020101021229370016A0000006770101110113006681234567853037645406100.005802TH6304XXXX
 *   (XXXX = CRC16/CCITT-FALSE of everything up to and including '6304')
 */

/** TLV field: id + 2-digit length + value. */
function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value
}

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF), 4 upper-hex chars. */
export function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1)
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Normalize a PromptPay target into its proxy TLV (01 mobile / 02 national-or-tax id). */
function proxyField(target: string): string {
  const digits = target.replace(/\D/g, '')
  if (digits.length === 13) return tlv('02', digits) // national id / tax id
  // mobile: 0066 + 9-digit subscriber number (drop the leading 0 of a 10-digit Thai mobile)
  let m = digits
  if (m.length === 10 && m.startsWith('0')) m = '66' + m.slice(1)
  else if (m.startsWith('66')) m = m // already country-coded
  return tlv('01', m.padStart(13, '0'))
}

/**
 * Build the EMVCo PromptPay payload for a fixed amount.
 * @param target merchant PromptPay id (mobile or national/tax id)
 * @param amountSatang integer minor units (satang)
 */
export function promptPayPayload(target: string, amountSatang: number): string {
  const merchant = tlv('29', '0016A000000677010111' + proxyField(target))
  const amount = tlv('54', (amountSatang / 100).toFixed(2))
  const body =
    tlv('00', '01') + // payload format indicator
    tlv('01', '12') + // point of initiation: 12 = dynamic (one-time, with amount)
    merchant +
    tlv('53', '764') + // currency THB
    amount +
    tlv('58', 'TH') + // country
    '6304' // CRC tag + length placeholder
  return body + crc16(body)
}
