import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, RefreshCw, Search, AlertTriangle, CheckCircle2, Clock, Power, Send, ShieldQuestion } from "lucide-react";
import {
  lkListCatalog,
  lkListGaps,
  lkUpdateGap,
  lkListVerifications,
  lkRequestVerification,
  lkDashboard,
  lkListManualSources,
  lkUpdateSource,
  lkDeactivateSource,
  lkQueueIndexation,
  lkRequestExternalSearch,
} from "@/lib/legal-knowledge.functions";
import { SourceUploadDialog } from "@/components/knowledge/source-upload-dialog";


export const Route = createFileRoute("/workspace/legal-knowledge")({
  head: () => ({ meta: [{ title: "База знаний — Workspace" }, { name: "robots", content: "noindex" }] }),
  component: LegalKnowledgePage,
});

type CatalogRow = {
  source_kind: string;
  source_id: string;
  title: string | null;
  reference_number: string | null;
  source_name: string | null;
  source_url: string | null;
  category: string | null;
  practice_area: string | null;
  jurisdiction: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  source_checked_at: string | null;
  chunks_count: number | null;
  usage_count: number | null;
  last_verification_status: string | null;
  last_verified_at: string | null;
};

type GapRow = {
  id: string;
  query_text: string | null;
  missing_source_type: string;
  guessed_title: string | null;
  guessed_article: string | null;
  guessed_document_number: string | null;
  context: string | null;
  priority: "low" | "medium" | "high";
  status: "new" | "in_progress" | "resolved" | "dismissed";
  request_count: number;
  last_requested_at: string;
  created_at: string;
};

type VerifRow = {
  id: string;
  source_kind: string;
  source_id: string | null;
  source_ref: string | null;
  source_title: string | null;
  status: string;
  result_summary: string | null;
  external_url: string | null;
  requested_at: string;
  completed_at: string | null;
};

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");

function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline">неизвестно</Badge>;
  const map: Record<string, { v: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    verified: { v: "default", label: "актуально" },
    pending: { v: "secondary", label: "в очереди" },
    running: { v: "secondary", label: "проверяется" },
    outdated: { v: "destructive", label: "устарело" },
    failed: { v: "destructive", label: "ошибка" },
    new: { v: "secondary", label: "new" },
    in_progress: { v: "secondary", label: "в работе" },
    resolved: { v: "default", label: "решено" },
    dismissed: { v: "outline", label: "отклонено" },
  };
  const m = map[status] ?? { v: "outline" as const, label: status };
  return <Badge variant={m.v}>{m.label}</Badge>;
}

type ManualSourceRow = {
  id: string;
  title: string | null;
  content: string;
  category: string | null;
  is_active: boolean | null;
  created_at: string | null;
  metadata: Record<string, any> | null;
};

