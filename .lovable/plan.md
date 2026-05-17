# Plan: Private Workspace + Admin Notifications

## 1. Route restructure: `/admin` → `/workspace/*`

New file-based routes (TanStack flat naming):

```
src/routes/
  workspace.tsx                  → /workspace (layout: auth guard + warm beige shell + side nav)
  workspace.login.tsx            → /workspace/login (magic link + email/password fallback)
  workspace.dashboard.tsx        → /workspace/dashboard (KPIs: new leads, in-progress, urgent, recent activity)
  workspace.leads.tsx            → /workspace/leads (existing LeadsAdmin component, lifted)
  workspace.statistics.tsx       → /workspace/statistics (counts by category / urgency / status / week)
  workspace.settings.tsx         → /workspace/settings (hero portrait controls — current admin.tsx content)
  admin.tsx                      → keep file, replace body with redirect to /workspace/dashboard
  login.tsx                      → redirect to /workspace/login (keep old URL working)
```

The `workspace.tsx` parent renders:
- left rail nav (Дашборд / Заявки / Статистика / Настройки / Выйти)
- warm beige background (`bg-[oklch(0.97_0.012_75)]`), soft card surfaces, calm serif headings consistent with the public site
- `<Outlet />`
- redirects to `/workspace/login` if not authenticated, shows "доступ ограничен" if authenticated but not admin

## 2. Magic-link auth

Update `workspace.login.tsx`:
- Primary action: email input → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/workspace/dashboard } })`
- Secondary collapsible: email + password (existing flow) as fallback
- After OTP request: "Письмо отправлено — проверьте почту"

## 3. Dashboard & Statistics

- `dashboard`: 4 stat cards (новых / в работе / срочных / всего за 7 дней), latest 5 leads preview, link to full list
- `statistics`: simple aggregations using existing `listLeadsFn` data, grouped client-side (by category, urgency, status, day-of-week)

Both reuse `listLeadsFn`; no new server fn needed.

## 4. Admin notifications on new lead

Notifications fire inside the existing `finalizeLeadFn` (after successful insert) — non-blocking (errors logged, not thrown), so a failed notification never breaks the form submission.

### a) Telegram
- Use Telegram standard connector (`standard_connectors--connect` flow)
- New helper `src/lib/notify.server.ts` with `sendTelegramNotification(lead)` → POSTs to `https://connector-gateway.lovable.dev/telegram/sendMessage`
- Requires user to: connect Telegram, then set `TELEGRAM_ADMIN_CHAT_ID` secret (their personal chat id obtained via @userinfobot)
- Message format: имя, телефон, категория, urgency, краткое summary, ссылка `https://<published>/workspace/leads`

### b) Email (kat8980@Yandex.ru)
- Requires Lovable Emails infrastructure:
  1. set up email domain (user opens setup dialog → picks subdomain, adds NS records)
  2. once setup completes, scaffold transactional template `new-lead-notification` (recipient hard-coded to `kat8980@yandex.ru`)
  3. call `sendTransactionalEmail` from `finalizeLeadFn` with `idempotencyKey: new-lead-<lead.id>`
- Until domain is verified, only Telegram notifications fire — email path no-ops gracefully

## 5. Database & RLS
No schema changes. New `TELEGRAM_ADMIN_CHAT_ID` secret added via `secrets--add_secret`.

## 6. Execution order
1. Create workspace layout + 4 child routes (lift existing LeadsAdmin + admin controls)
2. Add magic-link login
3. Redirect old `/admin` and `/login`
4. Wire Telegram notification (connector + secret + finalizeLeadFn call)
5. Trigger email-domain setup dialog → scaffold transactional template → wire email send
6. Update `<header>` admin entry link to `/workspace/dashboard`

## Technical notes
- `workspace.tsx` uses `beforeLoad` for redirect — but auth state is in `localStorage`, hydration-sensitive; use `useAuth()` in the component (matches current `admin.tsx` pattern) to avoid SSR 401.
- LeadsAdmin component reused as-is; admin.tsx file becomes a thin redirect via `Navigate to="/workspace/dashboard" replace`.
- Telegram + email sends run with `Promise.allSettled` so neither blocks the lead insert response.
- All warm-beige tokens added to `src/styles.css` as `--workspace-bg`, `--workspace-card`, `--workspace-border` for reuse.
