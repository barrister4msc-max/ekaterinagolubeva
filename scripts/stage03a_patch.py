from pathlib import Path

ENRICH = Path("supabase/functions/analyze-document-legal-position/enrich.ts")
INDEX = Path("supabase/functions/analyze-document-legal-position/index.ts")

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one target, found {count}")
    return text.replace(old, new, 1)

enrich = ENRICH.read_text(encoding="utf-8")

enrich = replace_once(
    enrich,
    '''async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stableStringify''',
    '''async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Stage 03A: deterministic identity for exact textual representations only.
// NFKC + whitespace normalization removes extraction-format noise without
// making any semantic claim that different text belongs to the same evidence.
export async function computeEvidenceIdentity(text: string): Promise<string | null> {
  const normalized = text.normalize("NFKC").replace(/\\s+/g, " ").trim();
  if (!normalized) return null;
  return `sha256:${await sha256Hex(normalized)}`;
}

function stableStringify''',
    "add deterministic evidence identity helper",
)

enrich = replace_once(
    enrich,
    '''  documents: Array<{ id: string; title: string; ocr_length: number }>;
''',
    '''  documents: Array<{
    id: string;
    title: string;
    ocr_length: number;
    evidence_identity?: string | null;
  }>;
''',
    "extend Evidence Matrix document contract",
)

enrich = replace_once(
    enrich,
    '''  const allowedDocIds = new Set(opts.documents.map((d) => d.id));

  // Canonical fact identity universe''',
    '''  const allowedDocIds = new Set(opts.documents.map((d) => d.id));
  // Representation identity affects only independent-support counting.
  // Provenance remains document-id based so every uploaded representation is retained.
  const evidenceIdentityByDocId = new Map(
    opts.documents.map((d) => [
      d.id,
      typeof d.evidence_identity === "string" && d.evidence_identity.trim()
        ? d.evidence_identity.trim()
        : `document:${d.id}`,
    ]),
  );

  // Canonical fact identity universe''',
    "add identity lookup",
)

enrich = replace_once(
    enrich,
    '''      const supporting = relations.filter(
        (r) => r.relation === "DIRECTLY_RECORDS" || r.relation === "SUPPORTS",
      ).length;
''',
    '''      const supporting = new Set(
        relations
          .filter((r) => r.relation === "DIRECTLY_RECORDS" || r.relation === "SUPPORTS")
          .map(
            (r) => evidenceIdentityByDocId.get(r.document_id) ?? `document:${r.document_id}`,
          ),
      ).size;
''',
    "count independent evidence identities",
)

ENRICH.write_text(enrich, encoding="utf-8")

index = INDEX.read_text(encoding="utf-8")

index = replace_once(
    index,
    '''  computeHashes,
  setActuallyUsedInGeneration,
''',
    '''  computeHashes,
  computeEvidenceIdentity,
  setActuallyUsedInGeneration,
''',
    "import evidence identity helper",
)

index = replace_once(
    index,
    '''    const audited = (docs ?? []).map((d: any) =>
      classifyDocument({
        id: d.id as string,
        title: (d.title as string | null) ?? "",
        file_name: (d.file_name as string | null) ?? null,
        ocr_text: pickText(d),
      }),
    );
    const usedDocs = audited.filter((d) => d.used);
''',
    '''    const audited = (docs ?? []).map((d: any) =>
      classifyDocument({
        id: d.id as string,
        title: (d.title as string | null) ?? "",
        file_name: (d.file_name as string | null) ?? null,
        ocr_text: pickText(d),
      }),
    );
    const evidenceIdentityByDocId = new Map<string, string>();
    for (const d of docs ?? []) {
      const identity = await computeEvidenceIdentity(pickText(d));
      if (identity) evidenceIdentityByDocId.set((d as any).id as string, identity);
    }
    const usedDocs = audited.filter((d) => d.used);
''',
    "compute identity from effective extracted text",
)

index = replace_once(
    index,
    '''      documents: usedDocs.map((d) => ({ id: d.id, title: d.title, ocr_length: d.ocr_length })),
''',
    '''      documents: usedDocs.map((d) => ({
        id: d.id,
        title: d.title,
        ocr_length: d.ocr_length,
        evidence_identity: evidenceIdentityByDocId.get(d.id) ?? null,
      })),
''',
    "pass identity into Evidence Matrix",
)

INDEX.write_text(index, encoding="utf-8")
