// Phase A — AI Challenge / Critical Review pass.
// Second LLM pass INSIDE analyze-document-legal-position (no new edge function).
// Receives the first-pass analysis + trusted sources + conclusions and must
// surface adverse practice, superseded sources, hallucinations, new editions,
// special vs general norm conflicts, weak evidence, unrebutted opponent arguments.

import { callGeminiWithFallback, FLASH_GEMINI_MODELS } from "./gemini-fallback.ts";
import { safeParseGeminiJson } from "./merge.ts";
import type { Conclusion, TrustedSource } from "./enrich.ts";

export type ChallengeResult = {
  status: "passed" | "needs_revision" | "blocked";
  issues: Array<{
    kind:
      | "adverse_practice"
      | "newer_court_decision"
      | "newer_norm_revision"
      | "special_vs_general"
      | "norm_conflict"
      | "weak_evidence"
      | "unrebutted_opponent_argument"
      | "hallucinated_source"
      | "low_trust_source_used";
    description: string;
    affected_conclusions: string[];
    affected_sources: string[];
  }>;
  required_changes: string[];
  adverse_sources: string[];
  unresolved_risks: string[];
  reasoning: string;
};

const EMPTY_RESULT: ChallengeResult = {
  status: "passed",
  issues: [],
  required_changes: [],
  adverse_sources: [],
  unresolved_risks: [],
  reasoning: "Challenge pass skipped (no LLM key) or returned no issues.",
};

export async function runChallenge(opts: {
  parsed: any;
  trusted: TrustedSource[];
  conclusions: Conclusion[];
}): Promise<ChallengeResult> {
  // Deterministic seed: pre-fill issues we already know from enrich phase.
  const seedIssues: ChallengeResult["issues"] = [];
  const adverseRefs = new Set<string>();

  // Hallucinated sources
  const hallucinatedConclusions = opts.conclusions
    .filter((c) => c.provenance.hallucinated_source)
    .map((c) => c.conclusion_id);
  if (hallucinatedConclusions.length > 0) {
    seedIssues.push({
      kind: "hallucinated_source",
      description:
        "Один или несколько выводов ссылаются на источник, которого нет в реестре найденных источников.",
      affected_conclusions: hallucinatedConclusions,
      affected_sources: [],
    });
  }
  // Low-trust / superseded sources — only treat as a challenge issue when
  // they are actually used in a conclusion. Otherwise this is a warning,
  // surfaced via buildSourceWarnings(), not a blocker.
  const usedRefs = new Set<string>();
  for (const c of opts.conclusions) {
    for (const r of [
      ...c.provenance.laws_used,
      ...c.provenance.court_practice_used,
      ...c.provenance.letters_used,
      ...c.provenance.ekaterina_used,
      ...c.provenance.manuals_used,
    ])
      usedRefs.add(r);
  }
  for (const s of opts.trusted) {
    const actuallyUsed = usedRefs.has(s.source_ref);
    if (!actuallyUsed) continue;
    if (s.superseded_by) {
      adverseRefs.add(s.source_ref);
      seedIssues.push({
        kind: "newer_norm_revision",
        description: `Источник ${s.source_ref} вытеснен более авторитетным ${s.superseded_by} (${s.lower_priority_reason ?? "приоритет"}), но используется в выводах.`,
        affected_conclusions: opts.conclusions
          .filter((c) =>
            [
              ...c.provenance.laws_used,
              ...c.provenance.court_practice_used,
              ...c.provenance.letters_used,
              ...c.provenance.ekaterina_used,
              ...c.provenance.manuals_used,
            ].includes(s.source_ref),
          )
          .map((c) => c.conclusion_id),
        affected_sources: [s.source_ref],
      });
    } else if (!s.use_in_generation) {
      adverseRefs.add(s.source_ref);
      seedIssues.push({
        kind: "low_trust_source_used",
        description: `Источник ${s.source_ref} помечен use_in_generation=false (${s.trust_reason}), но используется в выводах.`,
        affected_conclusions: opts.conclusions
          .filter((c) =>
            [
              ...c.provenance.laws_used,
              ...c.provenance.court_practice_used,
              ...c.provenance.letters_used,
              ...c.provenance.ekaterina_used,
              ...c.provenance.manuals_used,
            ].includes(s.source_ref),
          )
          .map((c) => c.conclusion_id),
        affected_sources: [s.source_ref],
      });
    }
  }

  // LLM pass (cheap flash model). Skips silently when key absent.
  let llmIssues: ChallengeResult["issues"] = [];
  let llmReasoning = "";
  try {
    if (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("LOVABLE_API_KEY")) {
      const prompt = buildChallengePrompt(opts);
      const { text } = await callGeminiWithFallback(prompt, {
        models: FLASH_GEMINI_MODELS,
        temperature: 0.15,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      });
      if (text) {
        const parsed = safeParseGeminiJson(text) as Partial<ChallengeResult>;
        if (Array.isArray(parsed?.issues)) llmIssues = parsed.issues;
        if (typeof parsed?.reasoning === "string") llmReasoning = parsed.reasoning;
        for (const r of parsed?.adverse_sources ?? []) {
          if (typeof r === "string") adverseRefs.add(r);
        }
      }
    }
  } catch (e) {
    console.warn("[challenge] LLM pass failed:", (e as Error).message);
  }

  const issues = [...seedIssues, ...llmIssues];
  // Phase B correction — only TRUE critical issues block generation.
  // Superseded sources by themselves are warnings, NOT blockers; they only
  // become blockers when actually_used_in_generation=true (handled above by
  // emitting newer_norm_revision/low_trust_source_used only for used refs).
  const BLOCKING_KINDS = new Set([
    "hallucinated_source",
    "missing_applicable_norm",
    "outdated_law_without_replacement",
    "critical_missing_evidence",
    "critical_legal_contradiction",
    // these are already filtered above to only fire when actually_used:
    "low_trust_source_used",
    "newer_norm_revision",
  ]);
  const blocked = issues.some((i) => BLOCKING_KINDS.has(i.kind));
  const needsRevision = issues.length > 0 && !blocked;

  return {
    status: blocked ? "blocked" : needsRevision ? "needs_revision" : "passed",
    issues,
    required_changes: deriveRequiredChanges(issues),
    adverse_sources: [...adverseRefs],
    unresolved_risks: deriveUnresolvedRisks(issues),
    reasoning: llmReasoning || EMPTY_RESULT.reasoning,
  };
}


