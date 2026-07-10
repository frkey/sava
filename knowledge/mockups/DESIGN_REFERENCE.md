# SAVA Design Reference (from Claude Design mockups)

Implementation-ready distillation of the mockup canvas. **Visual source of truth stays the
mockup HTML**: `knowledge/mockups/SAVA_JORNADA_VISUAL.dc.html`. Deep-dive line ranges:

| Canvas section | Artboards | Lines |
|---|---|---|
| Intro + mini design system (`#ds`) | component sheet | 1–156 |
| Acesso (`#ga`) | A1–A5 | 157–282 |
| Painel e Indicadores (`#gb`) | B1–B3 | 283–526 |
| Apontamentos (`#gc`) | C1–C5 | 527–863 |
| Registrar visita — fluxo de campo (`#gd`) | D1–D6 | 864–1190 |
| Administração (`#ge`) | E1–E6 | 1191–1470 |
| Estados do sistema (`#gf`) | F1–F3 | 1471–1549 |
| Desktop 1280 (`#gdesk`) | DT1–DT3 | 1550–1740 |
| Desktop 1280 (cont.) | DT3 tail, DT4–DT6 | 1741–1929 |

Design premises baked into every screen: ~1s latency per RPC → every button has a
"Salvando…" state and lists have skeletons; each visit step auto-saves (no final submit);
roles admin / regional / local (local = read-only, own city); overdue findings must be loud;
pt-BR UI, legible for all ages; own "SAVA" brand — no logo or organization name.
Viewports: **mobile 375px**, **desktop 1280px** (sidebar layout).

---

## 1. Design tokens

### 1.1 Color — brand & neutrals

| Token | Value | Usage |
|---|---|---|
| `brand-900` | `#053B5C` | sidebar bg, logo tile, selected segment pills, Admin badge, hero city text |
| `brand-700` | `#084C74` | accent/link-strong text, mono refs (competência, item codes, IDs), active tab/chip labels, back chevrons, avatar text |
| `brand-600` / **primary** | `#0A5E8C` | primary buttons, text links, focus borders, active chip borders, bar fills, active nav icons, info icon |
| `brand-tint` | `#E8F0F6` | selection/active bg, avatar bg, code chips, info banners, person chips |
| `brand-tint-border` | `#C2D8E8` | info banner/callout border, creation timeline node |
| `brand-row-tint` | `#F7FAFD` | changed-row highlight (import diff) |
| `primary-loading` | `#9FB9CB` | loading-button bg; dashed dropzone & secret-box borders |
| `toast-link` | `#8FB8D4` | inline action inside dark toast |
| `ink-900` | `#17222B` | primary text; toast bg |
| `ink-700` | `#3D4A56` | body text, field labels, unselected chip text |
| `ink-600` | `#5A6875` | secondary text, KPI labels, timeline quotes |
| `ink-550` | `#5F6B76` | Baixa severity, neutral tags, Cancelado text, read-only badge |
| `ink-500` | `#6B7A87` | muted text, table headers, subtitles, select carets |
| `ink-400` | `#8A96A1` | helper/footnote text, inactive nav icons, uppercase field labels |
| `ink-350` | `#98A3AD` | placeholders, chevrons, zero values, "sem prazo" |
| `ink-300` | `#A5AFB8` | disabled button text |
| `dept-bar` | `#49656C` | desktop per-department bar fill |
| `bg-app` | `#F4F6F8` | page/phone bg, table header bg, modal summary card |
| `bg-canvas` | `#EBEEF2` | canvas body; desktop PDF pane bg |
| `surface` | `#fff` | cards, bars, sheets |
| `neutral-100` | `#EEF1F4` | bar tracks, Cancelado bg, neutral chips, disabled button bg, "Registrar" icon circle |
| `skeleton` | `#E3E9EF` | skeleton blocks; **also** default card border & dividers |
| `border-row` | `#EBEFF3` | table-row / menu dividers |
| `border-input` | `#C9D4DD` | inputs, secondary buttons, unselected chips (always 1.5px) |
| `border-neutral` | `#D5DDE4` | Baixa tag border, grab handle, spinner track, radio-off |
| `border-card-alt` | `#DFE5EB` | DS-sheet card border (canvas only) |
| `border-frame` | `#D8DFE6` | artboard frames, PDF canvas border |
| `scrim` | `rgba(11,31,44,.45)` sheets · `rgba(11,31,44,.5)` modals | overlays |

Sidebar white alphas (on `brand-900`): `.14` logo tile · `.16` active item + avatar · `.72`
inactive item · `.55` secondary text · `.45` section label · `.12` dividers.
`#033D60` is the institutional manual source color — **reference only, never used in UI**.

### 1.2 Color — semantic / status

| Token | Value | Usage |
|---|---|---|
| `danger-solid` | `#C22F00` | overdue pill bg, "Perigo" button, overdue-toggle track, overdue numbers, destructive checkbox |
| `danger-strong` | `#C93A00` | error input borders, Aberto dot, error icons, required asterisk, urgent card left border |
| `danger-text` | `#B23300` | Aberto/Alta text, destructive menu item, alert KPI label |
| `danger-text-deep` | `#8C2A00` | login error-banner body text only |
| `danger-bg` | `#FBEDE7` | Aberto bg, error banners, PDF highlight bars |
| `danger-border` | `#F0CDBC` | Alta tag border, alert KPI border |
| `danger-row-tint` | `#FFF9F6` | overdue table-row bg; absent-item row |
| `warning` | `#DBA323` | Em tratamento dot, warning icon, selected "Parcial", warning textarea border |
| `warning-text` | `#8A5F00` | Em tratamento/Média text, warning badges |
| `warning-text-deep` | `#7A5300` | warning banner titles |
| `warning-bg` | `#FCF3DC` | Em tratamento bg, warning banners/badges |
| `warning-border` | `#EBD9AC` | Média tag border, warning banner border |
| `warning-input-bg` | `#FFFDF6` | required-note textarea bg |
| `success-text` | `#1E7A57` | Resolvido text, success buttons/tabs, positive KPI |
| `success-bright` | `#3E9B77` | Resolvido dot, toggles ON, progress fill, toast/check icons |
| `success-bg` | `#E6F4ED` | Resolvido bg, success banners, done tabs |
| `success-border` | `#BFE3D2` | done department-card border, success banner border |

