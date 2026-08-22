export type ExistingIntakeAnswer = {
  id: string;
  value_source: string | null;
  is_verified: boolean | null;
  confidence: number | null;
};

export type CandidateIntakeAnswer = {
  confidence: number;
};

export const AI_OWNED_VALUE_SOURCES = ["ai_document", "ai_extracted"] as const;

export function mayReplaceAnswerWithAi(
  answer: ExistingIntakeAnswer | null | undefined,
  candidate: CandidateIntakeAnswer,
): boolean {
  if (!answer) return true;
  if (answer.is_verified === true) return false;
  if (!AI_OWNED_VALUE_SOURCES.includes(answer.value_source as (typeof AI_OWNED_VALUE_SOURCES)[number])) {
    return false;
  }
  return candidate.confidence > Number(answer.confidence ?? 0);
}