function deriveRequiredChanges(issues: ChallengeResult["issues"]): string[] {
  const out: string[] = [];
  for (const i of issues) {
    switch (i.kind) {
      case "hallucinated_source":
        out.push("Удалить ссылки на источники, отсутствующие в реестре найденных источников.");
        break;
      case "newer_norm_revision":
        out.push("Заменить устаревшую редакцию нормы на актуальную.");
        break;
      case "newer_court_decision":
        out.push("Обновить судебную практику на более новое решение по тому же вопросу.");
        break;
      case "special_vs_general":
        out.push("Применить специальную норму вместо общей.");
        break;
      case "norm_conflict":
        out.push("Разрешить коллизию норм и обосновать выбор.");
        break;
      case "weak_evidence":
        out.push("Усилить доказательственную базу или зафиксировать как weak_point.");
        break;
      case "unrebutted_opponent_argument":
        out.push("Добавить контраргумент на позицию оппонента.");
        break;
      case "low_trust_source_used":
        out.push("Исключить источник с use_in_generation=false из правовой позиции.");
        break;
      case "adverse_practice":
        out.push("Отразить противоположную практику и обосновать отличие текущего дела.");
        break;
    }
  }
  return Array.from(new Set(out));
}

function deriveUnresolvedRisks(issues: ChallengeResult["issues"]): string[] {
  return issues
    .filter((i) =>
      ["adverse_practice", "unrebutted_opponent_argument", "weak_evidence"].includes(i.kind),
    )
    .map((i) => i.description);
}

function buildChallengePrompt(opts: {
  parsed: any;
  trusted: TrustedSource[];
  conclusions: Conclusion[];
}): string {
  const compactSources = opts.trusted.slice(0, 30).map((s) => ({
    ref: s.source_ref,
    bucket: s.bucket,
    title: s.title,
    trust: s.trust_score,
    use_in_generation: s.use_in_generation,
    superseded_by: s.superseded_by,
  }));
  const compactConclusions = opts.conclusions.map((c) => ({
    id: c.conclusion_id,
    kind: c.kind,
    statement: c.statement.slice(0, 220),
    laws: c.provenance.laws_used,
    court: c.provenance.court_practice_used,
    letters: c.provenance.letters_used,
  }));
  return `Ты — критический рецензент юридического анализа. Найди слабые места и риски.

ИСТОЧНИКИ (ref → trust → use_in_generation/superseded_by):
${JSON.stringify(compactSources)}

ВЫВОДЫ (conclusion_id + использованные источники):
${JSON.stringify(compactConclusions)}

Найди:
- adverse_practice: судебная практика ПРОТИВ позиции
- newer_court_decision: более новое решение по тому же вопросу
- newer_norm_revision: более новая редакция нормы
- special_vs_general: специальная норма вместо общей
- norm_conflict: коллизии норм
- weak_evidence: слабые доказательства
- unrebutted_opponent_argument: неотбитый аргумент оппонента

Верни СТРОГО ОДИН JSON:
{
  "issues":[{"kind":"...","description":"...","affected_conclusions":["c_..."],"affected_sources":["..."]}],
  "adverse_sources":["..."],
  "reasoning":"короткое объяснение"
}
Никаких markdown, комментариев, trailing commas.`;
}