function LegalKnowledgePage() {
  const dashFn = useServerFn(lkDashboard);
  const catalogFn = useServerFn(lkListCatalog);
  const gapsFn = useServerFn(lkListGaps);
  const verifFn = useServerFn(lkListVerifications);
  const requestVerifFn = useServerFn(lkRequestVerification);
  const updateGapFn = useServerFn(lkUpdateGap);
  const listSourcesFn = useServerFn(lkListManualSources);
  const updateSourceFn = useServerFn(lkUpdateSource);
  const deactivateSourceFn = useServerFn(lkDeactivateSource);
  const queueIndexFn = useServerFn(lkQueueIndexation);
  const externalSearchFn = useServerFn(lkRequestExternalSearch);

  const [dash, setDash] = useState<Awaited<ReturnType<typeof lkDashboard>> | null>(null);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [gaps, setGaps] = useState<GapRow[]>([]);
  const [verifs, setVerifs] = useState<VerifRow[]>([]);
  const [sources, setSources] = useState<ManualSourceRow[]>([]);
  const [search, setSearch] = useState("");
  const [srcSearch, setSrcSearch] = useState("");
  const [srcType, setSrcType] = useState<string>("all");
  const [srcVerif, setSrcVerif] = useState<string>("all");
  const [srcImport, setSrcImport] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [d, c, g, v, s] = await Promise.all([
        dashFn(),
        catalogFn({ data: { search: search || undefined } }),
        gapsFn({ data: {} }),
        verifFn({ data: {} }),
        listSourcesFn({
          data: {
            search: srcSearch || undefined,
            source_type: srcType !== "all" ? (srcType as any) : undefined,
            verification_status: srcVerif !== "all" ? srcVerif : undefined,
            import_status: srcImport !== "all" ? (srcImport as any) : undefined,
          },
        }),
      ]);
      setDash(d as any);
      setCatalog((c as { rows: CatalogRow[] }).rows);
      setGaps((g as { rows: GapRow[] }).rows);
      setVerifs((v as { rows: VerifRow[] }).rows);
      setSources((s as { rows: ManualSourceRow[] }).rows);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dashFn, catalogFn, gapsFn, verifFn, listSourcesFn, search, srcSearch, srcType, srcVerif, srcImport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleVerify = async (row: CatalogRow) => {
    try {
      await requestVerifFn({
        data: {
          source_kind: row.source_kind as any,
          source_id: row.source_id,
          source_title: row.title ?? null,
          source_ref: row.reference_number ?? null,
        },
      });
      toast.success("Проверка актуальности поставлена в очередь");
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleGap = async (id: string, patch: { status?: GapRow["status"]; priority?: GapRow["priority"] }) => {
    try {
      await updateGapFn({ data: { id, ...patch } });
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleQueue = async (groupId: string, title?: string | null) => {
    try {
      await queueIndexFn({ data: { source_group_id: groupId, title: title ?? undefined } });
      toast.success("Источник поставлен в очередь на индексацию");
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleDeactivate = async (groupId: string) => {
    try {
      await deactivateSourceFn({ data: { source_group_id: groupId } });
      toast.success("Источник деактивирован");
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleApproveSource = async (groupId: string) => {
    try {
      await updateSourceFn({ data: { source_group_id: groupId, patch: { verification_status: "official_verified", import_status: "completed" } } });
      toast.success("Источник одобрен. Используется как подтверждённый.");
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleExternalSearch = async (g: GapRow) => {
    try {
      await externalSearchFn({ data: { gap_id: g.id, title: g.guessed_title ?? g.query_text ?? undefined } });
      toast.success("Поиск источников поставлен в очередь");
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-foreground/60">Workspace</div>
          <h1 className="mt-1 font-display text-2xl">База знаний</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Каталог нормативных актов, отсутствующие источники и контроль актуальности. AI выводит только подтверждённые
            источники локальной базы.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SourceUploadDialog onCreated={() => void reload()} />
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw size={14} /> Обновить
          </Button>
        </div>
      </header>

      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
        <ShieldQuestion size={14} className="mt-0.5 text-amber-600" />
        <div>
          <b>Процесс:</b> Поиск источника → Просмотр → Одобрение администратором → Загрузка → Индексация → Проверка → Использование в RAG. Источник не используется в юридических заключениях, пока не одобрен администратором и не прошёл проверку.
        </div>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="catalog">Каталог норм</TabsTrigger>
          <TabsTrigger value="sources">Источники</TabsTrigger>
          <TabsTrigger value="recommended">Рекомендованные</TabsTrigger>
          <TabsTrigger value="verification">Проверка актуальности</TabsTrigger>

        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Всего норм", value: dash?.counts.laws ?? "—", icon: ShieldCheck },
              { label: "Всего чанков", value: dash?.counts.chunks ?? "—", icon: ShieldCheck },
              { label: "Использований за 30 дн.", value: dash?.counts.usage30d ?? "—", icon: CheckCircle2 },
              { label: "Проверок в очереди", value: dash?.counts.verificationPending ?? "—", icon: Clock },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-semibold">{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Топ 20 используемых норм</CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-auto p-0">
                <Table>
                  <TableBody>
                    {(dash?.topUsed ?? []).map((r: any) => (
                      <TableRow key={`${r.source_kind}-${r.source_id}`}>
                        <TableCell className="text-xs">{r.title ?? "—"}</TableCell>
                        <TableCell className="w-16 text-right text-xs font-semibold">{r.usage_count ?? 0}</TableCell>
                      </TableRow>
                    ))}
                    {(!dash || dash.topUsed.length === 0) && (
                      <TableRow>
                        <TableCell className="text-xs text-muted-foreground">Пока нет данных.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Топ 20 отсутствующих норм</CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-auto p-0">
                <Table>
                  <TableBody>
                    {(dash?.topGaps ?? []).map((g: any) => (
                      <TableRow key={g.id}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{g.guessed_title || g.guessed_article || "—"}</div>
                          <div className="text-muted-foreground">{g.missing_source_type}</div>
                        </TableCell>
                        <TableCell className="w-16 text-right text-xs font-semibold">{g.request_count}</TableCell>
                      </TableRow>
                    ))}
                    {(!dash || dash.topGaps.length === 0) && (
                      <TableRow>
                        <TableCell className="text-xs text-muted-foreground">Нет gap-запросов.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="catalog" className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию"
                className="pl-7"
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              Найти
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Статья / №</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Практика</TableHead>
                      <TableHead>Загрузка</TableHead>
                      <TableHead>Последняя проверка</TableHead>
                      <TableHead className="text-right">Чанков</TableHead>
                      <TableHead className="text-right">Использований</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalog.map((r) => (
                      <TableRow key={`${r.source_kind}-${r.source_id}`}>
                        <TableCell className="max-w-xs">
                          <div className="line-clamp-2 text-xs">{r.title ?? "—"}</div>
                          {r.source_url && (
                            <a
                              href={r.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-primary underline"
                            >
                              источник
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{r.source_kind}</TableCell>
                        <TableCell className="text-xs">{r.reference_number ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.category ?? "—"}</TableCell>
                        <TableCell className="text-xs">{r.practice_area ?? "—"}</TableCell>
                        <TableCell className="text-xs">{fmtDate(r.created_at)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(r.last_verified_at ?? r.source_checked_at)}</TableCell>
                        <TableCell className="text-right text-xs">{r.chunks_count ?? 0}</TableCell>
                        <TableCell className="text-right text-xs">{r.usage_count ?? 0}</TableCell>
                        <TableCell>
                          <StatusBadge status={r.last_verification_status} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => void handleVerify(r)}>
                            Проверить
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {catalog.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-xs text-muted-foreground">
                          Нет данных.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gaps" className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Источники, которые AI пытался использовать, но не нашёл в локальной базе. Автоматический интернет-поиск
            отключён — загрузка только через подтверждение администратора.
          </p>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Что искал AI</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead className="text-right">Запросов</TableHead>
                    <TableHead>Приоритет</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gaps.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="max-w-md">
                        <div className="text-xs font-medium">
                          {g.guessed_title || g.guessed_article || g.guessed_document_number || "—"}
                        </div>
                        {g.query_text && (
                          <div className="line-clamp-2 text-[10px] text-muted-foreground">{g.query_text}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{g.missing_source_type}</TableCell>
                      <TableCell className="text-right text-xs">{g.request_count}</TableCell>
                      <TableCell>
                        <Badge variant={g.priority === "high" ? "destructive" : g.priority === "medium" ? "secondary" : "outline"}>
                          {g.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={g.status} />
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            toast.info(
                              "Ручной поиск источника. Автоматический интернет-поиск отключён. Используйте официальные ресурсы и загрузите подтверждённый документ в базу.",
                            )
                          }
                        >
                          Найти источник
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void handleGap(g.id, { status: "in_progress" })}>
                          В работу
                        </Button>
                        <Button size="sm" onClick={() => void handleGap(g.id, { status: "resolved" })}>
                          Загружено
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleGap(g.id, { status: "dismissed" })}>
                          Отклонить
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {gaps.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                        Нет gap-запросов.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification" className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <AlertTriangle size={14} className="mt-0.5" />
            <div>
              Проверка ставится в очередь. Реальная сверка с официальным источником подключается отдельно — на этом
              этапе фиксируется только запрос.
            </div>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Источник</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Запрошено</TableHead>
                    <TableHead>Завершено</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Результат</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verifs.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="max-w-sm text-xs">{v.source_title || v.source_ref || v.source_id || "—"}</TableCell>
                      <TableCell className="text-xs">{v.source_kind}</TableCell>
                      <TableCell className="text-xs">{fmtDate(v.requested_at)}</TableCell>
                      <TableCell className="text-xs">{fmtDate(v.completed_at)}</TableCell>
                      <TableCell>
                        <StatusBadge status={v.status} />
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-muted-foreground">{v.result_summary ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {verifs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                        Журнал проверок пуст.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
