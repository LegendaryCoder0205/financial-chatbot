export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type SessionRecord = {
  id: string;
  createdAt: number;
  name?: string | null;
  email?: string | null;
  income?: string | null;
};

export type DeliveryResult = { ok: boolean; id?: string; destination: string; note?: string };

