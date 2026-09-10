from pathlib import Path

path = Path("supabase/functions/analyze-document-legal-position/repositories.ts")
text = path.read_text(encoding="utf-8")

old_import = 'import { sourceFamilyMetadataForType, sourceTypesForBucket } from "./source-family-contract.ts";\n'
new_import = old_import + 'import { searchOfficialCollectorArtifacts } from "./official-collector-artifacts.ts";\n'
if new_import not in text:
    if old_import not in text:
        raise SystemExit("import anchor missing")
    text = text.replace(old_import, new_import, 1)

old_block = '''  const searchOfficialPerIssue = async (): Promise<{
    sources: OfficialSourceResult[];
    diagnostics: OfficialSourceDiagnostics;
  }> => {
    const questions = researchPlan.questions.filter((question) => question.buckets.includes("laws"));
    const results = await Promise.all(
      questions.map(async (question) => ({
        question,
        result: await searchOfficialLegalSources(queryForQuestion(query, question)),
      })),
    );

    const annotated: OfficialSourceResult[] = [];
    const failures: string[] = [];
    let enabled = false;
    let pravoExactAttempted = 0;
    let pravoContextAttempted = 0;
    let pravoAmbiguous = 0;
    let registeredProviders = 0;

    for (const { question, result } of results) {
      enabled ||= result.diagnostics.enabled;
      pravoExactAttempted += result.diagnostics.pravo_exact_attempted;
      pravoContextAttempted += result.diagnostics.pravo_context_attempted;
      pravoAmbiguous += result.diagnostics.pravo_ambiguous;
      registeredProviders = Math.max(registeredProviders, result.diagnostics.registered_providers);
      failures.push(...result.diagnostics.failures.map((failure) => `${question.id}:${failure}`));
      for (const source of result.sources) {
        annotated.push({
          ...source,
          metadata: {
            ...(source.metadata ?? {}),
            research_issue_ids: [question.id],
            research_issue_texts: [question.issue],
            research_modes: question.modes,
          },
        });
      }
    }

    const merged = mergeQuestionAnnotations(annotated as RawSource[]) as OfficialSourceResult[];
    const identityVerified = merged.filter(
      (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.document_identity_verified ?? false),
    ).length;
    const substantiveUsable = merged.filter(
      (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.substantive_use_allowed ?? false),
    ).length;

    return {
      sources: merged,
      diagnostics: {
        enabled,
        pravo_exact_attempted: pravoExactAttempted,
        pravo_context_attempted: pravoContextAttempted,
        pravo_found: merged.length,
        pravo_identity_verified: identityVerified,
        pravo_ambiguous: pravoAmbiguous,
        substantive_usable: substantiveUsable,
        registered_providers: registeredProviders,
        failures,
      },
    };
  };
'''

new_block = '''  const searchOfficialPerIssue = async (): Promise<{
    sources: OfficialSourceResult[];
    diagnostics: OfficialSourceDiagnostics;
    collector_found: number;
    collector_coverage_gaps: number;
  }> => {
    const questions = researchPlan.questions;
    const results = await Promise.all(
      questions.map(async (question) => {
        const issueQuery = queryForQuestion(query, question);
        const collectorBuckets = question.buckets.filter((bucket): bucket is "court_practice" | "fns_letters" | "minfin_letters" =>
          bucket === "court_practice" || bucket === "fns_letters" || bucket === "minfin_letters"
        );
        const [result, ...collectorResults] = await Promise.all([
          searchOfficialLegalSources(issueQuery),
          ...collectorBuckets.map((bucket) => searchOfficialCollectorArtifacts(sb, issueQuery, bucket)),
        ]);
        return {
          question,
          result,
          collectorSources: collectorResults.flatMap((item) => item.sources),
          collectorCoverageGaps: collectorResults.flatMap((item) => item.coverage_gaps),
        };
      }),
    );

    const annotated: OfficialSourceResult[] = [];
    const failures: string[] = [];
    let enabled = false;
    let pravoExactAttempted = 0;
    let pravoContextAttempted = 0;
    let pravoAmbiguous = 0;
    let registeredProviders = 0;
    let collectorFound = 0;
    let collectorCoverageGaps = 0;

    for (const { question, result, collectorSources, collectorCoverageGaps: gaps } of results) {
      enabled ||= result.diagnostics.enabled;
      pravoExactAttempted += result.diagnostics.pravo_exact_attempted;
      pravoContextAttempted += result.diagnostics.pravo_context_attempted;
      pravoAmbiguous += result.diagnostics.pravo_ambiguous;
      registeredProviders = Math.max(registeredProviders, result.diagnostics.registered_providers);
      failures.push(...result.diagnostics.failures.map((failure) => `${question.id}:${failure}`));
      collectorFound += collectorSources.length;
      collectorCoverageGaps += gaps.length;
      failures.push(...gaps.map((gap) => `${question.id}:${gap.bucket}:${gap.reason}`));
      for (const source of [...result.sources, ...collectorSources]) {
        annotated.push({
          ...source,
          metadata: {
            ...(source.metadata ?? {}),
            research_issue_ids: [question.id],
            research_issue_texts: [question.issue],
            research_modes: question.modes,
          },
        });
      }
    }

    const merged = mergeQuestionAnnotations(annotated as RawSource[]) as OfficialSourceResult[];
    const identityVerified = merged.filter(
      (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.document_identity_verified ?? false),
    ).length;
    const substantiveUsable = merged.filter(
      (source) => ((source.metadata?.safety as OfficialSourceSafety | undefined)?.substantive_use_allowed ?? false),
    ).length;

    return {
      sources: merged,
      collector_found: collectorFound,
      collector_coverage_gaps: collectorCoverageGaps,
      diagnostics: {
        enabled,
        pravo_exact_attempted: pravoExactAttempted,
        pravo_context_attempted: pravoContextAttempted,
        pravo_found: merged.filter((source) => source.metadata?.collector_artifact !== true).length,
        pravo_identity_verified: identityVerified,
        pravo_ambiguous: pravoAmbiguous,
        substantive_usable: substantiveUsable,
        registered_providers: registeredProviders,
        failures,
      },
    };
  };
'''

if new_block not in text:
    if old_block not in text:
        raise SystemExit("searchOfficialPerIssue anchor missing")
    text = text.replace(old_block, new_block, 1)

old_counts = '''    official_pravo_ambiguous: official.diagnostics.pravo_ambiguous,
    official_source_failures: official.diagnostics.failures.length,
'''
new_counts = '''    official_pravo_ambiguous: official.diagnostics.pravo_ambiguous,
    official_collector_sources_found: official.collector_found,
    official_collector_coverage_gaps: official.collector_coverage_gaps,
    official_source_failures: official.diagnostics.failures.length,
'''
if new_counts not in text:
    if old_counts not in text:
        raise SystemExit("counts anchor missing")
    text = text.replace(old_counts, new_counts, 1)

path.write_text(text, encoding="utf-8")
print("patched repositories.ts")
