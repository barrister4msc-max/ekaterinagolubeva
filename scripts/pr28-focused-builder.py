from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing snippet: {label}")
    return text.replace(old, new, 1)


# Workspace: hide navigation only for the document builder route.
p = Path("src/routes/workspace.tsx")
s = p.read_text()
s = replace_once(
    s,
    '  const isLoginRoute = location.pathname === "/workspace/login";\n',
    '  const isLoginRoute = location.pathname === "/workspace/login";\n  const isFocusedBuilderRoute = location.pathname.startsWith("/workspace/document-builder");\n',
    "workspace route flag",
)
s = replace_once(
    s,
    '        <aside className="md:w-60 md:shrink-0">',
    '        <aside className={`${isFocusedBuilderRoute ? "hidden" : ""} md:w-60 md:shrink-0`}>',
    "workspace aside",
)
s = replace_once(
    s,
    '        <main className="flex-1 min-w-0">',
    '        <main className={`flex-1 min-w-0 ${isFocusedBuilderRoute ? "w-full" : ""}`}>',
    "workspace main",
)
p.write_text(s)


# Document builder: remove dashboard-like stats/marketing and use readable semantic text.
p = Path("src/routes/workspace.document-builder.tsx")
s = p.read_text()
s = s.replace("FileSignature, ", "")
s = s.replace(", Sparkles, ShieldCheck, HelpCircle", ", HelpCircle")
s = s.replace("  selectFlagshipTaxTemplates,\n", "")

start = s.index("  const intakeSchemaByCode = useMemo(")
end = s.index("        const sortedTemplates = useMemo(() => {", start)
s = s[:start] + "  const sortedTemplates = useMemo(() => {\n" + s[end + len("        const sortedTemplates = useMemo(() => {\n") :]

header_start = s.index('      <header className="db-card p-7">')
header_end = s.index("\n\n\n      {/* STEP 1 */}", header_start)
new_header = '''      <header className="space-y-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Конструктор документов</h1>
          <p className="mt-1 text-sm text-muted-foreground">1 Шаблон → 2 Карточка → 3 Опросник</p>
        </div>
        <Stepper step={step} />
      </header>'''
s = s[:header_start] + new_header + s[header_end:]

flagship_start = s.index('          <div className="db-flagship-panel">')
flagship_end_marker = '          <div>\n            <div className="db-section-label">Шаг 1 · Юрисдикция</div>'
flagship_end = s.index(flagship_end_marker, flagship_start)
s = s[:flagship_start] + s[flagship_end:]

s = s.replace("{CATEGORY_LABELS[cat] ?? cat} · {items.length}", "{CATEGORY_LABELS[cat] ?? cat}")
found_block = '''            <div className="text-xs text-white/55">
              Найдено: <span className="text-white">{filtered.length}</span>{selected ? " · выбран шаблон" : ""}
            </div>
'''
s = s.replace(found_block, "            <div />\n")

for a, b in [
    ("text-white/85", "text-foreground"),
    ("text-white/80", "text-foreground/90"),
    ("text-white/70", "text-muted-foreground"),
    ("text-white/65", "text-muted-foreground"),
    ("text-white/60", "text-muted-foreground"),
    ("text-white/55", "text-muted-foreground"),
    ("text-white/50", "text-muted-foreground"),
    ("text-white", "text-foreground"),
    ("text-rose-300", "text-destructive"),
    ("text-amber-200/80", "text-amber-700"),
    ("border-white/10", "border-border"),
    ("bg-white/[0.03]", "bg-card/60"),
]:
    s = s.replace(a, b)
p.write_text(s)


# Intake form: no visible AI retry counter; do not block on every OCR document.
p = Path("src/components/document-builder/intake-form.tsx")
s = p.read_text()
s = s.replace("const [aiFillAttempt, setAiFillAttempt] = useState(0);\n", "")
s = s.replace("      setAiFillAttempt(0);\n", "")
s = s.replace('? `AI заполняет… попытка ${Math.max(aiFillAttempt, 1)} из 3`', '? "AI заполняет…"')

