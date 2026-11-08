import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type ChatTurn } from "@/lib/api";

type Message = { id: string; role: "user" | "assistant"; text: string; failed?: boolean };
type RetryRequest = { message: string; history: ChatTurn[]; errorId: string };

const SUGGESTIONS = [
  "How can I identify a fake job?",
  "What are common internship scams?",
  "Is paying a registration fee safe?",
  "How do I verify a company?",
  "What does a high-risk score mean?",
  "How do I analyze a screenshot?",
  "How can I report a suspicious job?",
];

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  text: "Hi! I’m the InternShield AI Assistant. Ask me about job safety, suspicious offers, or how to use InternShield.",
};

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [loading, setLoading] = useState(false);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const messagesRef = useRef(messages);
  const busyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const updateMessages = (updater: (current: Message[]) => Message[]) => {
    setMessages((current) => {
      const next = updater(current);
      messagesRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const requestReply = async (
    message: string,
    priorHistory?: ChatTurn[],
    retryErrorId?: string,
  ) => {
    const text = message.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setLoading(true);

    const history =
      priorHistory ??
      messagesRef.current
        .filter((item) => item.id !== "welcome" && !item.failed)
        .slice(-8)
        .map(({ role, text: content }) => ({ role, content: content.slice(0, 1600) }));

    if (retryErrorId) {
      updateMessages((current) => current.filter((item) => item.id !== retryErrorId));
    } else {
      updateMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
    }
    setRetryRequest(null);

    try {
      const response = await api.chat({ message: text, history });
      updateMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: response.reply },
      ]);
      setInput((current) => (current === text ? "" : current));
    } catch (error) {
      const messageError =
        error instanceof Error
          ? error.message
          : "The assistant is temporarily unavailable. Please retry.";
      const status = (error as Error & { status?: number }).status;
      const safeMessage =
        status === 401
          ? "Your session could not be verified. Sign in again, then retry."
          : messageError;
      const errorId = crypto.randomUUID();
      updateMessages((current) => [
        ...current,
        { id: errorId, role: "assistant", text: safeMessage, failed: true },
      ]);
      setInput((current) => (current ? current : text));
      setRetryRequest({ message: text, history, errorId });
    } finally {
      busyRef.current = false;
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const send = () => {
    if (canSend) void requestReply(input);
  };

  const resetConversation = () => {
    if (busyRef.current) return;
    messagesRef.current = [WELCOME];
    setMessages([WELCOME]);
    setRetryRequest(null);
    setInput("");
  };

  return (
    <>
      <button
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-cyber text-primary-foreground shadow-glow transition-transform hover:scale-105 sm:bottom-6 sm:right-6"
        aria-label={open ? "Close chat" : "Open chat"}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="InternShield AI Assistant"
          className="glass fixed bottom-[4.75rem] right-2 z-50 flex h-[min(70vh,560px)] w-[calc(100vw-1rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-border shadow-card animate-in fade-in slide-in-from-bottom-3 sm:bottom-24 sm:right-6"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-cyber">
              <Bot className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">InternShield AI Assistant</div>
              <div className="text-xs text-muted-foreground">Job and internship safety</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetConversation}
              disabled={loading}
              aria-label="Start a new conversation"
              title="New conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </header>

          <div
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
            aria-live="polite"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : message.failed
                        ? "border border-destructive/30 bg-destructive/5 text-foreground"
                        : "bg-muted text-foreground"
                  }`}
                >
                  {message.text}
                  {message.failed && retryRequest?.errorId === message.id && (
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 block h-auto px-0 text-destructive"
                      onClick={() =>
                        void requestReply(
                          retryRequest.message,
                          retryRequest.history,
                          retryRequest.errorId,
                        )
                      }
                      disabled={loading}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => void requestReply(suggestion)}
                    disabled={loading}
                    className="rounded-full border border-border bg-background/70 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground"
                  role="status"
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            className="flex shrink-0 items-end gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 1500))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="Ask about a job offer…"
              rows={1}
              maxLength={1500}
              disabled={loading}
              aria-label="Message the InternShield assistant"
              className="max-h-28 min-h-10 resize-none py-2 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label="Send message"
              className="h-10 w-10 shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
          <div className="px-3 pb-2 text-[10px] text-muted-foreground">
            Helpful guidance, not proof that a company or job is legitimate.
          </div>
        </section>
      )}
    </>
  );
}
