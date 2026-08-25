import { describe, expect, test } from "bun:test";
import { extractExactArticleText } from "./pravo-article-text.ts";

describe("Pravo article text extraction", () => {
  test("extracts one bounded article", () => {
    const text = [
      "Статья 54.1. Пределы осуществления прав",
      "1. Не допускается уменьшение налоговой базы.",
      "Статья 54.2. Общие положения",
      "Следующий текст.",
    ].join("\n");
    expect(extractExactArticleText(text, "54.1")).toBe(
      "Статья 54.1. Пределы осуществления прав\n1. Не допускается уменьшение налоговой базы.",
    );
  });

  test("rejects title-only and ambiguous input", () => {
    expect(extractExactArticleText("Статья 54.1. Заголовок", "54.1")).toBeNull();
    expect(
      extractExactArticleText(
        "Статья 54.1. Один текст\nДлинное содержание нормы.",
        "54.1",
      ),
    ).toBeNull();
  });
});