### 1.3 Typography

Families: `'IBM Plex Sans', system-ui, sans-serif` (all UI; weights 400/500/600/700 + 400
italic). `'IBM Plex Mono', monospace` (400/500/600) **only** for: item refs (`4.5`),
competências (`04/2026`), finding IDs (`#A-0347`), logins, numeric counts in bar rows,
temp passwords, pasted TSV.

| Style | Spec |
|---|---|
| Screen title | 700 24px (mobile) / 700 19px (desktop topbar) |
| Dialog/sheet title | 700 19px |
| Card title | 600 14.5–17px |
| App-bar title | 600 16–17px |
| Body | 400 14–15px / 1.45–1.55, `ink-700` |
| Support/meta | 400 12.5–13.5px, `ink-500` |
| Field label | 600 13px, `ink-700` |
| Button | 600 16–17px (mobile) / 600 13.5–14px (desktop) |
| Helper / footnote | 400 12–12.5px, `ink-400` |
| Error helper | 400 12.5px, `danger-text` |
| Pill/badge | 600 10.5–12px |
| Filter chip | 600 (active) / 500 (inactive) 13–13.5px |
| Mono ref inline | 600 11.5–14px Plex Mono, `brand-700` |
| KPI number | 700 28px (mobile/DT6) / 700 32px (DT1) |
| Table header | 600 11.5px, `ink-500`, uppercase |
| Table body | 400 13.5–14px, `ink-900` |

### 1.4 Radii, sizes, shadows, motion

| Token | Value |
|---|---|
| radius: code chip 4–5 · criticality tag 6 · nav/tab/stepper 8 · desktop button 9 · **control (input/button/banner) 10** · card 12 · sheet/frame 20 · modal 16 · desktop artboard 14 · pills = height/2 |
| control height (mobile) | input 50–52 · button 50–54 (primary CTA 52–54) · search 44–46 · decision 44 · compact 38–40 |
| control height (desktop) | button 38–44 · search 40 · pagination 32×32 |
| touch target | ≥ 48px (design decision) |
| pill/badge heights | status 24 (list) / 26 (detail) · small badge 20–22 · filter chip 34–38 · summary chip 30 |
| app bar 60px · bottom nav 74px · desktop topbar 64px · sidebar 232px |
| content padding | mobile 20px 16px · desktop 24px 28px · card 14–18px · grid gap 10–14px |
| focus ring | `box-shadow: 0 0 0 3px rgba(10,94,140,.14)` (canvas also shows `.15`/`.12` — pick `.14`) |
| shadow: frame `0 12px 32px rgba(8,40,64,.1)` · modal `0 24px 60px rgba(8,40,64,.3)` · sheet `0 -12px 40px rgba(8,40,64,.2)` · dropdown `0 16px 40px rgba(8,40,64,.25)` · CTA `0 6px 16px rgba(10,94,140,.3)` · active card `0 4px 12px rgba(10,94,140,.12)` · toast `0 10px 28px rgba(23,34,43,.35)` · PDF `0 4px 16px rgba(8,40,64,.08)` |
| motion | `spin .8s linear infinite` (desktop PDF spinner .9s) · `pulse 1.4s ease infinite`, stagger +.1–.15s |

**Known conflicts (canvas is inconsistent; pick one per row):** toast radius 10 (DS) vs 12
(F3) → use 12; toast shadow `.25/20px` (DS) vs `.35/28px` (F3) → use F3; status dot 6px
(list) vs 7px (detail/DS) — sized per context; button heights 48 (DS) vs 50–54 (screens) —
screens win; focus-ring alpha .12/.14/.15 → `.14`; mobile radius 10 vs desktop 9 for
buttons — per viewport; toggle 44×26 (mobile) vs 36×22 (desktop tables).

---

## 2. Component inventory

### Buttons
All: flex-centered, radius 10 (mobile) / 9 (desktop), 600 weight.
- **Primary**: bg `primary`, white. Mobile h50–54 / 600 16–17px; hero CTA adds shadow
  `0 6px 16px rgba(10,94,140,.3)` + leading "+" in 24px translucent circle. Desktop h38–44 / 13.5–14px.
- **Secondary (outline)**: bg white, `1.5px solid border-input`, text `ink-900`.
- **Brand outline**: `1.5px solid primary`, text `brand-700` (e.g. "Painel completo ↗", "+ Adicionar apontamento").
- **Danger**: bg `danger-solid`, white.
- **Success**: bg `success-text`, white, h54 ("✓ Concluir departamento").
- **Loading**: bg `primary-loading`, white, gap 10; spinner 18×18 `2.5px solid rgba(255,255,255,.4)`,
  top white, `spin .8s`. Label = "Salvando…" pattern ("Entrando…", "Salvando revisão…").
- **Disabled**: bg `neutral-100`, text `ink-300`.
- **Text/ghost**: no bg, `primary`, 600 15px ("Voltar e corrigir").
- **Compact pill**: h38–40, pad 0 14–16px ("+ Novo", "+ Nova", "Copiar", "Exportar", "Baixar").

### Inputs
All: radius 10, `1.5px solid border-input`, white bg, pad 0 12–14px, value 400–500 15–16px.
- **Text** h50–52; **search** h44–46 with CSS-drawn magnifier (`ink-400`); placeholder `ink-350`.
- **Password**: masked dots letter-spacing 3px; inline right toggle "mostrar" (500 13px `primary`).
- **Focus**: border `primary` + focus ring; caret drawn 1.5×18–20px `primary`.
- **Error**: border `danger-strong`; label turns `danger-text`; helper 12.5px `danger-text`.
- **Select**: same box, space-between, caret "▼" 11–12px `ink-500`; selected/active variant:
  border `primary`, bg `brand-tint`, value `brand-700`.
