import { describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const intakePath = join(testsDirectory, "../../src/components/document-builder/intake-form.tsx");

describe("document intake retry flow", () => {
  test("retries extraction without creating another document row", async () => {
    const source = await Bun.file(intakePath).text();
    expect(source).toContain("runExtractionWithRetry");
    expect(source).toContain('"Повторить извлечение"');
    expect(source).toContain("await runExtractionWithRetry(document.id)");
  });

  test("retries AI fill three times and treats an empty fill as unsuccessful", async () => {
    const source = await Bun.file(intakePath).text();
    expect(source).toContain("attempt <= 3");
    expect(source).toContain("filledFields > 0");
    expect(source).toContain('"Повторить AI-заполнение"');
    expect(source).toContain("уже сохранённые ответы не потеряются");
  });
});
