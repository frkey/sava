/**
 * ALL user-facing SAVA copy, in pt-BR, transcribed verbatim from
 * knowledge/mockups/DESIGN_REFERENCE.md §5. Components MUST source every string from
 * here — never hardcode UI text (CLAUDE.md hard rule).
 *
 * A few strings are kept for traceability even though the live app won't render them
 * as-is (documented inline): server-echoed error messages (e.g. the generic login
 * error) are shown verbatim from the RPC envelope's `error.message`, not from a
 * static constant here — both the prod server and the dev mock already return the
 * exact right pt-BR text, so duplicating it here would risk silently drifting from
 * src/server/services/auth.ts.
 */
import type { FindingStatus, Severity, FindingResponse, ReviewResult } from '../../shared/types';

/** open→'Aberto', in_treatment→'Em tratamento', resolved→'Resolvido', cancelled→'Cancelado' */
export const statusLabel: Record<FindingStatus, string> = {
  open: 'Aberto',
  in_treatment: 'Em tratamento',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
};

/** high→'Alta', medium→'Média', low→'Baixa' */
export const severityLabel: Record<Severity, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

/** no→'Não', yes_with_caveats→'Sim, com ressalvas' */
export const responseLabel: Record<FindingResponse, string> = {
  no: 'Não',
  yes_with_caveats: 'Sim, com ressalvas',
};

/** Review outcome (findingReviews.save `result`). */
export const reviewResultLabel: Record<ReviewResult, string> = {
  resolved: 'Resolvida',
  not_resolved: 'Não resolvida',
  partial: 'Parcial',
};