- **Textarea**: min-height 64–180, pad 10–12px 12–14px, 400 14–15px/1.5; warning variant
  border `warning` + bg `warning-input-bg`.
- **Field label**: 600 13px `ink-700`, mb 6–8px; optional suffix "— opcional" 400 `ink-400`;
  required "\*" in `danger-strong`.
- **Chip input**: min-h 52 container; person chips h32, radius 16, bg `brand-tint`,
  `brand-700`, 500 13.5px, trailing "✕".
- **Stepper card**: white card; label 500 12px + count 700 20px; − / + buttons 32×32 radius 8
  `1.5px border-input`.
- **Upload dropzone**: `1.5px dashed #9FB9CB`, radius 12, centered icon circle 34px
  `brand-tint` + title 600 14px `brand-700` + helper.

### Chips & badges
- **Filter chip**: h34–38, radius = h/2. Solid-active bg `brand-900` white; outline-inactive
  `1.5px border-input` text `ink-700`; applied-removable border `primary` bg `brand-tint`
  text `brand-700` + trailing "✕"; dropdown trigger = outline + "▾"; sheet variant prefixes "✓".
- **Status badge (dot pill)**: h24 (list) / h26 (detail), radius h/2, 600 11.5–12px + 6–7px dot.
  Aberto `#FBEDE7`/`#B23300`/dot `#C93A00` · Em tratamento `#FCF3DC`/`#8A5F00`/`#DBA323` ·
  Resolvido `#E6F4ED`/`#1E7A57`/`#3E9B77` · Cancelado `#EEF1F4`/`#5F6B76`/`#98A3AD`.
- **Overdue pill (solid, no dot)**: bg `danger-solid`, white, 700 10.5–12px, h20–26 —
  "Vencido há N dias" / "vencido" / "venc. há N dias".
- **Criticality tag (outlined)**: radius 6, pad 2px 7px–0 9px, 600 11.5px, 1px border —
  "▲ Alta" `#B23300`/`#F0CDBC` · "■ Média" `#8A5F00`/`#EBD9AC` · "● Baixa" `#5F6B76`/`#D5DDE4`.
- **Department-state chip**: "✓ Concluído" success · "◐ Iniciado" brand-tint/`primary` ·
  "Não iniciado" `bg-app` + `1px dashed border-input` · warning sub-chip "⚠ falta PDF/resumo"
  h20–24 `#FCF3DC`/`#8A5F00`/border `#EBD9AC`.
- **Visit status chip**: "em andamento" `brand-tint`/`primary` · "✓ concluída" success (no dot).
- **Role badge** (desktop, h24 radius 12): Admin `brand-900`/white · Regional `brand-tint`/`brand-700` · Local `neutral-100`/`ink-700`.
- **Small state badges** (h20–22): "senha temporária" warning colors · "inativo" / "somente leitura" `neutral-100`/`ink-550`.
- **Diff badges / summary chips** (import preview): novo success · alterado brand-tint ·
  inalterado neutral · "desativar (proposta)" / ausente danger-tint/`danger-text`.
- **Item-code chip**: Plex Mono 600 12–14px `brand-700` on `brand-tint`, radius 4–5, pad 1px 5px.

### Cards & lists
- **Content card**: white, `1px solid #E3E9EF`, radius 12, pad 14–18px; title 600 14.5px;
  optional right link 500 13px `primary`.
- **KPI card**: number 700 28–32px + label 500 12.5–13px `ink-600` + sub 400 12px `ink-350`.
  Alert variant: border `1.5px solid danger-border`, number `danger-solid`, label 600 `danger-text`.
  Positive variant: number `success-text`.
- **Finding card** (mobile list): title 600 14px + status badge; body 400 14px/1.45 `ink-700`;
  footer tags + right deadline text. Urgent variant: extra `border-left:4px solid danger-strong`.
- **Visit list row**: pad 12px, bordered radius 10, chevron "›" `ink-350`.
- **Department card** (visit grid, 2 cols, min-h 74): done = white + border `success-border`,
  ✓ icon circle `success-bright`; active = `1.5px solid primary` + shadow; not-started =
  `bg-app` + `1.5px dashed border-input`, dashed empty icon circle.
- **Radio option card**: radius 12, pad 13–14px; selected border `primary` + bg `brand-tint`,
  radio 20px `6px solid primary` on white; unselected border `#E3E9EF`, radio `2px solid border-input`.
- **Result option card** (review): same shell; selected uses the option's **semantic** color
  (e.g. "Não resolvida" border `danger-strong` + bg `danger-bg`).
- **Bar row** (mini chart): label 86–110px 400 13.5px + track h8–9 radius 4 `neutral-100` +
  fill `primary` (or `dept-bar`) + mono count right-aligned.
- **Data table** (desktop/card): header row bg `bg-app` 600 11.5px `ink-500` uppercase, pad 11px 16px;
  body rows pad 12–13px 16px, divider `border-row`, 400 13.5px; overdue row bg `danger-row-tint`;
  footer link row centered 500 13px `primary`.

### Overlays & feedback
- **Bottom sheet**: scrim `.45`; sheet radius `20 20 0 0`, grab handle 40×4 `#D5DDE4`;
  footer button grid `1fr 1.6fr` gap 10.
- **Modal**: scrim `.5`; white radius 16, pad 24px 20px, modal shadow; inner summary card
  `bg-app` bordered radius 12.
- **Dropdown menu** (user): 250px, radius 14, dropdown shadow; identity row + items 500 15px,
  dividers `border-row`; destructive item `danger-text` with `danger-strong` icon.
