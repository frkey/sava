# Divergências mockups × spec/brief — SAVA v1

## (c) Contradições

### C-1. Sidebar do DT1 mostra "ADMINISTRAÇÃO / Cadastros" para usuário de perfil regional — **importante**
- **Mockup:** DT1 (Painel desktop) tem a seção `ADMINISTRAÇÃO → Cadastros` na sidebar, mas o usuário do rodapé é José Almeida, papel "Equipe regional". Nos DT2/DT3 (mesma persona) a seção não existe.
- **Spec:** §4 e brief — regional **não** vê Administração; só admin.
- **Recomendação:** seguir a spec. É erro do mockup (inconsistente até internamente). Implementar a sidebar com a seção admin condicionada ao papel; o DT1 vale como referência visual do estado admin.

### C-2. Nomenclatura da área admin: "Cadastros" (desktop) × "Administração"/"Mais" (mobile) — **minor**
- **Mockup:** sidebar desktop diz "Cadastros" sob o header "ADMINISTRAÇÃO"; no mobile a tab é "Mais" e o título da página é "Administração".
- **Spec/brief:** chama a seção de "Administração" (mobile pode virar "Mais").
- **Recomendação:** adotar o padrão do mockup, mas unificar em `strings/`: título de página "Administração"; item de nav desktop também "Administração" (dispensa o header redundante) ou manter "Cadastros" — decidir uma vez, usar em todo lugar.

### C-3. Comportamento do PDF no mobile — **minor**
- **Mockup:** C3 (mobile) botão "Ver PDF do SIGA" com helper "O arquivo é carregado dentro do app…".
- **Brief:** tela 4 — no desktop exibe o PDF no app; **no mobile dispara o download/visualizador nativo**.
- **Recomendação:** seguir o brief no comportamento (buscar via `visitDepartments.downloadPdf` e entregar ao visualizador nativo no mobile); ajustar o helper para não prometer visualização embutida no celular (ex.: "O arquivo é baixado pelo app — pode levar alguns segundos.").

### C-4. Contagens rotuladas como "da competência 04/2026" — **minor**
- **Mockup:** B1 "Regional · competência 04/2026", B3 "Contagens da competência 04/2026", DT6 "Indicadores competência 04/2026" — os KPIs exibidos (47 abertos, 9 vencidos, 12 alta) são, por natureza, transversais a competências.
- **Spec:** `dashboard.summary {cityId?}` não tem parâmetro de período; "aberto/vencido" é estado atual, independente da competência de origem (§5, §8.2).
- **Recomendação:** manter a competência apenas como **contexto do semestre corrente** (útil para "cidades visitadas", "últimas visitas"), não como filtro dos KPIs de abertos/vencidos. Ajustar o rótulo (ex.: "semestre atual: 04/2026") ou aceitar a ambiguidade documentando que os KPIs são globais. Não adicionar filtro de período ao summary em v1.

## (b) Invenções sem respaldo na spec/API

### B-1. ID curto de apontamento "#A-0347" (C3) — **importante**
- **Mockup:** app bar do detalhe exibe `#A-0347` (mono).
- **Spec:** §5 — IDs são UUID v4; não existe campo de código curto.
- **Recomendação:** **adotar** — um código humano é genuinamente útil para referenciar apontamentos em reunião/e-mail (UUID é inutilizável). Adicionar coluna `code` sequencial em `Findings`, gerada no `findings.save` (create) sob o script lock, e registrar na spec. Alternativa barata: remover o ID da UI e não criar nada.

### B-2. Botão "Exportar" na lista desktop (DT2) — **importante**
- **Mockup:** botão secundário "Exportar" no topbar de Apontamentos.
- **Spec:** §7 — nenhuma ação de export existe; §10 — análises fora do app vivem no Looker (que já lê a planilha).
- **Recomendação:** seguir a spec — cortar do v1. Quem precisa exportar é regional/admin, que tem o Looker/planilha. Se voltar depois, fazer CSV client-side sobre o filtro atual (exige paginar tudo).

### B-3. KPI "82% resolvidos no semestre" no painel local (B2) — **importante**
- **Mockup:** card de métrica positiva para o responsável local.
- **Spec:** taxa de resolução é indicador do Looker (§10), que o `local` **não acessa**; `dashboard.summary` só cobre os cards listados em §8.2.
- **Recomendação:** **adotar** — é a única métrica positiva/motivacional para o local, e ele não tem outra fonte. Estender `dashboard.summary` com a taxa (revisões `resolved` ÷ revisões do semestre da cidade, ou definição equivalente — precisa ser fixada na spec). Se não quiser mexer no summary agora, substituir o card por um dos contadores já previstos.

