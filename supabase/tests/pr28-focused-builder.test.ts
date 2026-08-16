import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const workspace = readFileSync("src/routes/workspace.tsx", "utf8");
const builder = readFileSync("src/routes/workspace.document-builder.tsx", "utf8");
const intake = readFileSync("src/components/document-builder/intake-form.tsx", "utf8");

describe("PR28 focused document builder", () => {
  it("hides workspace navigation only on the document builder route", () => {
    expect(workspace).toContain('location.pathname.startsWith("/workspace/document-builder")');
    expect(workspace).toContain('isFocusedBuilderRoute ? "hidden" : ""');
  });

  it("keeps the three-step framing and removes registry marketing counters", () => {
    expect(builder).toContain("1 Шаблон → 2 Карточка → 3 Опросник");
    expect(builder).not.toContain("Единый реестр:");
    expect(builder).not.toContain("Всего шаблонов");
    expect(builder).not.toContain("5 приоритетных");
    expect(builder).not.toContain("Пять готовых сценариев");
    expect(builder).not.toContain("Найдено:");
  });

  it("does not expose AI retry attempts", () => {
    expect(intake).toContain('? "AI заполняет…"');
    expect(intake).not.toContain("AI заполняет… попытка");
    expect(intake).not.toContain("Выполнено попыток: 3");
    expect(intake).not.toContain("setAiFillAttempt");
  });

  it("uses ready docs immediately and retries only transient transport failures", () => {
    expect(intake).toContain("if (readyDocs.length === 0 && documentsWithoutText.length > 0)");
    expect(intake).toContain("technicalAttempt < 2");
    expect(intake).toContain("status === 429");
    expect(intake).toContain("status >= 500");
  });
});
