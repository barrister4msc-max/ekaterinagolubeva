// PR27 — compact verified company profile card for the intake form.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, Loader2, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  isValidInn,
  normalizeInn,
  type CompanyRegistryConflict,
  type CompanyRegistryProfile,
  type DocumentCompanyProfile,
  type RegistryLookupStatus,
} from "@/lib/company-registry";

type CompanyRegistryLookupResult = {
  success: boolean;
  status: RegistryLookupStatus | "invalid_inn" | "matter_creation_blocked";
  inn: string;
  checked_at: string;
  provider: "dadata";
  profile: CompanyRegistryProfile | null;
  document_profile: DocumentCompanyProfile | null;
  conflicts: CompanyRegistryConflict[];
  candidates: CompanyRegistryProfile[];
  autofilled_fields: string[];
  matter_id: string | null;
  matter_blocked_reason: string | null;
  error?: string;
};

type Props = {
  sessionId: string | null;
  inn: unknown;
  /** Fires after a successful lookup so the form can reload answers. */
  onAnswersUpdated?: (fields: string[]) => void;
  /** Bumped by the parent after AI-fill so one automatic check can run. */
  autoVerifyToken?: number;
};

const STATUS_LABELS: Record<string, string> = {
  verified: "Проверено по реестру",
  registry_not_configured: "Проверка недоступна: не настроен доступ к реестру",
  not_found: "Организация с таким ИНН не найдена в реестре",
  ambiguous_candidates: "Найдено несколько записей — уточните организацию",
  provider_error: "Реестр временно недоступен, повторите позже",
  invalid_inn: "ИНН должен содержать 10 или 12 цифр",
  matter_creation_blocked: "Профиль сохранён, дело создать не удалось",
};

export function CompanyRegistryCard({
  sessionId,
  inn,
  onAnswersUpdated,
  autoVerifyToken,
}: Props) {
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<CompanyRegistryLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastVerifiedInnRef = useRef<string | null>(null);

  const normalized = normalizeInn(inn);
  const valid = isValidInn(normalized);

  const runLookup = async (value: string) => {
    if (!sessionId || !isValidInn(value)) return;
    setIsChecking(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<CompanyRegistryLookupResult>(
        "company-registry-lookup",
        { body: { session_id: sessionId, inn: value } },
      );
      if (invokeError) throw invokeError;
      if (!data) throw new Error("Реестр не вернул результат");
      setResult(data);
      lastVerifiedInnRef.current = value;
      if (data.autofilled_fields.length > 0) onAnswersUpdated?.(data.autofilled_fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить проверку");
    } finally {
      setIsChecking(false);
    }
  };

  // One automatic verification after AI-fill populates a new INN.
  useEffect(() => {
    if (!autoVerifyToken) return;
    if (!valid) return;
    if (lastVerifiedInnRef.current === normalized) return;
    void runLookup(normalized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoVerifyToken, normalized, valid]);

  if (!sessionId) return null;

  const profile = result?.profile ?? null;
  const conflicts = result?.conflicts ?? [];

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Проверка контрагента по реестру
          </div>
          <div className="text-xs text-muted-foreground">
            Реестровые данные подставляются только в пустые поля — введённые вами
            значения не перезаписываются.
          </div>
        </div>
        <button
          type="button"
          className="db-ghost"
          disabled={!valid || isChecking}
          onClick={() => void runLookup(normalized)}
        >
          {isChecking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {isChecking ? "Проверяю…" : "Проверить по ЕГРЮЛ/реестру"}
        </button>
      </div>

      {!valid && (
        <div className="text-xs text-muted-foreground">
          Укажите ИНН (10 или 12 цифр), чтобы выполнить проверку.
        </div>
      )}

      {error && <div className="text-xs text-destructive">{error}</div>}

      {result && result.status !== "verified" && (
        <div className="text-xs text-amber-700">
          {STATUS_LABELS[result.status] ?? result.status}
        </div>
      )}

      {profile && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BadgeCheck size={16} className="text-emerald-600" />
            {profile.name_short ?? profile.name_full}
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
            <Row label="ИНН" value={profile.inn} />
            <Row label="КПП" value={profile.kpp} />
            <Row label="ОГРН / ОГРНИП" value={profile.ogrn ?? profile.ogrnip} />
            <Row label="Статус" value={profile.company_status} />
            <Row label="Юридический адрес" value={profile.legal_address} />
            <Row
              label="ОКВЭД"
              value={
                profile.okved_main
                  ? `${profile.okved_main}${
                      profile.business_activity_name
                        ? ` — ${profile.business_activity_name}`
                        : ""
                    }`
                  : null
              }
            />
            <Row
              label="Проверено"
              value={new Date(profile.checked_at).toLocaleString("ru-RU")}
            />
            <Row label="Провайдер" value={profile.provider} />
          </dl>

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 space-y-1">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
                <AlertTriangle size={14} />
                Расхождения с документом: {conflicts.length}
              </div>
              {conflicts.map((conflict) => (
                <div key={conflict.field} className="text-[11px] text-amber-800">
                  {conflict.reason}: «{conflict.document_value}» → «{conflict.registry_value}»
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground/80">{label}:</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