### B-4. KPI "28/30 cidades visitadas no semestre" (DT6) — **minor**
- **Mockup:** quarto KPI de Indicadores desktop.
- **Spec:** não está entre os cards do `dashboard.summary` (§8.2).
- **Recomendação:** adotar — contagem trivial sobre `Visits` por período; incluir no `dashboard.summary`.

### B-5. Recorte "Novos × resolvidos por visita" (pill no DT6) — **minor**
- **Mockup:** terceiro pill segmentado, sem tabela correspondente mockada.
- **Spec:** "old vs. new per visit" está no Looker (§10); brief diz que Indicadores in-app são os mesmos cartões com recortes das **mesmas** contagens.
- **Recomendação:** seguir a spec — remover o pill no v1 (fica Por cidade / Por departamento). Reavaliar se houver demanda.

### B-6. Filtro "Somente vencidos" (toggle no C2) e colunas VENCIDOS — **minor**
- **Mockup:** toggle no sheet de filtros; contagens de vencidos por cidade em B3/DT6.
- **Spec:** filtros de `findings.list` = city, department, status, period, severity, response, text — **não há filtro de vencido**; vencido é derivado (deadline < hoje + não resolvido).
- **Recomendação:** adotar — acrescentar `overdue?: boolean` aos filtros de `findings.list` (cálculo server-side barato). As contagens de vencidos já são previstas no `dashboard.summary`.

### B-7. Contagem dinâmica "Aplicar filtros · 12" (C2) — **minor**
- **Mockup:** o CTA do sheet mostra o total de resultados ao vivo.
- **Spec:** ~1s de latência por RPC (§3); contar ao vivo exigiria uma chamada a cada ajuste de filtro.
- **Recomendação:** seguir a spec na prática: botão "Aplicar filtros" sem contagem (ou contagem só quando derivável dos dados já carregados). Não fazer RPC por interação de filtro.

### B-8. "carregando página 2 de 6…" no viewer de PDF (DT3) — **minor**
- **Mockup:** progresso página a página no carregamento.
- **Spec:** `visitDepartments.downloadPdf` devolve o arquivo inteiro em um base64 (§7/§9) — não há streaming por página. Progresso de página só existiria como progresso de **renderização** (pdf.js) após o download completo.
- **Recomendação:** simplificar para spinner + "carregando PDF…" (segue a spec). Se o desktop usar pdf.js embutido, o progresso de render é aceitável, mas cuidado com o peso no bundle único do GAS.

### B-9. "desativada em 2025" no card de cidade (E5) — **minor**
- **Mockup:** Engenheiro Coelho — "desativada em 2025 · histórico preservado".
- **Spec:** `Cities` = id, name, active — não existe data de desativação.
- **Recomendação:** seguir a spec — usar só "desativada · histórico preservado". (Derivar do AuditLog não vale o custo.)

### B-10. Contadores agregados espalhados (E1: 38/30/21/412; E5: abertos por cidade; B1/DT1: "14 de 21", chips "em andamento/✓ concluída") — **minor**
- **Mockup:** menus e cards com contagens que nenhuma ação retorna diretamente.
- **Spec:** `cities.list`/`departments.list`/`users.list` retornam listas completas (contagem client-side ok nesta escala); porém o total do catálogo (412) exige `checklistItems.list` **por departamento**, e status/progresso de visita ("14 de 21", concluída) exige agregação de `VisitDepartments`.
- **Recomendação:** adotar com ajustes mínimos de API: permitir `checklistItems.list` sem `departmentId` (admin) ou expor contagens no `dashboard.summary`; incluir progresso/status derivado das últimas visitas no `dashboard.summary` (já é o backing dos cards de "últimas visitas", §8.2).

### B-11. Regras de senha "mínimo de 8 caracteres · letras e números" (A3) — **minor**
- **Mockup:** checklist de requisitos na troca de senha.
- **Spec:** §6 não define política de senha.
- **Recomendação:** adotar — política razoável; codificar em `auth.changePassword` (VALIDATION) e registrar na spec para servidor e cliente validarem igual.

## (a) Itens da spec/brief ausentes dos mockups

