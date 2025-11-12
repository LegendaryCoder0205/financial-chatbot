# MVP Trader Bot

Minimal Next.js app implementing:
- Personalized chatbot persona (stock market veteran tone)
- RAG (single file) via in-memory vector retrieval (embeddings via OpenAI)
- SQLite session storage (name, email, income)
- Structured delivery via SMTP or file fallback

## Quickstart

1) Set env vars in `.env.local` at project root:

```
OPENAI_API_KEY=sk-...
# Optional - choose chat & embedding models
MODEL=gpt-4o-mini
EMBED_MODEL=text-embedding-3-small
# Optional - SQLite file
SQLITE_PATH=./data.sqlite
# Optional - RAG file path (relative or absolute)
RAG_FILE=./knowledge.txt
# Optional - delivery via SMTP
DELIVER_TO_EMAIL=you@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass
```

2) Install & run:

```
npm install
npm run dev
```

3) Place your knowledge file at `knowledge.txt` (or set `RAG_FILE`). The RAG index builds on first request.

4) Use the UI to chat. The bot will organically ask for name, email, and income. When all are captured, POST to `/api/deliver` with `sessionId` returned by `/api/chat` responses to send/store the structured record.

## ChromaDB Upgrade (Notes)
- This MVP uses an in-memory vector store to avoid running Chroma server. To migrate: spin up a Chroma server (Docker or `chroma run`) and replace `src/lib/rag.ts` store with the Chroma JS client (`chromadb`), persisting embeddings and metadata by `collection.add` / `query`.
- Keep `embedTexts` as-is; inject collection operations in place of in-memory arrays.

## Tech
- Next.js App Router, TypeScript
- OpenAI SDK for chat + embeddings
- `better-sqlite3` for local storage
- `nodemailer` for delivery

## Demo Flow
- Ask a market question; bot answers with persona and may include RAG context.
- Provide your name/email/income naturally in any turn; fields are extracted and saved.
- Call `/api/deliver` to email or save a file with structured session data.

