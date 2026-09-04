// Merchant WhatsApp "click to chat" deep links. Unlike telegram-links.ts,
// this has no Mini App / bot concept to worry about — wa.me is a free,
// unauthenticated WhatsApp feature: it just opens a chat with a phone
// number, nothing more. No app registration, tokens, or Meta Cloud API
// involved (see whatsapp_number on merchants — plain optional text field).

/**
 * Normalizes a merchant-entered phone number into the digits-only,
 * country-code-first form wa.me requires (e.g. "0555 12 34 56" or
 * "+213555123456" both become "213555123456"). Algeria-specific
 * assumption: a number typed in the local 0X... form (10 digits, starts
 * with 0) is assumed to be an Algerian mobile number and gets the '213'
 * country code prefixed automatically, since that's how merchants here
 * will naturally type their own number.
 */
export function normalizeWhatsAppNumber(input: string): string {
  const digitsOnly = input.replace(/\D/g, '')
  if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    return `213${digitsOnly.slice(1)}`
  }
  return digitsOnly
}

/**
 * A merchant's own WhatsApp contact link (https://wa.me/<number>).
 * whatsapp_number is optional on the merchants table, so callers should
 * treat a null/empty number as "no button" rather than passing it here.
 * `prefillText`, if given, pre-fills the chat's message box (the buyer
 * still has to tap send — this never sends anything automatically).
 */
export function buildMerchantWhatsAppLink(whatsappNumber: string, prefillText?: string): string {
  const number = normalizeWhatsAppNumber(whatsappNumber)
  const base = `https://wa.me/${number}`
  return prefillText ? `${base}?text=${encodeURIComponent(prefillText)}` : base
}
