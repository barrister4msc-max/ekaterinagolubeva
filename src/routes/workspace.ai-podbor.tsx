import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCw, Link2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/workspace/ai-podbor")({
  head: () => ({
    meta: [
      { title: "AI-подбор — Workspace" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiPodborPage,
});

type Request = {
  id: string;
  client_name: string;
  phone: string;
  contact_method: string | null;
  property_type: string;
  budget_min: number | null;
  budget_max: number | null;
  districts: string[] | null;
  area_min: number | null;
  area_max: number | null;
  goal: string | null;
  client_comment: string | null;
  ai_summary: string | null;
  status: string;
  created_at: string;
};

type Property = {
  id: string;
  source: string | null;
  source_url: string | null;
  title: string | null;
  price: number | null;
  address: string | null;
  district: string | null;
  area: number | null;
  property_type: string | null;
  description: string | null;
  ai_summary: string | null;
  legal_risk_score: number | null;
  investment_score: number | null;
  risk_flags: unknown;
  status: string;
  is_active: boolean;
  created_at: string;
};

type Match = {
  id: string;
  request_id: string;
  property_id: string;
  match_score: number | null;
  ai_reason: string | null;
  legal_comment: string | null;
  status: string;
  created_at: string;
};

const STATUSES = ["new", "in_progress", "matched", "closed", "cancelled"];

function AiPodborPage() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadRequests() {
    setLoading(true);
    const { data } = await supabase
      .from("property_search_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests((data ?? []) as Request[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  const selected = useMemo(
    () => requests.find((r) => r.id === selectedId) ?? null,
    [requests, selectedId],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">AI-подбор недвижимости</h1>
          <p className="text-sm text-muted-foreground">
            Заявки клиентов, объекты и связи match.
          </p>
        </div>
        <button onClick={loadRequests} className="btn-ghost">
          <RefreshCw size={14} /> Обновить
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm p-3 shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto animate-spin" size={18} />
            </div>
          ) : requests.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Заявок пока нет</div>
          ) : (
            <ul className="divide-y divide-border">
              {requests.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full text-left p-3 rounded-md hover:bg-secondary/40 ${
                      selectedId === r.id ? "bg-secondary/50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">{r.client_name}</div>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.property_type} · {r.phone}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(r.created_at).toLocaleString("ru-RU")}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-w-0">
          {selected ? (
            <RequestDetail
              request={selected}
              onChanged={loadRequests}
            />
          ) : (
            <div className="rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm p-10 text-center text-sm text-muted-foreground">
              Выберите заявку слева
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-foreground/70">
      {status}
    </span>
  );
}

function RequestDetail({ request, onChanged }: { request: Request; onChanged: () => void }) {
  const [matches, setMatches] = useState<(Match & { property: Property | null })[]>([]);
  const [allProps, setAllProps] = useState<Property[]>([]);
  const [busy, setBusy] = useState(false);
  const [showNewProp, setShowNewProp] = useState(false);
  const [showLink, setShowLink] = useState(false);

  async function loadMatches() {
    const { data: mData } = await supabase
      .from("property_matches")
      .select("*")
      .eq("request_id", request.id)
      .order("created_at", { ascending: false });
    const mList = (mData ?? []) as Match[];

    const propIds = mList.map((m) => m.property_id);
    let propsById: Record<string, Property> = {};
    if (propIds.length) {
      const { data: pData } = await supabase
        .from("properties")
        .select("*")
        .in("id", propIds);
      propsById = Object.fromEntries(((pData ?? []) as Property[]).map((p) => [p.id, p]));
    }
    setMatches(mList.map((m) => ({ ...m, property: propsById[m.property_id] ?? null })));
  }

  async function loadAllProps() {
    const { data } = await supabase
      .from("properties")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(200);
    setAllProps((data ?? []) as Property[]);
  }

  useEffect(() => {
    loadMatches();
    loadAllProps();
  }, [request.id]);

  async function changeStatus(status: string) {
    setBusy(true);
    await supabase.from("property_search_requests").update({ status }).eq("id", request.id);
    setBusy(false);
    onChanged();
  }

  async function linkProperty(propertyId: string) {
    setBusy(true);
    await supabase.from("property_matches").insert({
      request_id: request.id,
      property_id: propertyId,
      status: "suggested",
    });
    setBusy(false);
    setShowLink(false);
    loadMatches();
  }

  async function updateMatch(id: string, patch: Partial<Match>) {
    await supabase.from("property_matches").update(patch).eq("id", id);
    loadMatches();
  }

  async function removeMatch(id: string) {
    await supabase.from("property_matches").delete().eq("id", id);
    loadMatches();
  }

  const linkedIds = new Set(matches.map((m) => m.property_id));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-xl">{request.client_name}</h2>
            <p className="text-sm text-muted-foreground">
              {request.phone}
              {request.contact_method ? ` · ${request.contact_method}` : ""}
            </p>
          </div>
          <select
            value={request.status}
            disabled={busy}
            onChange={(e) => changeStatus(e.target.value)}
            className="input-line w-auto"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-2">
          <Info label="Тип" value={request.property_type} />
          <Info label="Цель" value={request.goal ?? "—"} />
          <Info
            label="Бюджет"
            value={`${request.budget_min ?? "—"} — ${request.budget_max ?? "—"} ₽`}
          />
          <Info
            label="Площадь"
            value={`${request.area_min ?? "—"} — ${request.area_max ?? "—"} м²`}
          />
          <Info
            label="Районы"
            value={request.districts?.length ? request.districts.join(", ") : "—"}
          />
          <Info label="Создана" value={new Date(request.created_at).toLocaleString("ru-RU")} />
        </dl>

        {request.client_comment && (
          <div className="mt-4 rounded-md bg-secondary/40 p-3 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-foreground/60">Комментарий клиента</div>
            <div className="mt-1 whitespace-pre-wrap">{request.client_comment}</div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg">Подходящие объекты</h3>
          <div className="flex gap-2">
            <button onClick={() => setShowLink((v) => !v)} className="btn-ghost">
              <Link2 size={14} /> Связать существующий
            </button>
            <button onClick={() => setShowNewProp((v) => !v)} className="btn-ghost">
              <Plus size={14} /> Новый объект
            </button>
          </div>
        </div>

        {showNewProp && (
          <NewPropertyForm
            defaultType={request.property_type}
            onCreated={async (id) => {
              await linkProperty(id);
              await loadAllProps();
              setShowNewProp(false);
            }}
            onCancel={() => setShowNewProp(false)}
          />
        )}

        {showLink && (
          <div className="mt-4 rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground mb-2">
              Существующие объекты ({allProps.filter((p) => !linkedIds.has(p.id)).length})
            </div>
            <div className="max-h-72 overflow-auto divide-y divide-border">
              {allProps
                .filter((p) => !linkedIds.has(p.id))
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{p.title ?? p.address ?? p.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.property_type ?? "—"} · {p.district ?? "—"} · {p.price ?? "—"} ₽
                      </div>
                    </div>
                    <button
                      onClick={() => linkProperty(p.id)}
                      className="btn-ghost text-xs"
                      disabled={busy}
                    >
                      Связать
                    </button>
                  </div>
                ))}
              {allProps.filter((p) => !linkedIds.has(p.id)).length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">Нет доступных объектов</div>
              )}
            </div>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {matches.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Пока не связано ни одного объекта
            </div>
          )}
          {matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              onUpdate={(patch) => updateMatch(m.id, patch)}
              onRemove={() => removeMatch(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}

function MatchCard({
  match,
  onUpdate,
  onRemove,
}: {
  match: Match & { property: Property | null };
  onUpdate: (patch: Partial<Match>) => void;
  onRemove: () => void;
}) {
  const p = match.property;
  const [score, setScore] = useState(match.match_score?.toString() ?? "");
  const [reason, setReason] = useState(match.ai_reason ?? "");
  const [legal, setLegal] = useState(match.legal_comment ?? "");
  const [status, setStatus] = useState(match.status);

  const flags = Array.isArray(p?.risk_flags) ? (p?.risk_flags as unknown[]) : [];

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{p?.title ?? p?.address ?? "Объект"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {p?.property_type ?? "—"} · {p?.district ?? "—"} · {p?.price ?? "—"} ₽ · {p?.area ?? "—"} м²
          </div>
          {p?.source_url && (
            <a
              href={p.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline mt-1 inline-block"
            >
              источник
            </a>
          )}
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <X size={16} />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3 text-xs">
        <ScoreBadge label="match_score" value={p ? match.match_score : null} />
        <ScoreBadge label="legal_risk_score" value={p?.legal_risk_score ?? null} />
        <ScoreBadge label="investment_score" value={p?.investment_score ?? null} />
      </div>

      {flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {flags.map((f, i) => (
            <span
              key={i}
              className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px]"
            >
              {String((f as { label?: string })?.label ?? f)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs">
          <div className="text-foreground/60 mb-1">match_score</div>
          <input
            className="input-line"
            type="number"
            min="0"
            max="100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            onBlur={() => onUpdate({ match_score: score ? Number(score) : null })}
          />
        </label>
        <label className="text-xs">
          <div className="text-foreground/60 mb-1">status</div>
          <select
            className="input-line"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              onUpdate({ status: e.target.value });
            }}
          >
            {["suggested", "approved", "rejected", "sent_to_client"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs md:col-span-2">
          <div className="text-foreground/60 mb-1">ai_reason</div>
          <textarea
            className="input-line min-h-[60px]"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => onUpdate({ ai_reason: reason || null })}
          />
        </label>
        <label className="text-xs md:col-span-2">
          <div className="text-foreground/60 mb-1">legal_comment</div>
          <textarea
            className="input-line min-h-[60px]"
            value={legal}
            onChange={(e) => setLegal(e.target.value)}
            onBlur={() => onUpdate({ legal_comment: legal || null })}
          />
        </label>
      </div>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-secondary/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-foreground/60">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function NewPropertyForm({
  defaultType,
  onCreated,
  onCancel,
}: {
  defaultType: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    source_url: "",
    address: "",
    district: "",
    price: "",
    area: "",
    property_type: defaultType,
    description: "",
    legal_risk_score: "",
    investment_score: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function upd<K extends keyof typeof form>(k: K, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      // Dedup by source_url
      if (form.source_url) {
        const { data: existing } = await supabase
          .from("properties")
          .select("id")
          .eq("source_url", form.source_url)
          .maybeSingle();
        if (existing?.id) {
          onCreated(existing.id);
          return;
        }
      }
      const { data, error } = await supabase
        .from("properties")
        .insert({
          title: form.title || null,
          source_url: form.source_url || null,
          source: form.source_url ? "manual_url" : "manual",
          address: form.address || null,
          district: form.district || null,
          price: form.price ? Number(form.price) : null,
          area: form.area ? Number(form.area) : null,
          property_type: form.property_type,
          description: form.description || null,
          legal_risk_score: form.legal_risk_score ? Number(form.legal_risk_score) : null,
          investment_score: form.investment_score ? Number(form.investment_score) : null,
          status: "new",
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      onCreated(data!.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-md border border-border p-4 space-y-3 bg-secondary/20"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <input
          className="input-line"
          placeholder="Заголовок"
          value={form.title}
          onChange={(e) => upd("title", e.target.value)}
        />
        <input
          className="input-line"
          placeholder="Source URL (для dedup)"
          value={form.source_url}
          onChange={(e) => upd("source_url", e.target.value)}
        />
        <input
          className="input-line"
          placeholder="Адрес"
          value={form.address}
          onChange={(e) => upd("address", e.target.value)}
        />
        <input
          className="input-line"
          placeholder="Район"
          value={form.district}
          onChange={(e) => upd("district", e.target.value)}
        />
        <input
          className="input-line"
          type="number"
          placeholder="Цена, ₽"
          value={form.price}
          onChange={(e) => upd("price", e.target.value)}
        />
        <input
          className="input-line"
          type="number"
          placeholder="Площадь, м²"
          value={form.area}
          onChange={(e) => upd("area", e.target.value)}
        />
        <select
          className="input-line"
          value={form.property_type}
          onChange={(e) => upd("property_type", e.target.value)}
        >
          {["apartment", "commercial", "house", "land"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className="input-line"
          type="number"
          min="0"
          max="100"
          placeholder="legal_risk_score (0-100)"
          value={form.legal_risk_score}
          onChange={(e) => upd("legal_risk_score", e.target.value)}
        />
        <input
          className="input-line"
          type="number"
          min="0"
          max="100"
          placeholder="investment_score (0-100)"
          value={form.investment_score}
          onChange={(e) => upd("investment_score", e.target.value)}
        />
      </div>
      <textarea
        className="input-line min-h-[60px]"
        placeholder="Описание"
        value={form.description}
        onChange={(e) => upd("description", e.target.value)}
      />
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Создать и связать
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          Отмена
        </button>
      </div>
    </form>
  );
}
