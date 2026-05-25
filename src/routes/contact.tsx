import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowUpRight, MessageCircle, Sparkles, Check, Loader2 } from "lucide-react";
import { classifyAndAskFn, finalizeLeadFn } from "@/lib/intake.functions";
import { ContactChannels } from "@/components/contact-channels";
import { CONSENT_TEXT_FORM, CONSENT_VERSION, PRIVACY_POLICY_VERSION } from "@/lib/consent";


export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Контакты — спокойно сформулировать обращение | Екатерина Голубева" },
      {
        name: "description",
        content:
          "Кратко опишите ситуацию — AI-помощник поможет структурировать обращение, уточнит детали и подготовит информацию для разбора.",
      },
      { property: "og:title", content: "Контакты — Екатерина Голубева" },
    ],
  }),
  component: ContactPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  недвижимость: "Недвижимость",
  аренда: "Аренда",
  "коммерческая аренда": "Коммерческая аренда",
  договоры: "Договоры",
  суд: "Судебный спор",
  representation_abroad: "Клиент за границей",
  приставы: "Приставы",
  наследство: "Наследство",
  "раздел имущества": "Раздел имущества",
  иное: "Иное",
};

type QA = { question: string; answer: string };
type Step = "intro" | "questions" | "submitting" | "done";