### A-1. Tela de Departamentos (admin) — **minor**
- **Brief:** §6 — "Cidades **e Departamentos** — CRUD simples com ativar/desativar".
- **Mockup:** só Cidades (E5); DT4 tem a aba "Departamentos" mas ela nunca é mostrada.
- **Recomendação:** implementar clonando o padrão E5/DT4 (lista + toggle + aviso de pendências); não precisa de mockup novo.

### A-2. Formulário "Editar" apontamento — **minor**
- **Spec/brief:** tela 4 — ação Editar (campos descritivos). Botão existe em C3/DT3, formulário nunca aparece.
- **Recomendação:** reusar o formulário de novo apontamento (D6) pré-preenchido, sem os campos travados (status ignorado no update, §7).

### A-3. Entrada manual de item fora do catálogo — **minor**
- **Spec/brief:** Passo E — "alternativa de digitação livre". D6 tem só o link "item fora do catálogo? digitar manualmente"; o estado do formulário livre não foi desenhado.
- **Recomendação:** implementar como variação do próprio formulário (itemRef, seção, texto, criticidade editáveis); seguir a spec.

### A-4. Exclusão de visita/departamento pelo admin — **minor**
- **Spec:** §7 `visits.delete` / `visitDepartments.delete` (só sem referências); brief menciona a nota no Passo A. Nenhuma UI em nenhum artboard.
- **Recomendação:** adicionar ação discreta (menu overflow na tela da visita, visível só para admin, com confirmação). Precisa existir — é o caminho de correção previsto.

### A-5. Reabertura (resolvido/cancelado → aberto) — **minor**
- **Spec:** §5 — transição manual `resolved/cancelled → open` permitida (regional/admin). C4 só mostra o sheet a partir de "Aberto".
- **Recomendação:** mesmo sheet C4 com opções calculadas a partir do status atual (o mockup já diz "só transições permitidas" — implementar a tabela da §5 por inteiro).

### A-6. Destinos dos links "ver todas" / "todas" — **minor**
- **Mockup:** B1/DT1 têm links "ver todas (as 30)", "todas" (últimas visitas); não existe tela de lista de visitas nem de todas as cidades, e a nav (por brief) não tem seção "Visitas".
- **Recomendação:** definir destino: "ver todas as cidades" → Indicadores (tabela por cidade); "todas as visitas" → ou cortar o link no v1 ou uma lista simples via `visits.list`. Decidir antes de implementar para não criar tela órfã.

### A-7. Filtro "Tipo de resposta" ausente no desktop (DT2) — **minor**
- **Brief:** tela 3 lista tipo de resposta entre os filtros; C2 (mobile) tem, DT2 (desktop) não.
- **Recomendação:** adicionar chip "Resposta ▾" no DT2; o filtro já existe em `findings.list`.

### A-8. Paridade mobile do Painel/Indicadores — **minor**
- **Brief:** tela 2 pede abertos **por cidade e por departamento**; tela 7 pede os mesmos cartões do Painel. B1 (mobile regional) só tem "por cidade"; B3 (mobile Indicadores) não tem os KPI cards (vai direto a chips+tabela).
- **Recomendação:** aceitar a economia de espaço do mockup — "por departamento" fica no recorte de Indicadores (B3) e os KPIs ficam no Painel. Divergência consciente, ok adotar; registrar a decisão.

### A-9. Variantes do perfil local para lista/detalhe/indicadores — **minor**
- **Brief/spec:** local é read-only (sem Editar/Mudar status/Registrar revisão no detalhe; Indicadores sem botão Looker — só anotado em texto nos mockups).
- **Mockup:** só o Painel local (B2) foi desenhado; C1/C3/B3 usam persona regional.
- **Recomendação:** derivar por ocultação de ações (regra já é server-side); nenhum mockup extra necessário, mas tratar como requisito de implementação, não esquecimento.

### A-10. Campos `notes` de Visita e de VisitDepartment — **minor**
- **Spec:** §5 — `Visits.notes` e `VisitDepartments.notes` existem; D1 (criar visita) e D4 (participação) não têm campo de observações.
- **Recomendação:** seguir o mockup no v1 (formulário mais enxuto no campo) e manter as colunas vazias; ou adicionar um campo "Observações — opcional" recolhido no D4. Sem impacto de schema em qualquer caso.
---

**Adendo A-8 (2026-07-10, implementação):** mantida a decisão adotada — no mobile (B3) a tela de Indicadores NÃO exibe os cartões KPI (vão direto os pills + tabela; KPIs só no Painel). No desktop (DT6) a linha de KPIs permanece, conforme o artboard. Implementado via CSS (`.indicators-screen .kpi-grid`, breakpoint 900px).