old = '''      let currentDocuments = await refreshSessionDocuments(intakeSessionId);
      const documentsWithoutText = currentDocuments.filter(
        (document) => !hasExtractedDocumentText(document.ocr_text),
      );

      for (const document of documentsWithoutText) {
        setRetryingDocumentId(document.id);
        await runExtractionWithRetry(document.id);
      }
      setRetryingDocumentId(null);

      currentDocuments = await refreshSessionDocuments(intakeSessionId);
      const readyDocs = currentDocuments.filter((document) =>
        hasExtractedDocumentText(document.ocr_text),
      );

      if (readyDocs.length === 0) {
        throw new Error(
          "Ни из одного файла не удалось извлечь текст. Используйте «Повторить извлечение» у файла.",
        );
      }

      await buildCaseIntelligenceIfReady("before_ai_fill", readyDocs);

      let fillResult: any = null;
      let lastFillError = "AI не вернул подтверждённые поля";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        setAiFillAttempt(attempt);
        const { data, error } = await supabase.functions.invoke("document-intake-ai-fill", {
          body: {
            session_id: intakeSessionId,
            document_ids: readyDocs.map((document) => document.id),
          },
        });

        const filledFields = Number(data?.filled_fields ?? 0);
        if (!error && data?.success === true && filledFields > 0) {
          fillResult = data;
          break;
        }

        lastFillError = error?.message || data?.error ||
          (data?.success === true
            ? "AI не нашёл полей с достаточной уверенностью и цитатами"
            : "AI-заполнение завершилось без результата");
        if (attempt < 3) await waitBeforeRetry(attempt);
      }
      if (!fillResult) throw new Error(`${lastFillError}. Выполнено попыток: 3.`);
'''
new = '''      let currentDocuments = await refreshSessionDocuments(intakeSessionId);
      let readyDocs = currentDocuments.filter((document) =>
        hasExtractedDocumentText(document.ocr_text),
      );
      const documentsWithoutText = currentDocuments.filter(
        (document) => !hasExtractedDocumentText(document.ocr_text),
      );

      // If at least one document is ready, start AI-fill immediately. Remaining OCR jobs
      // keep using the normal background queue. Only an all-pending package waits once.
      if (readyDocs.length === 0 && documentsWithoutText.length > 0) {
        await runBackgroundExtraction(
          documentsWithoutText.map((document) => ({
            id: document.id,
            fileName: document.file_name ?? document.title ?? document.id,
          })),
          async (document) => {
            const result = await runExtractionWithRetry(document.id);
            return { ok: result.extractionStatus === "completed" && result.textLength > 0 };
          },
          {
            isProcessing: (id) => processingDocumentIdsRef.current.has(id),
            onStart: (ids) => addProcessingDocuments(ids),
            onSettled: (document) => removeProcessingDocument(document.id),
          },
        );
        currentDocuments = await refreshSessionDocuments(intakeSessionId);
        readyDocs = currentDocuments.filter((document) => hasExtractedDocumentText(document.ocr_text));
      }

      if (readyDocs.length === 0) {
        throw new Error(
          "Ни из одного файла не удалось извлечь текст. Используйте «Повторить извлечение» у файла.",
        );
      }

      await buildCaseIntelligenceIfReady("before_ai_fill", readyDocs);

      let fillResult: any = null;
      let lastFillError = "AI не вернул подтверждённые поля";
      for (let technicalAttempt = 0; technicalAttempt < 2; technicalAttempt += 1) {
        const { data, error } = await supabase.functions.invoke("document-intake-ai-fill", {
          body: {
            session_id: intakeSessionId,
            document_ids: readyDocs.map((document) => document.id),
          },
        });

        const filledFields = Number(data?.filled_fields ?? 0);
        if (!error && data?.success === true && filledFields > 0) {
          fillResult = data;
          break;
        }

        lastFillError = error?.message || data?.error ||
          (data?.success === true
            ? "AI не нашёл полей с достаточной уверенностью и цитатами"
            : "AI-заполнение завершилось без результата");

        const status = Number((error as any)?.context?.status ?? 0);
        const transient = Boolean(error) && (
          status === 429 ||
          status >= 500 ||
          /network|fetch|timeout|temporar/i.test(error?.message ?? "")
        );
        if (!transient || technicalAttempt === 1) break;
        await waitBeforeRetry(1);
      }
      if (!fillResult) throw new Error(lastFillError);
'''
s = replace_once(s, old, new, "AI fill retry block")

for a, b in [
    ("text-white/85", "text-foreground"),
    ("text-white/70", "text-muted-foreground"),
    ("text-white/60", "text-muted-foreground"),
    ("text-white", "text-foreground"),
    ("border-white/10", "border-border"),
    ("bg-white/[0.03]", "bg-card/60"),
]:
    s = s.replace(a, b)
p.write_text(s)


Path("supabase/tests/pr28-focused-builder.test.ts").write_text('''import { describe, expect, it } from "bun:test";\nimport { readFileSync } from "node:fs";\n\nconst workspace = readFileSync("src/routes/workspace.tsx", "utf8");\nconst builder = readFileSync("src/routes/workspace.document-builder.tsx", "utf8");\nconst intake = readFileSync("src/components/document-builder/intake-form.tsx", "utf8");\n\ndescribe("PR28 focused document builder", () => {\n  it("hides workspace navigation only on the document builder route", () => {\n    expect(workspace).toContain('location.pathname.startsWith("/workspace/document-builder")');\n    expect(workspace).toContain('isFocusedBuilderRoute ? "hidden" : ""');\n  });\n\n  it("keeps the three-step framing and removes registry marketing counters", () => {\n    expect(builder).toContain("1 Шаблон → 2 Карточка → 3 Опросник");\n    expect(builder).not.toContain("Единый реестр:");\n    expect(builder).not.toContain("Всего шаблонов");\n    expect(builder).not.toContain("5 приоритетных");\n    expect(builder).not.toContain("Пять готовых сценариев");\n    expect(builder).not.toContain("Найдено:");\n  });\n\n  it("does not expose AI retry attempts", () => {\n    expect(intake).toContain('? "AI заполняет…"');\n    expect(intake).not.toContain("AI заполняет… попытка");\n    expect(intake).not.toContain("Выполнено попыток: 3");\n    expect(intake).not.toContain("setAiFillAttempt");\n  });\n\n  it("uses ready docs immediately and retries only transient transport failures", () => {\n    expect(intake).toContain("if (readyDocs.length === 0 && documentsWithoutText.length > 0)");\n    expect(intake).toContain("technicalAttempt < 2");\n    expect(intake).toContain("status === 429");\n    expect(intake).toContain("status >= 500");\n  });\n});\n''')
