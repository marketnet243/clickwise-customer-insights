export const CHANNELS = [
  { value: "facebook", label: "Facebook" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Autre" },
] as const;
export type Channel = (typeof CHANNELS)[number]["value"];
export const channelLabel = (c: string) => CHANNELS.find((x) => x.value === c)?.label ?? c;

const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateCode(len = 7) {
  const a = crypto.getRandomValues(new Uint8Array(len));
  return [...a].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function conversionRate(signups: number, clicks: number) {
  if (clicks <= 0) return 0;
  return Math.round((signups / clicks) * 1000) / 10;
}