- **Banners** (flex gap 10, radius 10, pad 10–12px 12–14px; 18–20px icon circle w/ white glyph):
  info bg `brand-tint` border `brand-tint-border` icon `primary` "i" text `brand-700` ·
  error bg `danger-bg` border `danger-border` icon `danger-strong` "!" ·
  warning bg `warning-bg` border `warning-border` icon `warning` "!" title `warning-text-deep` ·
  success bg `success-bg` border `success-border` count-circle `success-bright`.
- **Toast**: bg `ink-900`, white 500 14–14.5px, radius 12, pad 14px 16px, anchored
  left/right 16 bottom 20; icon circle 20–22px (`success-bright` ✓ / `danger-strong` !);
  error toast has inline action ("Repetir") in `toast-link`.
- **Skeleton**: blocks bg `#E3E9EF`, radius mirrors the mimicked element, `pulse 1.4s`
  staggered; saving form dims to `opacity:.55`.
- **Spinner**: 16–18px ring, `spin`; in-context colors (white-on-primary or `#D5DDE4`/`primary`).
- **Toggle**: mobile 44×26 (knob 20) / desktop 36×22 (knob 17); ON `success-bright`
  (danger context: `danger-solid` for "Somente vencidos"); OFF `border-input`, knob left.
- **Checkbox (destructive checked)**: 18×18 radius 5 bg `danger-solid` white ✓.
- **Timeline entry**: 26–28px node (square radius 7–8 = status change; circle = review/creation),
  1.5px semantic border + tint bg; 2px connector `#E3E9EF`; title 600 13–13.5px, quoted note
  400 12.5–13px `ink-600`, meta 400 11.5–12px `ink-350`.
- **Step tabs (visit)**: 3 segments h34 radius 8 — active `brand-900` white · done
  `success-bg`/`success-text` "✓" prefix · pending `neutral-100`/`ink-500`.
- **Desktop tabs**: active `pad 10px 16px; radius 9 9 0 0; bg #fff; border #E3E9EF (no bottom)`;
  content card below uses radius `0 12 12 12`.
- **Pagination**: 32×32 radius 8; current border `primary` bg `brand-tint`; disabled `ink-350`.
- **Progress bar**: track h8 radius 4 `#E3E9EF` (or `neutral-100`), fill `success-bright` (visit) / `primary` (load).
- **Save indicator**: 7px `success-bright` dot + "salvo agora" 500 12px `success-text`;
  sync variant "⟳ atualizado" 600 12.5px `primary`.
- **Scroll fade**: bottom overlay 36–44px `linear-gradient(rgba(244,246,248,0),#F4F6F8)`.
- **Empty state**: 72px icon circle `success-bg` + ✓ 700 32px `success-bright`; title 700 20px;
  body 400 14.5/1.55 `ink-500`; outline button.
- **Avatar**: initials circle — 36px app bar / 40px lists (`brand-tint` bg, `brand-700` text);
  sidebar 34px `rgba(255,255,255,.16)`; disabled `neutral-100`/`ink-400`; open ring
  `0 0 0 3px rgba(10,94,140,.2)`.
- **Brand**: monogram "S" on `brand-900` tile (64/44/38/34/28px, radius scales 16→8);
  wordmark "SAVA" 700, letter-spacing .4–.5px; tagline "Acompanhamento e Verificação Administrativa".

---

## 3. Screen catalog

Keyed to spec §8. "API" lists the §7 actions each screen consumes.

### §8.1 Login & password (A1, A2, A3, A5 · mobile)
- **A1 Login**: centered brand block (64px logo + wordmark + subtitle) → "Usuário" input →
  "Senha" input with "mostrar" → primary "Entrar" → footer helper (contact admin to reset).
- **A2 Login error**: A1 + generic error banner (credential-agnostic; discloses 5-attempt /
  15-min lockout) + both inputs in error border. Same message for every failure cause (§6).
- **A3 Forced password change** (first access / `mustChangePassword`): minimal app bar
  (logo only, no avatar) → "Crie sua nova senha" → "Senha atual (temporária)", "Nova senha"
  (focused, with live rule hints "✓ mínimo de 8 caracteres" green / "letras e números" gray),
  "Confirme a nova senha" → "Salvar nova senha" → helper "Você continuará conectado…".
- **A5 Session expired**: login with info banner, username preserved, password cleared
  (placeholder "Digite sua senha"), button shown in loading state "Entrando…".
- **API**: `auth.login`, `auth.changePassword`. Chrome (A4): `auth.me`, `auth.logout`.

### §8.2 Home dashboard (B1, B2, DT1, F1, F2)
- **B1 Painel — regional (mobile)**: app bar → "Painel" + "Regional · competência 04/2026" →
  hero CTA "Registrar visita" (+ helper: reopens existing visit) → KPI 2×2 (abertos /
  vencidos-alert / alta / deptos. sem PDF) → card "Abertos por cidade" (bars + "ver todas") →
  card "Últimas visitas" (rows with status chip; tap reopens, §8.5) → 4-tab bottom nav.
- **B2 Painel — local (mobile)**: title = own city; "somente leitura" badge; **no CTA,
  no Registrar tab** (3-tab nav); KPIs incl. positive "82% resolvidos no semestre";
  "Abertos por departamento"; "Últimas visitas em {cidade}".
- **DT1 Painel (desktop)**: sidebar (admin sees ADMINISTRAÇÃO/Cadastros) → topbar with
  "+ Registrar visita" → 4 KPI cards with sub-lines → 2 bar cards (por cidade `primary` fill /
  por departamento `dept-bar` fill) → "Últimas visitas registradas" 3-col mini-cards.
- **F1 Empty**: celebration state — "Nenhum apontamento aberto 🎉" + "Ver resolvidos".
- **F2 Loading**: full skeleton mirroring the dashboard structure (title, subtitle, CTA band,
  2×2 stat cards, list block), staggered pulse.
