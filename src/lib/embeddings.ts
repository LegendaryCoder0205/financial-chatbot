import OpenAI from 'openai';

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = getOpenAI();
  const model = process.env.EMBED_MODEL || 'text-embedding-3-small';
  const res = await client.embeddings.create({ model, input: texts });
  console.log('res from em', res)
  return res.data.map((d) => d.embedding as number[]);
}

export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

