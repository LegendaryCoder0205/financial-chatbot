"use client";
import React from "react";
import { StatusItem, StatusPanel, UserProfile } from "@/components/StatusPanel";

const INITIAL_ASSISTANT_MESSAGE =
  "Welcome back to the desk. I’m tracking flows, catalysts, and positioning — what should we tackle first?";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export default function Home() {
  const [messages, setMessages] = React.useState<Message[]>([
    {
      role: "assistant",
      content: INITIAL_ASSISTANT_MESSAGE,
    },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [userProfile, setUserProfile] = React.useState<UserProfile>({
    name: null,
    email: null,
    income: null,
  });
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [input]);

  const onSend = async () => {
    const content = input.trim();
    if (!content) return;

    setInput("");
    const userMessage: Message = { role: "user", content };
    const next = [...messages, userMessage];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          sessionId: sessionId || undefined,
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }
      if (data.sessionId) {
        fetchSessionProfile(data.sessionId);
      }
      const assistantReply: Message = data.reply as Message;
      setMessages([...next, assistantReply]);
    } catch (error) {
      const fallbackReply: Message = {
        role: "assistant",
        content: "Something broke on the wire. Give it another shot.",
      };
      setMessages([...next, fallbackReply]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const fetchSessionProfile = React.useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/session/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        name?: string | null;
        email?: string | null;
        income?: string | null;
      };
      setUserProfile({
        name: data.name ?? null,
        email: data.email ?? null,
        income: data.income ?? null,
      });
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    if (sessionId) {
      fetchSessionProfile(sessionId);
    }
  }, [sessionId, fetchSessionProfile]);

  const handleNewChat = React.useCallback(() => {
    setMessages([{ role: "assistant", content: INITIAL_ASSISTANT_MESSAGE }]);
    setInput("");
    setLoading(false);
    setSessionId(null);
    setUserProfile({ name: null, email: null, income: null });
    if (textareaRef.current) {
      textareaRef.current.value = "";
      textareaRef.current.style.height = "auto";
    }
  }, []);

  const statusItems = React.useMemo<StatusItem[]>(
    () => [
      {
        label: "Session",
        value: sessionId ? "Active" : "Initializing…",
        tone: sessionId ? "ok" : "idle",
        hint: sessionId
          ? `ID ${sessionId.slice(0, 8)}…`
          : "Awaiting first turn",
      },
      {
        label: "Assistant",
        value: loading ? "Generating…" : "Online",
        tone: loading ? "warn" : "ok",
        hint: loading ? "Drafting a reply" : "Standing by for prompt",
      },
    ],
    [loading, sessionId]
  );

  return (
    <main className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-[22rem] flex-none border-r border-slate-900 bg-slate-950/90 px-5 py-10 lg:flex">
        <StatusPanel statusItems={statusItems} user={userProfile} />
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="border-b border-slate-900/80 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-10">
            <div className="flex items-center gap-4 justify-between w-full">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.32em] text-slate-500">
                  Financial Bot
                </p>
                <h1 className="mt-2 text-lg font-semibold text-slate-100 sm:text-xl">
                  Personal Financial Assistant in Hedge Fund
                </h1>
              </div>
              <button
                type="button"
                onClick={handleNewChat}
                className="hidden rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-100 sm:inline-flex"
              >
                New Chat
              </button>
            </div>
            <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 sm:inline-flex">
              Live
            </span>
          </div>
        </header>

        <div className="lg:hidden px-4 pb-6 pt-6 sm:px-6">
          <StatusPanel statusItems={statusItems} user={userProfile} />
        </div>

        <div className="flex flex-1 justify-center px-4 pb-12 pt-2 sm:px-6 lg:px-10">
          <div className="flex w-full max-w-3xl flex-1 flex-col rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_40px_120px_-60px_rgba(15,23,42,0.8)] backdrop-blur">
            <div className="flex-1 space-y-6 overflow-y-auto pr-1">
              {messages.map((message, index) => {
                const isUser = message.role === "user";
                const isSystem = message.role === "system";

                const bubbleColor = isSystem
                  ? "bg-amber-400/10 border border-amber-400/40 text-amber-100"
                  : isUser
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-800/70 border border-slate-700 text-slate-100";

                const alignment = isUser ? "items-end" : "items-start";

                const label =
                  message.role === "assistant"
                    ? "Bot"
                    : message.role === "user"
                    ? "You"
                    : "System";

                return (
                  <div key={index} className={`flex flex-col ${alignment}`}>
                    <span className="mb-1 text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
                      {label}
                    </span>
                    <div
                      className={`w-fit max-w-full rounded-3xl border px-5 py-4 text-sm leading-relaxed shadow-lg ${bubbleColor}`}
                    >
                      <p className="whitespace-pre-wrap text-base leading-7">
                        {message.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-inner">
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-100 sm:hidden"
                >
                  New Chat
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Ask about markets, flows, catalysts, or setups…"
                  className="w-full resize-none rounded-xl border border-transparent bg-slate-950/80 px-4 py-3 text-base leading-6 text-slate-100 placeholder-slate-500 shadow-inner ring-1 ring-slate-800 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Press Enter to send · Shift + Enter for a new line.
                  </p>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Thinking…" : "Send"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