- **API**: `dashboard.summary {cityId?}`, `visits.list`.

### §8.3 Findings list (C1, C2, DT2)
- **C1 List (mobile)**: app bar → "Apontamentos" + "47 resultados" → search
  ("Buscar no texto do item…") → horizontal chip row ("Abertos ✕" active, "Cidade ▾",
  "Departamento ▾", "Competência") → finding cards (urgent left-border variant, overdue pill,
  deadline text variants) → bottom nav (Apontamentos active).
- **C2 Filters (bottom sheet)**: "Filtros" + "Limpar tudo" → selects Cidade (selected style) /
  Departamento → Status multi-chips → Competência (mono) / Tipo de resposta →
  Criticidade chips (colored text) → toggle "Somente vencidos" (danger track) →
  "Fechar" | "Aplicar filtros · 12" (live count).
- **DT2 Table (desktop)**: topbar "Apontamentos — 12 de 214 · filtros aplicados" + "Exportar" →
  filter row (search 280px, active/inactive chips, "limpar") → table
  `CIDADE·DEPARTAMENTO·ITEM·CRITICIDADE·STATUS·PRAZO`, overdue rows tinted `#FFF9F6`,
  whole row clickable → DT3; pagination.
- **API**: `findings.list {filters, page?}`, `cities.list`, `departments.list`.
  City filter locked for `local` (server-enforced).

### §8.4 Finding detail (C3, C4, C5, DT3)
- **C3 Detail (mobile)**: app bar (back, "Apontamento", mono ID "#A-0347") → badge row
  (status + overdue pill + criticality) → code chip + title → meta (seção, resposta) →
  detail card (CIDADE/DEPARTAMENTO/ORIGEM/PRAZO-red/RESPONSÁVEL/CONSIDERAÇÕES) →
  "Ver PDF do SIGA" + latency helper → actions "Editar" | "Mudar status" | "Registrar revisão" →
  "Linha do tempo" (newest first; square node = status change, circle = review/creation).
- **C4 Mudar status (sheet)**: "Status atual: Aberto"; radio cards list **only allowed
  transitions** with descriptions; "Justificativa \*" required textarea (logged to timeline);
  "Voltar" | "Confirmar mudança".
