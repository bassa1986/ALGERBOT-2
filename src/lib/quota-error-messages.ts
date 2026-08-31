import { TrialExpiredError, StorageQuotaExceededError, ProductLimitExceededError } from '~/lib/quota'
import { PayloadTooLargeError } from '~/lib/image-optimizer'

export function quotaErrorToMessage(err: unknown, locale: 'ar' | 'fr'): string | null {
  if (err instanceof TrialExpiredError) {
    return locale === 'ar'
      ? 'انتهت فترتك التجريبية أو اشتراكك. يرجى الدفع لمتابعة إضافة المنتجات والصور.'
      : "Votre période d'essai ou votre abonnement a expiré. Veuillez payer pour continuer."
  }
  if (err instanceof StorageQuotaExceededError) {
    const usedMb = (err.usedBytes / 1_048_576).toFixed(1)
    const limitMb = (err.limitBytes / 1_048_576).toFixed(0)
    return locale === 'ar'
      ? `لقد تجاوزت مساحة التخزين المسموحة (${usedMb} / ${limitMb} ميغابايت). احذف بعض الصور لمتابعة الرفع.`
      : `Quota de stockage dépassé (${usedMb} / ${limitMb} Mo). Supprimez des images pour continuer.`
  }
  if (err instanceof ProductLimitExceededError) {
    return locale === 'ar'
      ? `لقد وصلت إلى الحد الأقصى لعدد المنتجات (${err.max}) في خطتك الحالية.`
      : `Limite de ${err.max} produits atteinte pour votre forfait.`
  }
  if (err instanceof PayloadTooLargeError) {
    return locale === 'ar'
      ? 'حجم الصورة كبير جدًا (الحد الأقصى 5 ميغابايت).'
      : 'Image trop volumineuse (maximum 5 Mo).'
  }
  return null // not a quota error — caller should re-throw / handle normally
}
