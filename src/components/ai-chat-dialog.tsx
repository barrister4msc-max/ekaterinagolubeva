import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import { Link } from "@tanstack/react-router";
import { Send, X, Sparkles } from "lucide-react";

export function AiChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 px-4 pb-6 pt-20 backdrop-blur-sm md:items-center md:p-6">
      <div className="flex h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            <div>
              <div className="font-display text-base leading-tight">Ассистент</div>
              <div className="text-[11px] text-muted-foreground">Быстрый ответ по теме недвижимости и договоров</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-secondary/50 hover:text-foreground" aria-label="Закрыть">
            <X size={16}/>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm">
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Отправляя сообщение, вы соглашаетесь с обработкой персональных данных и использованием AI-ассистента для предварительного анализа обращения. AI-ассистент не заменяет индивидуальную юридическую консультацию. Подробнее:{" "}
            <Link to="/privacy" onClick={onClose} className="text-primary underline underline-offset-2">/privacy</Link>{" "}и{" "}
            <Link to="/consent" onClick={onClose} className="text-primary underline underline-offset-2">/consent</Link>.
          </div>
          {messages.length === 0 && (
            <div className="rounded-lg bg-secondary/40 p-4 text-foreground/75">
              Здравствуйте. Опишите ситуацию — подскажу общие шаги. Для детальной работы лучше оставить{" "}
              <Link to="/contact" onClick={onClose} className="text-primary underline underline-offset-2">заявку</Link>.
            </div>
          )}


          {messages.map((m) => {
            const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
            const isUser = m.role === "user";
            return (
              <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                    isUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/50 text-foreground"
                  }`}
                >
                  {isUser ? (
                    <span className="whitespace-pre-wrap">{text}</span>
                  ) : (
                    <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2">
                      <ReactMarkdown>{text || "…"}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              Не удалось получить ответ. Попробуйте ещё раз или{" "}
              <Link to="/contact" onClick={onClose} className="underline">оставьте заявку</Link>.
            </div>
          )}
        </div>

        <form onSubmit={submit} className="border-t border-border/60 bg-background/60 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(e as unknown as React.FormEvent);
                }
              }}
              rows={1}
              placeholder="Ваш вопрос…"
              className="max-h-32 flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary disabled:opacity-50"
            >
              <Send size={14}/>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