export const t = {
  errors: {
    gasUnavailable: 'google.script.run indisponível neste ambiente.',
    /** callProd's withFailureHandler fallback (lib/gas.ts) — used only when the
     *  google.script.run transport itself fails and carries no message of its own. */
    unexpected: 'Erro inesperado.',
  },

  brand: {
    wordmark: 'SAVA',
    loginSubtitle: 'Sistema de Acompanhamento e Verificação Administrativa',
    tagline: 'Acompanhamento e Verificação Administrativa',
    sidebarTagline: 'Verificação Administrativa',
  },

  common: {
    saving: 'Salvando…',
    savedNow: 'salvo agora',
    synced: '⟳ atualizado',
    back: 'Voltar',
    close: 'Fechar',
    clearAll: 'Limpar tudo',
    clear: 'limpar',
    changePassword: 'Alterar senha',
    logout: 'Sair',
    periodFormatHelper: 'Use o formato MM/AAAA, ex.: 10/2025',
  },

  nav: {
    mainNavigation: 'Navegação principal',
    mobile: {
      painel: 'Painel',
      apontamentos: 'Apontamentos',
      apontamentosShort: 'Apontam.',
      registrar: 'Registrar',
      indicadores: 'Indicadores',
      indicadoresShort: 'Indicad.',
      mais: 'Mais',
    },
    desktop: {
      registrarVisita: 'Registrar visita',
      cadastros: 'Cadastros',
      administracaoSectionLabel: 'ADMINISTRAÇÃO',
    },
  },

  roles: {
    admin: 'Admin',
    regional: 'Equipe regional',
    regionalShort: 'Regional',
    local: 'Responsável local',
    localShort: 'Local',
  },

  /** Enum-adjacent labels not covered by the three exported Record maps above. */
  labels: {
    overdueLong: (days: number) => `Vencido há ${days} dias`,
    overdueShort: 'vencido',
    overdueTable: (days: number) => `venc. há ${days} dias`,
    criticalityTag: {
      high: '▲ Alta',
      medium: '■ Média',
      low: '● Baixa',
    } satisfies Record<Severity, string>,
    responseShort: {
      yes_with_caveats: 'Sim, c/ ressalvas',
    } as Partial<Record<FindingResponse, string>>,
    /** 4-level SIGA answer summary (VisitDepartment.countYes/countYesWithCaveats/countNo/countNotApplicable). */
    answerSummary: {
      yes: 'Sim',
      yesWithCaveats: 'Sim, com ressalvas',
      no: 'Não',
      notApplicable: 'Não aplicável',
    },
    departmentState: {
      done: 'Concluído',
      started: 'Iniciado',
      notStarted: 'Não iniciado',
    },
    missingPdf: '⚠ falta PDF',
    missingSummary: '⚠ falta resumo',
    missingBoth: '⚠ falta PDF/resumo',
    visitStatus: {
      inProgress: 'em andamento',
      done: '✓ concluída',
    },
    readOnlyBadge: 'somente leitura',
    tempPasswordBadge: 'senha temporária',
    inactiveBadge: 'inativo',
    deadline: {
      none: 'sem prazo',
      due: (date: string) => `prazo ${date}`,
      resolvedOn: (date: string) => `resolvido em ${date}`,
      dash: '—',
    },
  },

  auth: {
    username: 'Usuário',
    password: 'Senha',
    loginPlaceholder: 'nome.sobrenome',
    submit: 'Entrar',
    submitting: 'Entrando…',
    showPassword: 'mostrar',
    /** Not in the DESIGN_REFERENCE microcopy table (mockups only show the static
     * "mostrar" label) — added for the actual show/hide toggle interaction. */
    hidePassword: 'ocultar',
    forgotPassword: 'Esqueceu a senha? Fale com o administrador da sua regional para redefinir.',
    /**
     * DESIGN_REFERENCE §5 mockup copy — kept for traceability only. The real server
     * (src/server/services/auth.ts GENERIC_LOGIN_ERROR) returns a different literal
     * message; the login screen must render the caught ApiError's own `.message`,
     * which is identical for prod and the dev mock, not this constant.
     */
    loginErrorMockupCopy: 'Usuário ou senha incorretos. Após 5 tentativas seguidas, o acesso fica bloqueado por 15 minutos.',
    sessionExpired: 'Sua sessão expirou. Entre novamente para continuar de onde parou.',
    passwordPlaceholderCleared: 'Digite sua senha',
    changePasswordTitle: 'Crie sua nova senha',
    changePasswordIntro: 'Este é seu primeiro acesso. Por segurança, troque a senha temporária antes de continuar.',
    currentPasswordTemp: 'Senha atual (temporária)',
    /** Voluntary change-password (from the user menu) isn't a temp/first-access
     * password, so it drops the "(temporária)" qualifier A3's forced-mode copy has. */
    currentPasswordPlain: 'Senha atual',
    newPassword: 'Nova senha',
    confirmNewPassword: 'Confirme a nova senha',
    ruleMinLength: 'mínimo de 8 caracteres',
    ruleLettersNumbers: 'letras e números',
    savePasswordCta: 'Salvar nova senha',
    savePasswordHelper: 'Você continuará conectado após a troca.',
    /** Voluntary (non-forced) change-password screen title, from the user menu. */
    changePasswordVoluntaryTitle: 'Alterar senha',
    /**
     * Client-side mirror of src/server/lib/crypto.ts#checkPasswordPolicy — transcribed
     * verbatim so the two never drift silently. Cross-check against that file if the
     * server policy ever changes.
     */
    policyMinLength: 'A senha precisa ter no mínimo 8 caracteres.',
    policyLetter: 'A senha precisa conter ao menos uma letra.',
    policyDigit: 'A senha precisa conter ao menos um número.',
    /** Client-only check (the server has no "confirmação" field) — no server string to mirror. */
    confirmMismatch: 'As senhas não coincidem.',
    passwordChanged: 'Senha alterada com sucesso.',
    /** Re-login-after-changePassword failure path (e.g. network blip): the change
     * already took effect server-side (session revoked), so the user is sent back to
     * Login instead of the success toast — see ChangePassword.tsx#handleSubmit. */
    passwordChangedSignInAgain: 'Senha alterada com sucesso. Entre novamente com a nova senha.',
  },

  dashboard: {
    /** DESIGN_REFERENCE mockup copy (B1) — kept for traceability only. NOT used for the
     * dashboard header: divergence C-4 (knowledge/mockups/MOCKUP_DIVERGENCES.md) flags
     * this exact string as mislabeling dashboard.summary's KPIs as period-scoped when
     * they're current-state aggregates. See currentSemesterLabel/citiesVisitedOfTotal. */
    subtitleRegional: (period: string) => `Regional · competência ${period}`,
    subtitleLocal: 'Painel da cidade',
    /** C-4 fix: semester shown only as context for citiesVisitedInSemester/latestVisits,
     * never implying the KPI cards themselves are filtered by it. */
    currentSemesterLabel: 'semestre atual',
    citiesVisitedOfTotal: (visited: number, total: number) => `${visited} de ${total} cidades visitadas`,
    registerVisitHelper: 'Se a visita da cidade já existir, você entra nela.',
    /** Not in the DESIGN_REFERENCE microcopy table — needed for the "Abertos por
     * cidade" bar rows' overdue sub-badge (task 4 brief), which has no mocked count
     * copy of its own (only the day-count variants in labels.overdue*). */
    overdueBadge: (n: number) => `${n} vencido${n === 1 ? '' : 's'}`,
    /** dashboard.summary RPC failure fallback (EmptyState + reload) — no dedicated
     * mockup copy for this state; distinct from the F1 "no findings" celebration. */
    loadErrorTitle: 'Não foi possível carregar o painel.',
    kpi: {
      open: 'apontamentos abertos',
      overdue: 'vencidos',
      highSeverityOpen: 'criticidade alta em aberto',
      missingPdfOrSummary: 'deptos. sem PDF/resumo',
      resolvedSemester: 'resolvidos no semestre',
      openRegional: 'abertos na regional',
      citiesVisitedSemester: 'cidades visitadas no semestre',
      completedMissingPdfOrSummary: 'deptos. concluídos sem PDF/resumo',
    },
    openByCityTitle: 'Abertos por cidade',
    openByDepartmentTitle: 'Abertos por departamento',
    latestVisitsTitle: 'Últimas visitas',
    latestVisitsInCityTitle: (city: string) => `Últimas visitas em ${city}`,
    latestVisitsRegisteredTitle: 'Últimas visitas registradas',
    seeAll: 'ver todas',
    allShort: 'todas',
    seeAllCitiesLink: (n: number) => `ver as ${n} cidades`,
    seeAllCitiesShort: (n: number) => `ver todas as ${n}`,
    seeAllDepartmentsLink: (n: number) => `ver os ${n}`,
    emptyTitle: 'Nenhum apontamento aberto 🎉',
    emptyBody: (city: string) => `Todas as pendências de ${city} foram resolvidas ou canceladas.`,
    emptySeeResolved: 'Ver resolvidos',
  },

  indicators: {
    /** DESIGN_REFERENCE mockup copy (B3/DT6) — kept for traceability only, same C-4
     * rationale Dashboard.tsx's `subtitleRegional` documents: `dashboard.summary`'s KPIs
     * are current-state, not period-filtered, so labeling the whole screen "contagens
     * da competência X" would mislabel them. Indicators.tsx uses the same semester-
     * context-line treatment Dashboard.tsx already settled on instead
     * (`currentSemesterLabel` + `citiesVisitedOfTotal`). */
    subtitle: (period: string) => `Contagens da competência ${period}`,
    segments: {
      byCity: 'Por cidade',
      byDepartment: 'Por departamento',
      /** DESIGN_REFERENCE mockup copy (DT6 third pill) — kept for traceability only.
       * Divergence B-5: dropped in v1 (no table backs it; Indicadores' in-app cuts are
       * the same counts as Painel, city/department only). */
      newVsResolved: 'Novos × resolvidos por visita',
    },
    headers: {
      city: 'CIDADE',
      /** Not in DESIGN_REFERENCE's mockup table (B3/DT6's table only ever shows the
       *  "por cidade" cut) — needed for the "por departamento" cut's first column. */
      department: 'DEPARTAMENTO',
      open: 'ABERTOS',
      overdue: 'VENCIDOS',
      /** Not backed by `dashboard.summary` (no per-city/per-department high-severity,
       *  in-treatment, or load-% counts) — same "don't fabricate numbers the server
       *  doesn't return" rule Dashboard.tsx's KPI sub-lines follow. Kept for
       *  traceability; unused. */
      high: 'ALTA',
      inTreatment: 'EM TRATAM.',
      load: 'CARGA',
    },
    lookerButton: 'Painel completo ↗',
    lookerHelper: 'Abre o painel analítico em nova aba · visível só para a equipe regional',
    /** Not in DESIGN_REFERENCE's mockup table — the mockups never show the pre-launch
     *  state where no Looker report exists yet (spec §15: built manually once real prod
     *  data exists). Shown as the disabled Looker button's helper instead of
     *  `lookerHelper` whenever `LOOKER_URL` (lib/config.ts) is unset. */
    lookerUnconfiguredHelper: 'URL do painel ainda não configurada.',
    /** `dashboard.summary` RPC failure fallback (EmptyState + reload) — same pattern as
     *  `dashboard.loadErrorTitle`; no dedicated mockup copy for this state. */
    loadErrorTitle: 'Não foi possível carregar os indicadores.',
  },

  findings: {
    resultsCount: (n: number) => `${n} resultados`,
    loadErrorTitle: 'Não foi possível carregar os apontamentos.',
    searchPlaceholder: 'Buscar no texto do item…',
    /** Unused: the single CSS-switched search input uses the mobile copy at both breakpoints. */
    searchPlaceholderDesktop: 'Buscar no texto…',
    filtersTitle: 'Filtros',
    clearAll: 'Limpar tudo',
    clear: 'limpar',
    close: 'Fechar',
    /** Divergence B-7: no live RPC-backed count in practice; pass n only when derivable client-side. */
    applyFilters: (n?: number) => (n == null ? 'Aplicar filtros' : `Aplicar filtros · ${n}`),
    filterLabels: {
      city: 'Cidade',
      department: 'Departamento',
      status: 'Status',
      period: 'Competência',
      responseType: 'Tipo de resposta',
      severity: 'Criticidade',
      all: 'Todos',
    },
    overdueOnly: 'Somente vencidos',
    /** Divergence B-2: cut from v1 UI; copy kept for traceability. */
    export: 'Exportar',
    tableHeaders: {
      city: 'CIDADE',
      department: 'DEPARTAMENTO',
      item: 'ITEM',
      severity: 'CRITICIDADE',
      status: 'STATUS',
      deadline: 'PRAZO',
    },
    detailTitle: 'Apontamento',
    sectionResponseMeta: (section: string, response: string) => `Seção ${section} · resposta "${response}"`,
    detailFields: {
      city: 'CIDADE',
      department: 'DEPARTAMENTO',
      origin: 'ORIGEM',
      deadline: 'PRAZO',
      assignee: 'RESPONSÁVEL',
      considerations: 'CONSIDERAÇÕES',
      response: 'RESPOSTA',
    },
    viewPdf: 'Ver PDF do SIGA',
    viewPdfHelper: 'O arquivo é carregado dentro do app — pode levar alguns segundos.',
    /** Divergence C-3: mobile downloads rather than viewing in-app. */
    viewPdfHelperMobile: 'O arquivo é baixado pelo app — pode levar alguns segundos.',
    download: 'Baixar',
    loadingPdfPage: (page: number, total: number) => `carregando página ${page} de ${total}…`,
    /** Divergence B-8: simplified spinner copy, no per-page progress. */
    loadingPdf: 'carregando PDF…',
    reportTitle: (department: string, period: string) => `Relatório do SIGA — ${department} · ${period}`,
    actions: {
      edit: 'Editar',
      changeStatus: 'Mudar status',
      registerReview: 'Registrar revisão',
    },
    timelineTitle: 'Linha do tempo',
    timeline: {
      statusChangedMobile: (status: string) => `Status alterado para ${status}`,
      statusChangedDesktop: (status: string) => `Status → ${status} · manual`,
      manualChangeTag: 'mudança manual',
      reviewInVisit: (period: string, result: string) => `Revisão na visita ${period}: ${result}`,
      reviewShort: (period: string, result: string) => `Revisão ${period}: ${result}`,
      visitReviewTag: 'revisão de visita',
      createdInVisit: (period: string) => `Criado na visita ${period}`,
    },
    currentStatus: (status: string) => `Status atual: ${status}`,
    /** Transition-description copy, keyed by the TARGET status of a manual status change. */
    transitionDescriptions: {
      in_treatment: 'a cidade já está tratando o apontamento',
      resolved: 'confirmado fora de uma visita',
      cancelled: 'registrado por engano ou não se aplica mais',
    } as Partial<Record<FindingStatus, string>>,
    justificationLabel: 'Justificativa *',
    justificationHelper: 'A justificativa fica registrada na linha do tempo.',
    confirmChange: 'Confirmar mudança',
    saveReview: 'Salvar revisão',
    reviewLabels: {
      visit: 'Visita',
      result: 'Resultado',
      notes: 'Observação *',
    },
    reviewHints: {
      optional: 'observação opcional',
      required: 'obs. obrigatória',
      requiredPartial: 'obs. obrigatória · vira "em tratamento"',
    },
    observationPlaceholder: 'Descreva a situação encontrada — a próxima visita precisa deste contexto.',
    /** Not in DESIGN_REFERENCE's microcopy table (mockups never show C5's select open) —
     *  needed for the visit `<select>`'s empty option and the zero-visits edge case. */
    selectVisitPlaceholder: 'Selecione a visita',
    noVisitsForCity: 'Nenhuma visita registrada para esta cidade ainda.',
    /** Task 6 additions — success toasts (CLAUDE.md: centralized, never hardcoded) and
     *  the "Editar" dialog (A-2 in MOCKUP_DIVERGENCES.md: no mockup exists for this
     *  form; the recommendation there — reuse the future new-finding form pre-filled —
     *  isn't buildable yet since Task 7/Visit.tsx doesn't exist, so this is a minimal
     *  self-contained descriptive-fields-only form per the task brief). */
    statusChangeSuccess: 'Status atualizado.',
    reviewSaveSuccess: 'Revisão registrada.',
    editSaveSuccess: 'Apontamento atualizado.',
    editTitle: 'Editar apontamento',
    editSaveCta: 'Salvar alterações',
    editFields: {
      itemRef: 'Referência — opcional',
      section: 'Seção — opcional',
      itemText: 'Texto do item',
      severity: 'Criticidade',
    },
    pdfDialogTitle: (department: string) => `PDF do SIGA — ${department}`,
  },

  visit: {
    title: 'Registrar visita',
    cityLabel: 'Cidade',
    mainDateLabel: 'Data principal',
    periodLabel: 'Competência',
    uniquenessCallout: 'Só existe uma visita por cidade e competência. Se já houver, você entra nela — nada é duplicado.',
    continueCta: 'Continuar',
    confirmTitle: 'Criar esta visita?',
    confirmHelper: 'Confira a cidade e a competência. Cada passo seguinte já salva direto no servidor.',
    confirmPeriodLabel: (period: string) => `competência ${period}`,
    confirmMainDateLabel: (date: string) => `data principal ${date}`,
    confirmCta: 'Criar visita',
    backToEdit: 'Voltar e corrigir',
    departmentsTitle: 'Departamentos',
    progress: (done: number, total: number) => `${done} de ${total} concluídos`,
    gridHelper: 'Toque para abrir. Concluir não trava — qualquer departamento pode ser reaberto.',
    cardStatus: {
      doneWithNew: (n: number) => `concluído · ${n} novos`,
      doneWithOneNew: 'concluído · 1 novo',
      doneNoNew: 'concluído · sem novos',
      startedMissingReview: 'iniciado · falta reverificação',
      notStarted: 'não iniciado',
    },
    steps: {
      participation: '1 · Participação',
      review: '2 · Reverificação',
      newFindings: '3 · Novos',
    },
    stepDoneLabel: (name: string) => `✓ ${name}`,
    participation: {
      regionalReps: 'Representantes da regional',
      cityReps: 'Representantes da cidade',
      verificationDate: 'Data da verificação — opcional',
    },
    sameAsMainDate: (date: string) => `mesma do dia principal (${date})`,
    summaryTitle: 'Resumo de respostas (SIGA)',
    fillLater: 'preencher depois',
    pdfTitle: 'PDF do SIGA',
    attachLater: 'anexar depois',
    attachPdfCta: 'Anexar PDF do relatório',
    attachPdfHelper: 'o relatório às vezes só sai depois da visita',
    goToReviewCta: 'Salvar e ir para reverificação',
    goToNewFindingsCta: 'Ir para novos apontamentos',
    reviewIntro: (n: number) =>
      `Pendências das visitas anteriores desta cidade e departamento: ${n}. Já revisadas nesta visita aparecem pré-selecionadas — corrigir substitui a resposta.`,
    originLabel: (period: string) => `origem ${period}`,
    addNoteOptional: '+ adicionar observação (opcional)',
    noteRequiredForPartial: 'Observação obrigatória para "Parcial"',
    pendingCount: (n: number) => `${n} pendência ainda sem resposta — dá para voltar depois.`,
    newFindingsBanner: (n: number) => `${n} apontamento registrado nesta visita`,
    viewLink: 'ver',
    catalogItemLabel: 'Item do checklist',
    catalogAutofillHelper: (section: string, severity: string) =>
      `Seção ${section} · criticidade ${severity} — preenchidos pelo catálogo`,
    manualEntryLink: 'item fora do catálogo? digitar manualmente',
    newFinding: {
      responseType: 'Tipo de resposta',
      considerations: 'Considerações',
      deadline: 'Prazo — opcional',
      assignee: 'Responsável — opcional',
      assigneePlaceholder: 'nome ou função',
    },
    duplicateWarning: {
      title: 'Este item já tem pendência não resolvida aqui.',
      body: 'O caminho certo é revisá-la no passo anterior — registrar de novo cria duplicidade.',
      goToReview: 'Ir para a revisão',
      registerAnyway: 'Registrar mesmo assim',
    },
    addFindingCta: '+ Adicionar apontamento',
    concludeCta: '✓ Concluir departamento',
    concludeHelper: 'Volta para a grade. Concluir não trava — dá para reabrir tocando no departamento.',
    savingReview: 'Salvando revisão…',
    reviewSavedToast: (n: number, m: number) => `Revisão salva — ${n} de ${m} pendências respondidas`,

    /**
     * Additions beyond DESIGN_REFERENCE §5's microcopy table — that table transcribes
     * only what D1–D6's screenshots happen to show; these cover interaction states the
     * mockups don't capture a frame for (admin delete-visit overflow, the "PDF already
     * attached" re-upload state, an empty review queue, and the catalog↔manual toggle's
     * reverse direction). Named/styled consistently with the rest of this block.
     */
    periodPlaceholder: 'MM/AAAA',
    cityPlaceholder: 'Selecione a cidade',
    visitOfDate: (date: string) => `visita de ${date}`,
    /** D5 shows decisions as already answered; this project adds an explicit confirm
     *  step per card (disabled until a required observação is filled) rather than
     *  auto-saving on tap/blur — see ReviewQueue.tsx's file header. */
    saveDecisionCta: 'Salvar decisão',
    deleteVisitCta: 'Excluir visita',
    deleteVisitConfirmTitle: 'Excluir esta visita?',
    deleteVisitConfirmBody: 'Esta ação não pode ser desfeita. Só é possível excluir enquanto nenhum departamento tiver sido registrado nesta visita.',
    deleteVisitSuccessToast: 'Visita excluída.',
    /** Admin-only, DepartmentFlow header (task 7 review fix 2) — mirrors the
     *  deleteVisit* strings above, scoped to a single department's row instead of the
     *  whole visit. Reachable once `ensureVisitDepartmentId` may have lazily created a
     *  bare row nobody meant to keep. */
    deleteDeptCta: 'Excluir registro do departamento',
    deleteDeptConfirmTitle: 'Excluir o registro deste departamento?',
    deleteDeptConfirmBody: 'Esta ação não pode ser desfeita. Só é possível excluir enquanto não houver apontamentos ou revisões registrados neste departamento nesta visita.',
    deleteDeptSuccessToast: 'Registro do departamento excluído.',
    pdfAttached: 'PDF anexado ✓',
    pdfReplaceCta: 'Substituir PDF',
    pdfUploading: 'Enviando…',
    pdfTooLarge: 'O arquivo excede 10 MB.',
    pdfMustBePdf: 'O arquivo precisa ser um PDF.',
    pdfReadError: 'Falha ao ler o arquivo. Tente novamente.',
    decrementOf: (label: string) => `Diminuir ${label}`,
    incrementOf: (label: string) => `Aumentar ${label}`,
    removeRep: (name: string) => `Remover ${name}`,
    noQueueTitle: 'Nenhuma pendência anterior',
    noQueueHint: 'Este departamento não tem apontamentos em aberto de visitas anteriores.',
    noteRequiredForNotResolved: 'Observação obrigatória para "Não resolvida"',
    useCatalogLink: 'usar item do catálogo',
    catalogSelectPlaceholder: 'Selecione um item do catálogo',
    addRepPlaceholder: 'nome — Enter para adicionar',
    cityRepsPlaceholder: 'nome do responsável local',
  },

  admin: {
    title: 'Administração',
    hubSubtitle: 'Cadastros da regional — visível apenas para administradores.',
    sections: {
      users: 'Usuários',
      cities: 'Cidades',
      departments: 'Departamentos',
      catalog: 'Catálogo de itens',
    },
    hubDescriptions: {
      users: 'criar, desativar, resetar senha',
      cities: 'ativar e desativar cidades da regional',
      departments: 'os 21 departamentos de verificação',
      catalog: 'importação por colar texto do SIGA',
    },
    addNewMasc: '+ Novo',
    addNewFem: '+ Nova',
    addNewUser: '+ Novo usuário',
    searchPlaceholder: 'Buscar por nome ou login…',
    userForm: {
      title: 'Novo usuário',
      name: 'Nome completo',
      login: 'Login',
      role: 'Perfil',
      city: 'Cidade — obrigatória para perfil local',
      active: 'Usuário ativo',
    },
    roleDescriptions: {
      admin: 'tudo + administração',
      regional: 'registra visitas e apontamentos, vê todas as cidades',
      local: 'somente leitura, restrito à própria cidade',
    },
    createUserCta: 'Criar usuário',
    createUserHelper: 'Uma senha temporária será gerada e mostrada uma única vez.',
    userCreatedTitle: 'Usuário criado',
    passwordResetTitle: 'Senha redefinida',
    deliverPasswordInPerson: (name: string) => `Entregue a senha temporária a ${name} pessoalmente. Ela não poderá ser vista de novo.`,
    copy: 'Copiar',
    forcedChangeNotice: 'No primeiro acesso o sistema exigirá a troca desta senha.',
    doneCopiedPassword: 'Concluído — já copiei a senha',
    editResetPassword: 'Editar · Resetar senha',
    editReactivate: 'Editar · Reativar',
    usersTableHeaders: {
      name: 'NOME',
      login: 'LOGIN',
      role: 'PERFIL',
      city: 'CIDADE',
      active: 'ATIVO',
      actions: 'AÇÕES',
    },
    cityDeactivateWarning: (n: number) =>
      `A cidade tem ${n} pendências abertas. Elas continuam listáveis e podem ser encerradas; a cidade sai de novas visitas.`,
    keepActive: 'Manter ativa',
    deactivateAnyway: 'Desativar assim mesmo',
    /** DESIGN_REFERENCE mockup copy — Cities has no deactivation date field (divergence B-9); prefer deactivatedPlain. */
    deactivatedSince: (year: string | number) => `desativada em ${year} · histórico preservado`,
    deactivatedPlain: 'desativada · histórico preservado',
    openFindingsCount: (n: number) => `${n} apontamentos abertos`,
    noOpenFindings: 'nenhum apontamento aberto',
    pasteChecklistLabel: 'Cole as linhas do checklist',
    previewChangesCta: 'Pré-visualizar alterações',
    importHelper: 'Cada linha: referência, seção, texto e criticidade. A pré-visualização classifica em novo / alterado / inalterado / ausente antes de aplicar — nada é desativado sem sua confirmação.',
    importPreviewTitle: (department: string) => `Pré-visualização da importação — ${department}`,
    importTableHeaders: {
      ref: 'REF.',
      section: 'SEÇÃO',
      text: 'TEXTO DO ITEM',
      severity: 'CRITICIDADE',
      classification: 'CLASSIFICAÇÃO',
    },
    importDiff: {
      new: 'novo',
      changed: 'alterado',
      unchanged: 'inalterado',
      proposedDeactivate: 'desativar (proposta)',
      /** Not in DESIGN_REFERENCE's mockup table (E6/DT5 never paste an invalid line) —
       *  the brief's own classification list (novo/alterado/inalterado/inválido) needs
       *  a label for `ImportPreviewRow.kind === 'invalid'`. */
      invalid: 'inválido',
    },
    importSummary: {
      new: (n: number) => `${n} novos`,
      changed: (n: number) => `${n} alterado`,
      unchanged: (n: number) => `${n} inalterados`,
      absent: (n: number) => `${n} ausente do texto colado`,
    },
    severityChanged: (from: string, to: string) => `— criticidade: ${from} → ${to}`,
    notInPastedText: '— não veio no texto colado',
    absentItemsHelper: 'Itens ausentes são apenas propostas de desativação — desmarque para manter. Apontamentos existentes guardam um retrato do item e nunca são afetados.',
    backToEditText: 'Voltar e corrigir texto',
    applyImport: (newCount: number, changedCount: number, deactivateCount: number) =>
      `Aplicar: ${newCount} novos · ${changedCount} alterado · ${deactivateCount} desativação`,

    /**
     * Additions beyond DESIGN_REFERENCE §5's microcopy table (same rationale as the
     * `visit` block's own trailing additions above) — dialogs/toasts/confirms the
     * mockups don't render a distinct frame for: user edit dialog title, generic
     * "saved" toasts for Cities/Departments/user-edit, the reset-password confirm
     * step, the Cities/Departments create/edit dialog fields (E5 never shows "+ Nova"
     * opened), Departments' own deactivate-warning copy (city-flavored text doesn't
     * fit — A-1 in MOCKUP_DIVERGENCES.md), and the catalog department-select
     * placeholder/textarea placeholder.
     */
    /** `*.list` RPC failure fallback (EmptyState + reload) for each admin tab's primary
     *  fetch — same pattern as `dashboard.loadErrorTitle`/`findings.loadErrorTitle`; no
     *  dedicated mockup copy for this state. Catalog's picker hangs off the same
     *  `departments.list` call as the Departments tab, so it reuses `departments` here
     *  rather than inventing a near-duplicate string. */
    loadErrorTitle: {
      users: 'Não foi possível carregar os usuários.',
      cities: 'Não foi possível carregar as cidades.',
      departments: 'Não foi possível carregar os departamentos.',
    },
    editUserTitle: 'Editar usuário',
    changesSavedToast: 'Alterações salvas.',
    importApplySuccessToast: 'Catálogo atualizado.',
    resetPasswordCta: 'Resetar senha',
    resetPasswordConfirmTitle: 'Resetar a senha deste usuário?',
    resetPasswordConfirmBody: 'Uma nova senha temporária será gerada; a senha atual deixa de funcionar imediatamente.',
    cityDialog: { new: 'Nova cidade', edit: 'Editar cidade', name: 'Nome', active: 'Cidade ativa' },
    departmentDialog: { new: 'Novo departamento', edit: 'Editar departamento', name: 'Nome', active: 'Departamento ativo' },
    departmentDeactivateWarning: (n: number) =>
      `O departamento tem ${n} pendências abertas. Elas continuam listáveis e podem ser encerradas; o departamento sai de novas visitas.`,
    catalogDepartmentPlaceholder: 'Selecione o departamento',
    pasteChecklistPlaceholder: 'Cole aqui as linhas copiadas do SIGA…',
  },

  toasts: {
    /** Design-system component-sheet example only — screens use their own specific toast copy. */
    exampleSaved: 'Apontamento salvo',
    saveFailed: 'Não foi possível salvar. Tente novamente.',
    retry: 'Repetir',
  },
};
