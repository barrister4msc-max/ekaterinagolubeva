/**
 * Canonical contact / identity fallback for the public site.
 * Admin-edited values in site_settings override these per field; if a field is
 * empty in site_settings (null / undefined / ""), the value here is used.
 */
export const CONTACT_FALLBACK = {
  legal_form: "Самозанятый",
  legal_full_name: "Голубева Е. А.",
  legal_full_name_long: "Голубева Екатерина Александровна",
  legal_address: "Москва, Россия",
  contact_phone: "+7 (995) 099-58-98",
  contact_phone_tel: "tel:+79950995898",
  contact_email: "legallife2026@yandex.ru",
} as const;

export function pick<T extends string | null | undefined>(
  v: T,
  fallback: string,
): string {
  if (!v) return fallback;
  const trimmed = String(v).trim();
  return trimmed === "" ? fallback : trimmed;
}