- **C5 Registrar revisão (sheet)**: visit select (limited to the finding's city) → result cards
  "Resolvida" (obs. optional) / "Não resolvida" (obs. required; selected style is danger-colored) /
  "Parcial" (obs. required · auto-becomes "em tratamento") → "Observação \*" →
  "Voltar" | "Salvar revisão".
- **DT3 (desktop)**: breadcrumb topbar + actions; split view — left PDF pane (in-app viewer,
  skeleton page with highlighted passage, "carregando página 2 de 6…", "Baixar") | right
  details pane (badges, metadata grid, timeline).
- **API**: `findings.get`, `findings.save` (edit), `findings.updateStatus`,
  `findingReviews.save`, `visits.list {cityId}`, `visitDepartments.downloadPdf`.

### §8.5 Visit registration — field flow (D1–D6, F3 · mobile)
Every step saves on completion; interruptible/resumable by another person.
- **D1 Create/reopen**: Cidade select + Data principal + Competência (mono) + info callout
  ("Só existe **uma** visita por cidade e competência…") → sticky "Continuar".
- **D2 Confirmation modal**: "Criar esta visita?" — summary card (city 700 26px, competência
  mono, data) → "Criar visita" / "Voltar e corrigir". `CONFLICT` on duplicate → enter existing.
- **D3 Department grid**: two-line app bar + "⟳ atualizado" sync; progress "14 de 21 concluídos"
  + green bar; helper "Concluir não trava…"; 2-col grid — states done / done+"⚠ falta PDF" /
  done+"⚠ falta resumo" / active (border `primary` + shadow) / not-started (dashed).
- **D4 Step 1 · Participação**: step tabs; person-chip input (regional reps) + city reps input +
  optional verification date; "Resumo de respostas (SIGA)" steppers (Sim / Sim, c/ ressalvas /
  Não / Não aplicável) with "preencher depois"; PDF dropzone with "anexar depois";
  "Salvar e ir para reverificação". Save indicator "salvo agora".
- **D5 Step 2 · Reverificação**: intro (count of pendências; re-entry pre-selects previous
  answers, editable); per-finding cards — code chip + text + severity + "origem MM/YYYY" +
  optional "vencido" pill; one-tap segmented "Resolvida / Não resolvida / Parcial"
  (selected: green / — / amber); "Parcial"/"Não resolvida" reveal required note
  (amber-bordered textarea); "+ adicionar observação (opcional)"; footer
  "Ir para novos apontamentos" + "1 pendência ainda sem resposta — dá para voltar depois."
- **D6 Step 3 · Novos + concluir**: success banner "N apontamento registrado nesta visita · ver";
  catalog-item select card (code + text + auto-filled "Seção … · criticidade … — preenchidos
  pelo catálogo") + escape hatch "item fora do catálogo? digitar manualmente"; response toggle
  "Não" / "Sim, com ressalvas"; Considerações textarea; Prazo/Responsável optional;
  **duplicate warning callout** ("Este item já tem pendência não resolvida aqui." →
  "Ir para a revisão" / "Registrar mesmo assim" = `force:true`); "+ Adicionar apontamento";
  sticky success button "✓ Concluir departamento" (+ helper: not a lock, reopenable).
- **F3 Feedback**: form dimmed `.55` + button "Salvando revisão…" + success toast
  "Revisão salva — 2 de 3 pendências respondidas".
- **API**: `visits.save` (D2; `CONFLICT` = reopen), `visits.get`, `visitDepartments.save`
  (upsert, D4), `visitDepartments.uploadPdf`, `findings.reviewQueue` (D5),
  `findingReviews.save` (each answer, D5), `checklistItems.list` (D6),
  `findings.save {force?}` (D6), `visitDepartments.markDone` (D6).

### §8.6 Admin (E1–E6, E4, DT4, DT5 · admin only)
- **E1 "Mais" hub (mobile)**: 5-tab nav (Painel / Apontam. / Registrar / Indicad. / **Mais**);
  "Administração" + "Cadastros da regional — visível apenas para administradores."; menu card
  rows Usuários 38 / Cidades 30 / Departamentos 21 / Catálogo de itens 412 (mono counts).
- **E2 Users list**: search "Buscar por nome ou login…" + "+ Novo"; user cards with role meta,
  "senha temporária" badge, inactive rows dimmed `.62`.
- **E3 New user**: Nome completo, Login (mono), Perfil radio cards (Admin / Equipe regional /
  Responsável local — descriptions verbatim), conditional "Cidade — obrigatória para perfil
  local", toggle "Usuário ativo"; "Criar usuário" + helper (temp password shown once).
- **E4 Temp password modal**: success icon; "Usuário criado"; deliver-in-person copy;
  dashed secret box with mono password "7kQ-m4Xz" + "Copiar"; warning banner (forced change
  on first access, →A3); "Concluído — já copiei a senha".
- **E5 Cities**: "+ Nova"; per-city toggle; deactivation with open findings shows inline
  warning + "Manter ativa" / "Desativar assim mesmo"; deactivated rows dimmed, history kept.
- **E6 Catalog paste-import (mobile)**: Departamento select; TSV textarea (mono paste:
  ref / seção / texto / criticidade); helper explaining diff preview; "Pré-visualizar alterações".
- **DT4 Users (desktop)**: tabs Usuários/Cidades/Departamentos/Catálogo de itens; table
  `NOME·LOGIN·PERFIL·CIDADE·ATIVO·AÇÕES` (role badges, toggles, "Editar · Resetar senha" /
  "Reativar"); footnote cross-linking E4/A3.
- **DT5 Import preview (desktop)**: breadcrumb; summary chips "2 novos · 1 alterado ·
  17 inalterados · 1 ausente do texto colado"; diff table `REF.·SEÇÃO·TEXTO DO ITEM·
  CRITICIDADE·CLASSIFICAÇÃO` with row tints (changed `#F7FAFD`, absent `#FFF9F6`, unchanged
  muted) and per-row destructive checkbox for proposed deactivations; footer
  "Voltar e corrigir texto" | "Aplicar: 2 novos · 1 alterado · 1 desativação".
- **API**: `users.list/save/resetPassword`, `cities.list/save`, `departments.list/save`,
  `checklistItems.list/save/importPaste {departmentId, tsv}`.

### §8.7 Indicators (B3, DT6)
- **B3 (mobile, regional)**: "Contagens da competência 04/2026"; segment chips "Por cidade" /
  "Por departamento"; table card `CIDADE·ABERTOS·VENCIDOS·ALTA` (vencidos 700 red when >0,
  muted when 0) + "ver as 30 cidades"; outline "Painel completo ↗" + helper (Looker, new tab,
  regional-only). **Local role: no Looker button.**
- **DT6 (desktop)**: KPI row (47 / 9-alert / 12 / 28/30 cidades visitadas); pills "Por cidade" /
  "Por departamento" / "Novos × resolvidos por visita"; table adds `EM TRATAM.` + `CARGA` bar
  column; footnote: advanced analytics live in the external dashboard; local sees cards only.
- **API**: `dashboard.summary`; Looker link is an external URL (regional/admin only, §10).

---

## 4. Navigation & chrome

### Mobile
- **App bar** (h60, white, bottom border `#E3E9EF`, pad 0 16px). Variants: root =
  28px logo + "SAVA" wordmark + right avatar 36px; sub-page = back "‹" (400 22px `brand-700`)
  + title (+ optional right action/ID/save-indicator); two-line variant for visit context
  ("Sumaré · 04/2026" / "visita de 12 abr 2026").
- **User menu** (from avatar, all authenticated screens): scrim below app bar; 250px dropdown —
  identity (name + role) / "Alterar senha" / "Sair" (destructive).
- **Bottom nav** (h74, white, top border, equal grid columns; icons drawn in CSS; active =
  `primary` icon + 600 label `brand-700`):
  - **regional**: Painel · Apontamentos · Registrar (+ in circle) · Indicadores (4 tabs)
  - **local**: Painel · Apontamentos · Indicadores (3 tabs — no Registrar)
  - **admin**: Painel · Apontam. · Registrar · Indicad. · Mais (5 tabs, labels abbreviated)

### Desktop (1280)
- **Sidebar** (232px, bg `brand-900`): logo tile 34px + "SAVA" + tagline "Verificação
  Administrativa"; nav items (radius 8, active `rgba(255,255,255,.16)`): Painel ·
  Apontamentos · Registrar visita · Indicadores; **admin only**: section label
  "ADMINISTRAÇÃO" + item "Cadastros"; footer user block (avatar, name, role, "⋯").
- **Topbar** (h64, white, pad 0 28px): title + inline competência (mono) or breadcrumb
  ("‹ parent / title"); right-aligned page actions.
- Local role on desktop: not mocked (local users are mobile-first read-only; same rules apply —
  no Registrar, no Cadastros, no Looker button).

---

## 5. Microcopy (verbatim pt-BR → `src/client/strings/`)

### Brand & global
| String | Where |
|---|---|
| "SAVA" | wordmark |
| "Sistema de Acompanhamento e Verificação Administrativa" | login subtitle |
| "Acompanhamento e Verificação Administrativa" | brand tagline (DS) |
| "Verificação Administrativa" | sidebar tagline |
| "Salvando…" | canonical button loading label |
| "salvo agora" / "⟳ atualizado" | save/sync indicators |
| "Painel" / "Apontamentos" / "Registrar" / "Indicadores" / "Mais" | mobile nav ("Apontam." / "Indicad." on 5-tab admin nav) |
| "Registrar visita" / "Cadastros" / "ADMINISTRAÇÃO" | desktop sidebar |

### Auth
| String | Where |
|---|---|
| "Usuário" / "Senha" | login labels |
| "Entrar" / "Entrando…" | login button |
| "mostrar" | password toggle |
| "Esqueceu a senha? Fale com o administrador da sua regional para redefinir." | login footer |
| "Usuário ou senha incorretos. Após 5 tentativas seguidas, o acesso fica bloqueado por 15 minutos." | generic login error |
| "Sua sessão expirou. Entre novamente para continuar de onde parou." | session-expired banner |
| "Digite sua senha" | cleared-password placeholder |
| "Crie sua nova senha" | forced-change title |
| "Este é seu primeiro acesso. Por segurança, troque a senha temporária antes de continuar." | forced-change intro |
| "Senha atual (temporária)" / "Nova senha" / "Confirme a nova senha" | labels |
| "mínimo de 8 caracteres" / "letras e números" | password rules |
| "Salvar nova senha" · "Você continuará conectado após a troca." | CTA + helper |
| "Alterar senha" / "Sair" | user menu |

### Statuses & enums
| String | Where |
|---|---|
| "Aberto" / "Em tratamento" / "Resolvido" / "Cancelado" | finding status |
| "Vencido há N dias" / "vencido" / "venc. há N dias" | overdue (pill; long/short/table) |
| "▲ Alta" / "■ Média" / "● Baixa" | criticality |
| "Não" / "Sim, com ressalvas" ("Sim, c/ ressalvas" short) / "Sim" / "Não aplicável" | response types |
| "Resolvida" / "Não resolvida" / "Parcial" | review results |
| "Concluído" / "Iniciado" / "Não iniciado" | department states |
| "⚠ falta PDF" / "⚠ falta resumo" / "⚠ falta PDF/resumo" | department badges |
| "em andamento" / "✓ concluída" | visit status |
| "somente leitura" | local-role badge |
| "Admin" / "Equipe regional" ("Regional") / "Responsável local" ("Local") | roles |
| "senha temporária" / "inativo" | user badges |
| "novo" / "alterado" / "inalterado" / "desativar (proposta)" | import diff |
| "sem prazo" / "prazo {data}" / "resolvido em {data}" / "—" | deadline variants |

### Dashboard & indicators
| String | Where |
|---|---|
| "Regional · competência {MM/YYYY}" / "Painel da cidade" | dashboard subtitles |
| "Se a visita da cidade já existir, você entra nela." | CTA helper |
| "apontamentos abertos" / "vencidos" / "criticidade alta em aberto" / "deptos. sem PDF/resumo" / "resolvidos no semestre" / "abertos na regional" / "cidades visitadas no semestre" / "deptos. concluídos sem PDF/resumo" | KPI labels |
| "Abertos por cidade" / "Abertos por departamento" / "Últimas visitas" / "Últimas visitas em {cidade}" / "Últimas visitas registradas" | card titles |
| "ver todas" / "todas" / "ver as 30 cidades" / "ver todas as 30" / "ver os 21" | links |
| "Contagens da competência {MM/YYYY}" | indicators subtitle |
| "Por cidade" / "Por departamento" / "Novos × resolvidos por visita" | segment pills |
| "CIDADE" / "ABERTOS" / "VENCIDOS" / "ALTA" / "EM TRATAM." / "CARGA" | table headers |
| "Painel completo ↗" | Looker button |
| "Abre o painel analítico em nova aba · visível só para a equipe regional" | Looker helper |
| "Nenhum apontamento aberto 🎉" · "Todas as pendências de {cidade} foram resolvidas ou canceladas." · "Ver resolvidos" | empty state |

### Findings
| String | Where |
|---|---|
| "{N} resultados" · "Buscar no texto do item…" ("Buscar no texto…" desktop) | list header/search |
| "Filtros" / "Limpar tudo" / "limpar" / "Fechar" / "Aplicar filtros · {N}" | filter sheet |
| "Cidade" / "Departamento" / "Status" / "Competência" / "Tipo de resposta" / "Criticidade" / "Todos" | filter labels |
| "Somente vencidos" | filter toggle |
| "Exportar" | desktop list action |
| "CIDADE / DEPARTAMENTO / ITEM / CRITICIDADE / STATUS / PRAZO" | table headers |
| "Apontamento" | detail app-bar title |
| "Seção {X} · resposta \"{Y}\"" | detail meta |
| "CIDADE / DEPARTAMENTO / ORIGEM / PRAZO / RESPONSÁVEL / CONSIDERAÇÕES / RESPOSTA" | detail field labels |
| "Ver PDF do SIGA" · "O arquivo é carregado dentro do app — pode levar alguns segundos." | PDF button + helper |
| "Baixar" · "carregando página {n} de {m}…" · "Relatório do SIGA — {depto} · {MM/YYYY}" | desktop PDF pane |
| "Editar" / "Mudar status" / "Registrar revisão" | detail actions |
| "Linha do tempo" | timeline heading |
| "Status alterado para {status}" / "Status → {status} · manual" / "mudança manual" | timeline (mobile/desktop) |
| "Revisão na visita {MM/YYYY}: {resultado}" / "Revisão {MM/YYYY}: {resultado}" / "revisão de visita" | timeline |
| "Criado na visita {MM/YYYY}" | timeline |
| "Status atual: {status}" | status sheet subtitle |
| "a cidade já está tratando o apontamento" / "confirmado fora de uma visita" / "registrado por engano ou não se aplica mais" | transition descriptions |
| "Justificativa *" · "A justificativa fica registrada na linha do tempo." | status sheet |
| "Voltar" / "Confirmar mudança" / "Salvar revisão" | sheet buttons |
| "Visita" / "Resultado" / "Observação *" | review sheet labels |
| "observação opcional" / "obs. obrigatória" / "obs. obrigatória · vira \"em tratamento\"" | result hints |
| "Descreva a situação encontrada — a próxima visita precisa deste contexto." | observation placeholder |

### Visit flow
| String | Where |
|---|---|
| "Registrar visita" · "Cidade" / "Data principal" / "Competência" | step A |
| "Só existe uma visita por cidade e competência. Se já houver, você entra nela — nada é duplicado." | info callout |
| "Continuar" · "Criar esta visita?" · "Criar visita" / "Voltar e corrigir" | step A/confirm |
| "Confira a cidade e a competência. Cada passo seguinte já salva direto no servidor." | confirm helper |
| "Departamentos" · "{n} de {m} concluídos" | grid header |
| "Toque para abrir. Concluir não trava — qualquer departamento pode ser reaberto." | grid helper |
| "concluído · {N} novos" / "concluído · 1 novo" / "concluído · sem novos" / "iniciado · falta reverificação" / "não iniciado" | card status lines |
| "1 · Participação" / "2 · Reverificação" / "3 · Novos" ("✓ {nome}" when done) | step tabs |
| "Representantes da regional" / "Representantes da cidade" / "Data da verificação — opcional" | participation labels |
| "mesma do dia principal ({data})" | date placeholder |
| "Resumo de respostas (SIGA)" · "preencher depois" · "PDF do SIGA" · "anexar depois" | deferrable sections |
| "Anexar PDF do relatório" · "o relatório às vezes só sai depois da visita" | dropzone |
| "Salvar e ir para reverificação" / "Ir para novos apontamentos" | step CTAs |
| "Pendências das visitas anteriores desta cidade e departamento: {N}. Já revisadas nesta visita aparecem pré-selecionadas — corrigir substitui a resposta." | review intro |
| "origem {MM/YYYY}" · "+ adicionar observação (opcional)" · "Observação obrigatória para \"Parcial\"" | review card |
| "{N} pendência ainda sem resposta — dá para voltar depois." | review footer helper |
| "apontamento registrado nesta visita" · "ver" | new-findings banner |
| "Item do checklist" · "Seção {X} · criticidade {Y} — preenchidos pelo catálogo" | catalog select |
| "item fora do catálogo? digitar manualmente" | escape hatch |
| "Tipo de resposta" / "Considerações" / "Prazo — opcional" / "Responsável — opcional" / "nome ou função" | new-finding fields |
| "Este item já tem pendência não resolvida aqui." · "O caminho certo é revisá-la no passo anterior — registrar de novo cria duplicidade." · "Ir para a revisão" / "Registrar mesmo assim" | duplicate warning |
| "+ Adicionar apontamento" · "✓ Concluir departamento" | actions |
| "Volta para a grade. Concluir não trava — dá para reabrir tocando no departamento." | conclude helper |
| "Salvando revisão…" · "Revisão salva — {n} de {m} pendências respondidas" | saving/toast |

### Admin
| String | Where |
|---|---|
| "Administração" · "Cadastros da regional — visível apenas para administradores." | hub |
| "Usuários" / "Cidades" / "Departamentos" / "Catálogo de itens" | sections/tabs |
| "criar, desativar, resetar senha" / "ativar e desativar cidades da regional" / "os 21 departamentos de verificação" / "importação por colar texto do SIGA" | hub subtitles |
| "+ Novo" / "+ Nova" / "+ Novo usuário" · "Buscar por nome ou login…" | list actions |
| "Novo usuário" · "Nome completo" / "Login" / "Perfil" / "Cidade — obrigatória para perfil local" / "Usuário ativo" | user form |
| "tudo + administração" / "registra visitas e apontamentos, vê todas as cidades" / "somente leitura, restrito à própria cidade" | role descriptions |
| "Criar usuário" · "Uma senha temporária será gerada e mostrada uma única vez." | CTA + helper |
| "Usuário criado" · "Entregue a senha temporária a {nome} pessoalmente. Ela não poderá ser vista de novo." | temp-password modal |
| "Copiar" · "No primeiro acesso o sistema exigirá a troca desta senha." · "Concluído — já copiei a senha" | modal |
| "Editar · Resetar senha" / "Editar · Reativar" | user row actions |
| "NOME / LOGIN / PERFIL / CIDADE / ATIVO / AÇÕES" | users table |
| "A cidade tem {N} pendências abertas. Elas continuam listáveis e podem ser encerradas; a cidade sai de novas visitas." · "Manter ativa" / "Desativar assim mesmo" | city deactivation |
| "desativada em {ano} · histórico preservado" · "{N} apontamentos abertos" / "nenhum apontamento aberto" | city rows |
| "Cole as linhas do checklist" · "Pré-visualizar alterações" | import form |
| "Cada linha: referência, seção, texto e criticidade. A pré-visualização classifica em novo / alterado / inalterado / ausente antes de aplicar — nada é desativado sem sua confirmação." | import helper |
| "Pré-visualização da importação — {depto}" · "REF. / SEÇÃO / TEXTO DO ITEM / CRITICIDADE / CLASSIFICAÇÃO" | preview |
| "{N} novos" / "{N} alterado" / "{N} inalterados" / "{N} ausente do texto colado" | summary chips |
| "— criticidade: {X} → {Y}" / "— não veio no texto colado" | inline diff notes |
| "Itens ausentes são apenas propostas de desativação — desmarque para manter. Apontamentos existentes guardam um retrato do item e nunca são afetados." | preview helper |
| "Voltar e corrigir texto" · "Aplicar: {N} novos · {N} alterado · {N} desativação" | preview actions |

### Errors & toasts
| String | Where |
|---|---|
| "Apontamento salvo" | success toast (DS) |
| "Não foi possível salvar. Tente novamente." · "Repetir" | error toast + retry action |
| "Use o formato MM/AAAA, ex.: 10/2025" | date validation helper (DS) |
| "nome.sobrenome" | login placeholder pattern |
