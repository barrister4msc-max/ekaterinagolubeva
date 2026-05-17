import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useSiteSettings, heroSrc } from "@/hooks/use-site-settings";
import { Upload, LogOut, Save, ArrowUpRight } from "lucide-react";
import { LeadsAdmin } from "@/components/leads-admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Админ — Hero портрет | Екатерина Голубева" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { settings, setSettings, loaded } = useSiteSettings();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <main className="container-wide py-32 text-sm text-muted-foreground">Загрузка...</main>;
  }

  if (!isAdmin) {
    return (
      <main className="container-wide py-32">
        <h1 className="text-2xl">Доступ только для администратора</h1>
        <p className="mt-3 text-sm text-muted-foreground">Ваш аккаунт не имеет роли admin.</p>
        <button onClick={() => supabase.auth.signOut()} className="btn-ghost mt-6">
          <LogOut size={14}/> Выйти
        </button>
      </main>
    );
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr(null); setMsg(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `hero-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("hero")
        .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("hero").getPublicUrl(path);
      setSettings({ ...settings, hero_image_url: publicUrl });
      setMsg("Загружено. Не забудьте сохранить настройки.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    setSaving(true); setErr(null); setMsg(null);
    try {
      const { error } = await supabase
        .from("site_settings")
        .update({
          hero_image_url: settings.hero_image_url,
          hero_object_position_x: settings.hero_object_position_x,
          hero_object_position_y: settings.hero_object_position_y,
          hero_scale: settings.hero_scale,
        })
        .eq("id", 1);
      if (error) throw error;
      setMsg("Сохранено. Откройте главную, чтобы увидеть изменения.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <main className="container-wide py-32 text-sm text-muted-foreground">Загрузка настроек...</main>;
  }

  const previewUrl = heroSrc(settings.hero_image_url, 800);

  return (
    <main className="container-wide py-16 md:py-20">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="eyebrow mb-3">Админ</div>
          <h1 className="text-3xl md:text-4xl">Hero-портрет</h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Загрузите портрет, настройте кроп и масштаб. Изображение автоматически адаптируется под все экраны.
          </p>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => navigate({ to: "/login" }))}
          className="btn-ghost shrink-0"><LogOut size={14}/> Выйти</button>
      </div>

      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {/* Preview */}
        <div>
          <div className="eyebrow mb-3">Превью</div>
          <div className="relative overflow-hidden bg-secondary aspect-[4/5] w-full">
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
          <p className="mt-3 text-xs text-muted-foreground">
            Это превью имитирует как фото будет видно в hero-секции (соотношение 4:5).
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-7">
          <div>
            <div className="eyebrow mb-3">Файл</div>
            <input ref={fileInput} type="file" accept="image/*" onChange={onUpload}
              className="block w-full text-sm file:mr-4 file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-sm" />
            {uploading && <div className="mt-2 text-xs text-muted-foreground">Загрузка...</div>}
          </div>

          <Slider label="Горизонталь (X)" value={settings.hero_object_position_x}
            min={0} max={100} step={1}
            onChange={(v) => setSettings({ ...settings, hero_object_position_x: v })}
            hint="0 = лево · 50 = центр · 100 = право" suffix="%" />

          <Slider label="Вертикаль (Y)" value={settings.hero_object_position_y}
            min={0} max={100} step={1}
            onChange={(v) => setSettings({ ...settings, hero_object_position_y: v })}
            hint="0 = верх · 30 = лицо · 100 = низ" suffix="%" />

          <Slider label="Масштаб (zoom)" value={settings.hero_scale}
            min={1} max={2} step={0.05}
            onChange={(v) => setSettings({ ...settings, hero_scale: v })}
            hint="1.0 = без увеличения · 1.5 = крупный план" suffix="x" />

          {err && <div className="text-sm text-destructive">{err}</div>}
          {msg && <div className="text-sm text-primary">{msg}</div>}

          <div className="flex flex-wrap gap-3">
            <button onClick={save} disabled={saving} className="btn-primary">
              <Save size={14}/> {saving ? "..." : "Сохранить"}
            </button>
            <Link to="/" className="btn-ghost">
              На главную <ArrowUpRight size={14}/>
            </Link>
          </div>
        </div>
      </div>

      <LeadsAdmin />
    </main>
  );
}

function Slider({
  label, value, min, max, step, onChange, hint, suffix,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string; suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="font-mono text-sm">{value.toFixed(step < 1 ? 2 : 0)}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-primary" />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
