export type ExistingIntakeAnswer = {
  id: string;
  value_source: string | null;
  is_verified: boolean | null;
};

export const AI_OWNED_VALUE_SOURCES = ["ai_document", "ai_extracted"] as const;

export function mayReplaceAnswerWithAi(answer: ExistingIntakeAnswer | null | undefined): boolean {
  if (!answer) return true;
  return (
    answer.is_verified !== true &&
    AI_OWNED_VALUE_SOURCES.includes(answer.value_source as (typeof AI_OWNED_VALUE_SOURCES)[number])
  );
}
