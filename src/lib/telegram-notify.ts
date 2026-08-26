// Sends a Telegram message to the merchant when a new order comes in,
// using the Bot API's sendMessage endpoint directly (no SDK). Explicitly
// optional per spec: if TELEGRAM_BOT_TOKEN is missing, or the merchant
// hasn't started a chat with the bot (Bot API errors on that), we log and
// move on — a notification failure must NEVER fail the checkout itself,
// since the order is already committed by the time this runs.

interface NotifyOrderParams {
  merchantTelegramUserId: number
  trackingCode: string
  buyerName: string
  totalCentimes: number
  storeName: string
}

export async function notifyMerchantOfNewOrder(params: NotifyOrderParams): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return // notification is optional; silently skip if unconfigured

  const text = [
    `🛒 Nouvelle commande — ${params.storeName}`,
    `Code de suivi : ${params.trackingCode}`,
    `Client : ${params.buyerName}`,
    `Total : ${(params.totalCentimes / 100).toFixed(2)} DZD`,
  ].join('\n')

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: params.merchantTelegramUserId, text }),
    })
    if (!res.ok) {
      // Common cause: the merchant has never opened a DM with the bot, so
      // Telegram can't deliver to that chat_id. Not actionable here beyond
      // logging — surfacing this to the buyer would be wrong, since their
      // order succeeded regardless of whether the notification lands.
      console.error('Telegram notifyMerchantOfNewOrder failed', await res.text())
    }
  } catch (err) {
    console.error('Telegram notifyMerchantOfNewOrder threw', err)
  }
}