function ContactPage() {
  const classify = useServerFn(classifyAndAskFn);
  const finalize = useServerFn(finalizeLeadFn);

  const [step, setStep] = useState<Step>("intro");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [qa, setQa] = useState<QA[]>([]);
  const [currentQ, setCurrentQ] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);


  async function startIntake(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!consent) {
      setErr("Для отправки нужно дать согласие на обработку персональных данных.");
      return;
    }
    if (!name.trim() || !phone.trim() || originalText.trim().length < 10) {
      setErr("Заполните имя, телефон и кратко опишите ситуацию (минимум 10 символов).");
      return;
    }
    setLoading(true);

    try {
      const res = await classify({ data: { original_text: originalText.trim(), qa: [] } });
      setCategory(res.category);
      if (res.done || !res.next_question) {
        await submitFinal(res.category, []);
      } else {
        setCurrentQ(res.next_question);
        setStep("questions");
      }
    } catch (e) {
      console.error(e);
      // Fallback: skip AI, submit as-is
      await submitFinal(null, []);
    } finally {
      setLoading(false);
    }
  }

  async function answerCurrent(e: React.FormEvent) {
    e.preventDefault();
    if (!currentQ || !currentAnswer.trim()) return;
    setLoading(true);
    setErr(null);
    const newQa = [...qa, { question: currentQ, answer: currentAnswer.trim() }];
    setQa(newQa);
    setCurrentAnswer("");
    setCurrentQ(null);
    try {
      const res = await classify({ data: { original_text: originalText.trim(), qa: newQa } });
      setCategory(res.category);
      if (res.done || !res.next_question) {
        await submitFinal(res.category, newQa);
      } else {
        setCurrentQ(res.next_question);
      }
    } catch (e) {
      console.error(e);
      await submitFinal(category, newQa);
    } finally {
      setLoading(false);
    }
  }

  async function submitFinal(cat: string | null, finalQa: QA[]) {
    setStep("submitting");
    try {
      await finalize({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          contact: contact.trim() || undefined,
          original_text: originalText.trim(),
          category: (cat && CATEGORY_LABEL[cat] ? cat : null) as never,
          qa: finalQa,
        },
      });
      setStep("done");
    } catch (e) {
      console.error(e);
      setErr(e instanceof Error ? e.message : "Не удалось отправить обращение");
      setStep("questions");
    }
  }

  async function skipToSubmit() {
    await submitFinal(category, qa);
  }

  return (
    <main className="container-wide py-20 md:py-28">
      <div className="grid gap-16 md:grid-cols-12">
        {/* LEFT — header + contacts */}
        <div className="md:col-span-5">
          <div className="eyebrow mb-5">Контакты</div>
          <h1 className="text-4xl md:text-5xl leading-[1.08]">
            Кратко опишите ситуацию —<br />
            <span className="italic text-primary">помогу понять, с чего начать</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            AI-помощник поможет структурировать обращение, уточнит важные детали
            и подготовит информацию для дальнейшего разбора ситуации мной.
            Это позволит быстрее понять проблему, оценить возможные риски
            и сэкономит ваше время.
          </p>

          <div className="mt-10 space-y-0">
            <ContactChannels variant="minimal" className="space-y-0" />
          </div>
        </div>

        {/* RIGHT — intake card */}
        <div className="md:col-span-7">
          <div className="card-soft relative overflow-hidden">
            {category && step !== "done" && (
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <Sparkles size={12} className="text-primary" />
                {CATEGORY_LABEL[category] ?? category}
              </div>
            )}

            {step === "intro" && (
              <form className="space-y-5" onSubmit={startIntake}>
                <Field label="Имя">
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Как к вам обращаться"
                    maxLength={200}
                    className="input-line"
                  />
                </Field>
                <Field label="Телефон">
                  <input
                    required
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7"
                    maxLength={50}
                    className="input-line"
                  />
                </Field>
                <Field label="Telegram / WhatsApp / Email (по желанию)">
                  <input
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="@username или email"
                    maxLength={200}
                    className="input-line"
                  />
                </Field>
                <Field label="Кратко опишите ситуацию">
                  <textarea
                    required
                    rows={5}
                    value={originalText}
                    onChange={(e) => setOriginalText(e.target.value)}
                    placeholder="Например: хочу продать квартиру, но есть ограничения от приставов."
                    maxLength={5000}
                    className="input-line resize-none"
                  />
                </Field>

                {err && <p className="text-sm text-destructive">{err}</p>}

                <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Анализирую…
                    </>
                  ) : (
                    <>
                      Продолжить <ArrowUpRight size={16} />
                    </>
                  )}
                </button>
                <p className="text-xs text-muted-foreground">
                  Нажимая кнопку, вы соглашаетесь с обработкой персональных данных.
                  Информация конфиденциальна.
                </p>
              </form>
            )}

            {step === "questions" && (
              <div className="space-y-6">
                {qa.length > 0 && (
                  <div className="space-y-3 border-b border-border pb-5">
                    {qa.map((x, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <Check size={14} className="mt-1 shrink-0 text-primary" />
                        <div>
                          <div className="text-muted-foreground">{x.question}</div>
                          <div className="text-foreground">{x.answer}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {currentQ && (
                  <form onSubmit={answerCurrent} key={qa.length} className="space-y-4 animate-in fade-in duration-300">
                    <Field label={`Уточнение ${qa.length + 1} из не более 5`}>
                      <div className="font-display text-xl text-foreground">{currentQ}</div>
                    </Field>
                    <textarea
                      autoFocus
                      required
                      rows={3}
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      placeholder="Короткий ответ…"
                      maxLength={1500}
                      className="input-line resize-none"
                    />
                    {err && <p className="text-sm text-destructive">{err}</p>}
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpRight size={16} />}
                        {loading ? "Думаю…" : "Дальше"}
                      </button>
                      <button
                        type="button"
                        onClick={skipToSubmit}
                        disabled={loading}
                        className="link-underline text-sm text-muted-foreground"
                      >
                        Достаточно, отправить
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {step === "submitting" && (
              <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                <Loader2 size={28} className="animate-spin text-primary" />
                <div className="font-display text-xl">Готовлю обращение…</div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Структурирую информацию и передаю Екатерине.
                </p>
              </div>
            )}

            {step === "done" && (
              <div className="space-y-5 py-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-primary">
                  <Check size={12} /> Обращение передано
                </div>
                <h2 className="text-2xl md:text-3xl">
                  Спасибо, {name.split(" ")[0]}.<br />
                  <span className="italic text-primary">Я свяжусь с вами в рабочее время.</span>
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Ваше обращение структурировано и передано мне на разбор. Если ситуация срочная —
                  напишите в WhatsApp или Telegram, я отвечу быстрее.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <ContactChannels variant="ghost" showLabels showEmail={false} />
                  <Link to="/" className="btn-ghost btn-ghost--equal">
                    На главную <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
