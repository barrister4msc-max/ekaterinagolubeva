import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings, heroSrc, type SiteSettings } from "@/hooks/use-site-settings";
import { Save, ArrowUpRight, Trash2 } from "lucide-react";

export const Route = createFileRoute("/workspace/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, setSettings, loaded } = useSiteSettings();
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingAdvisor, setUploadingAdvisor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const heroInput = useRef<HTMLInputElement>(null);
  const advisorInput = useRef<HTMLInputElement>(null);

  async function uploadImage(
    e: React.ChangeEvent<HTMLInputElement>,
    field: "hero_image_url" | "advisor_photo_url",
    setBusy: (v: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const prefix = field === "hero_image_url" ? "hero" : "advisor";
      const path = `${prefix}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("hero")
        .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("hero").getPublicUrl(path);
      setSettings({ ...settings, [field]: publicUrl });
      setMsg("Загружено. Не забудьте сохранить.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function set<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) {
    setSettings({ ...settings, [key]: value });
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({
          hero_image_url: settings.hero_image_url,
          hero_object_position_x: settings.hero_object_position_x,
          hero_object_position_y: settings.hero_object_position_y,
          hero_scale: settings.hero_scale,
          legal_form: settings.legal_form,
          legal_full_name: settings.legal_full_name,
          legal_inn: settings.legal_inn,
          legal_ogrnip: settings.legal_ogrnip,
          legal_address: settings.legal_address,
          contact_email: settings.contact_email,
          contact_phone: settings.contact_phone,
          contact_telegram_url: settings.contact_telegram_url,
          contact_whatsapp_url: settings.contact_whatsapp_url,
          contact_max_url: settings.contact_max_url,
          site_domain: settings.site_domain,
          advisor_photo_url: settings.advisor_photo_url,
        })
        .eq("id", 1);
      if (error) throw error;
      setMsg("Сохранено.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <div className="text-sm text-muted-foreground">Загрузка настроек…</div>;
  }

  const previewUrl = heroSrc(settings.hero_image_url, 800);
  const advisorPreview = heroSrc(settings.advisor_photo_url, 600);

  return (
    <div className="space-y-10">
      <header>
        <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Настройки</div>
        <h1 className="mt-2 font-display text-4xl">Настройки сайта</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hero-портрет, фото специалиста, реквизиты и контактные каналы. Пустые поля не отображаются на сайте.
        </p>
      </header>

      {/* Status */}
      {(err || msg) && (
        <div className="flex flex-col gap-1">
          {err && <div className="text-sm text-destructive">{err}</div>}
          {msg && <div className="text-sm text-primary">{msg}</div>}
        </div>
      )}

      {/* HERO */}
      <Card title="Hero-портрет (главная страница)">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <Label>Превью</Label>
            <div className="relative mt-3 aspect-[4/5] w-full overflow-hidden rounded-md bg-secondary">
              {settings.hero_image_url ? (
                <img
                  src={previewUrl}
                  alt="Превью"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition: `${settings.hero_object_position_x}% ${settings.hero_object_position_y}%`,
                    transform: `scale(${settings.hero_scale})`,
                    transformOrigin: `${settings.hero_object_position_x}% ${settings.hero_object_position_y}%`,
                  }}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Изображение не загружено
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <Label>Файл</Label>
              <input
                ref={heroInput}
                type="file"
                accept="image/*"
                onChange={(e) => uploadImage(e, "hero_image_url", setUploadingHero, heroInput)}
                className="mt-2 block w-full text-sm file:mr-4 file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-sm"
              />
              {uploadingHero && <div className="mt-2 text-xs text-muted-foreground">Загрузка...</div>}
              {settings.hero_image_url && (
                <button
                  type="button"
                  onClick={() => set("hero_image_url", null)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                >
                  <Trash2 size={12} /> Удалить изображение
                </button>
              )}
            </div>

            <Slider label="Горизонталь (X)" value={settings.hero_object_position_x}
              min={0} max={100} step={1}
              onChange={(v) => set("hero_object_position_x", v)} suffix="%" />
            <Slider label="Вертикаль (Y)" value={settings.hero_object_position_y}
              min={0} max={100} step={1}
              onChange={(v) => set("hero_object_position_y", v)} suffix="%" />
            <Slider label="Масштаб" value={settings.hero_scale}
              min={1} max={2} step={0.05}
              onChange={(v) => set("hero_scale", v)} suffix="x" />
          </div>
        </div>
      </Card>

      {/* ADVISOR PHOTO */}
      <Card title="Фото специалиста (страница «О специалисте»)">
        <p className="text-sm text-muted-foreground">
          Если фото не загружено — на странице /about и в блоке автора будет использоваться hero-портрет.
        </p>
        <div className="mt-6 grid gap-8 md:grid-cols-[200px_1fr]">
          <div>
            {settings.advisor_photo_url ? (
              <img src={advisorPreview} alt="Фото" className="aspect-[4/5] w-full rounded-md object-cover" />
            ) : (
              <div className="grid aspect-[4/5] w-full place-items-center rounded-md bg-secondary text-xs text-muted-foreground">
                Нет фото
              </div>
            )}
          </div>
          <div>
            <Label>Файл</Label>
            <input
              ref={advisorInput}
              type="file"
              accept="image/*"
              onChange={(e) => uploadImage(e, "advisor_photo_url", setUploadingAdvisor, advisorInput)}
              className="mt-2 block w-full text-sm file:mr-4 file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-sm"
            />
            {uploadingAdvisor && <div className="mt-2 text-xs text-muted-foreground">Загрузка...</div>}
            {settings.advisor_photo_url && (
              <button
                type="button"
                onClick={() => set("advisor_photo_url", null)}
                className="mt-3 inline-flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 size={12} /> Удалить фото
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* LEGAL */}
      <Card title="Юридические реквизиты">
        <div className="grid gap-5 md:grid-cols-2">
          <Input label="Форма (ИП / Самозанятый / ООО)" value={settings.legal_form ?? ""} onChange={(v) => set("legal_form", v || null)} />
          <Input label="ФИО полностью" value={settings.legal_full_name ?? ""} onChange={(v) => set("legal_full_name", v || null)} />
          <Input label="ИНН" value={settings.legal_inn ?? ""} onChange={(v) => set("legal_inn", v || null)} />
          <Input label="ОГРНИП / ОГРН" value={settings.legal_ogrnip ?? ""} onChange={(v) => set("legal_ogrnip", v || null)} />
          <Input label="Юридический адрес" value={settings.legal_address ?? ""} onChange={(v) => set("legal_address", v || null)} className="md:col-span-2" />
        </div>
      </Card>

      {/* CONTACTS */}
      <Card title="Контакты">
        <div className="grid gap-5 md:grid-cols-2">
          <Input label="Email" value={settings.contact_email ?? ""} onChange={(v) => set("contact_email", v || null)} placeholder="hello@domain.ru" />
          <Input label="Телефон" value={settings.contact_phone ?? ""} onChange={(v) => set("contact_phone", v || null)} placeholder="+7 (___) ___-__-__" />
          <Input label="Telegram URL" value={settings.contact_telegram_url ?? ""} onChange={(v) => set("contact_telegram_url", v || null)} placeholder="https://t.me/username" />
          <Input label="WhatsApp URL" value={settings.contact_whatsapp_url ?? ""} onChange={(v) => set("contact_whatsapp_url", v || null)} placeholder="https://wa.me/7XXXXXXXXXX" />
          <Input label="MAX URL" value={settings.contact_max_url ?? ""} onChange={(v) => set("contact_max_url", v || null)} placeholder="https://max.ru/..." />
          <Input label="Канонический домен" value={settings.site_domain ?? ""} onChange={(v) => set("site_domain", v || null)} placeholder="https://golubeva-law.ru" />
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save size={14}/> {saving ? "..." : "Сохранить все изменения"}
        </button>
        <Link to="/" className="btn-ghost">
          На главную <ArrowUpRight size={14}/>
        </Link>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-[0_2px_20px_rgba(0,0,0,0.03)] md:p-8">
      <h2 className="mb-6 font-display text-xl">{title}</h2>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-[0.18em] text-foreground/60">{children}</div>;
}

function Input({
  label, value, onChange, placeholder, className,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <Label>{label}</Label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function Slider({
  label, value, min, max, step, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-sm">{value.toFixed(step < 1 ? 2 : 0)}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-primary" />
    </div>
  );
}
