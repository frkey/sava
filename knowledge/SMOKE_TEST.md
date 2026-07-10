# Checklist de smoke test — ambiente dev

Checklist manual para validar o backend do SAVA no ambiente **dev**. Rode após todo `npm run deploy:dev`,
antes de promover qualquer mudança para prod (gate do spec §13: vitest verde + este checklist passado).

**Como executar:** as seções 1–7 foram escritas na era do Plano 1 (só servidor) e chamam
`google.script.run.api({token, action, payload})` pelo console do navegador na página `/exec` — elas
continuam válidas como verificação de baixo nível. Com o cliente do Plano 2 pronto, a **§8** mapeia cada
fluxo para seu equivalente clicável na UI: prefira a UI no dia a dia e reserve o console para a §5
(verificações negativas de segurança, sem equivalente de UI). Os resultados esperados (mensagens, códigos
de erro, campos) valem para os dois caminhos.

Execute as seções **em ordem** (1 → 7): elas reaproveitam o estado umas das outras (usuário, cidade,
visita, apontamentos criados ao longo do checklist).

## Preparação

1. **Planilha e pastas do Drive do ambiente dev** já criadas e os Script Properties do projeto dev
   (`SPREADSHEET_ID`, `PDF_FOLDER_ID`, `BACKUP_FOLDER_ID`, `ENV=dev`) configurados — ver `README.md`.
2. `npm run deploy:dev` rodado (push mais recente no editor do projeto SAVA-dev).
3. No editor do Apps Script (projeto SAVA-dev): **Implantar → Implantações de teste** → copie a URL
   web app (termina em `/exec`). Implantações de teste sempre rodam o código salvo mais recente — não
   precisa criar uma nova versão a cada teste.
4. Abra essa URL `/exec` no navegador (funciona até deslogado — o manifesto usa
   `access: ANYONE_ANONYMOUS`) e abra o console DevTools nela.
5. **Selecione o frame correto no DevTools Console:** SAVA roda dentro de um iframe aninhado
   (`*.googleusercontent.com`), e `google.script.run` existe **apenas** nesse frame. Sem selecioná-lo
   primeiro, colar um comando com `google.script.run` lança `ReferenceError`. No Chrome DevTools:
   clique no dropdown de frame no Console (padrão diz "top"), procure e selecione o frame que começa
   com `*.googleusercontent.com` (costuma ter o título "My Gadget" ou similar). Se `google.script.run`
   continua undefined após a seleção, o frame errado está ativo — escolha outro. Confirme digitando
   `google.script.run` no console — deve devolver a função sem erro.
6. Cole o helper abaixo no console — ele é reaproveitado em todas as seções (`token` fica de fora
   porque muda ao longo do checklist):

   ```js
   function rpc(action, payload, token) {
     return new Promise((resolve, reject) => {
       google.script.run
         .withSuccessHandler(resolve)
         .withFailureHandler(reject)
         .api({ token, action, payload });
     });
   }
   ```

   Toda chamada abaixo é `await rpc('acao', { ...payload }, token)`. Resultado esperado "envelope
   `{ok:false, error:{code:...}}`" significa que a Promise **resolve** (não rejeita) com esse objeto —
   `api()` sempre devolve um envelope, nunca lança para o chamador do RPC.

---

## 1. `setup()` — criação de abas, seed de departamentos e admin

- [ ] **1.1** No editor do Apps Script (projeto dev), selecione a função `setup` no dropdown de funções
      e clique em **Executar**.
      → Sem erros na execução; abra **Execuções** (ou o log de execução) e confirme a linha
      `Senha temporária do admin: XXX-9999` (formato tipo `Kxq-4729` — 3 letras, hífen, 4 dígitos).
      Anote essa senha, ela é usada na seção 2.
- [ ] **1.2** Abra a planilha (`SPREADSHEET_ID`). Confirme que existem exatamente 10 abas:
      `Cities`, `Departments`, `ChecklistItems`, `Users`, `Sessions`, `Visits`, `VisitDepartments`,
      `Findings`, `FindingReviews`, `AuditLog` — cada uma com cabeçalho na linha 1.
- [ ] **1.3** Aba `Departments`: confirme **21 linhas** de dados (Anciães Verificação, Atividade
      Voluntária, Ativo Imobilizado, CNS, Compras, Conselho Fiscal, Contabilidade, Distribuidora,
      Engenharia, Fundo Musical, Informática, Jurídico, Jurídico LGPD, Manutenção Preventiva,
      Patrimônio Bens Imóveis, Piedade, Presidência, Saúde e Segurança, Secretaria, Tesouraria,
      Treinamento e Integração), todas `active=TRUE`.
- [ ] **1.4** Aba `Users`: confirme **1 linha**: `login=sava.admin`, `role=admin`,
      `mustChangePassword=TRUE`, `passwordHash`/`salt` preenchidos (não vazios), `failedAttempts=0`.
- [ ] **1.5** No editor, abra **Acionadores** (relógio na barra lateral): confirme 2 gatilhos instalados
      — `purgeSessions` (baseado em tempo, todos os dias) e `weeklyBackup` (baseado em tempo, toda
      semana).
- [ ] **1.6 — idempotência:** rode `setup()` de novo (mesma função, mesmo botão Executar).
      → Nenhuma linha nova de log `Senha temporária...` (o bloco só roda quando `Users` está vazio).
      `Departments` continua com 21 linhas (não 42). `Users` continua com 1 linha. `Acionadores`
      continua com exatamente 2 entradas (não 4).

## 2. Login: tentativas erradas, bloqueio, reset, troca de senha obrigatória

Use o helper `rpc()` da Preparação. Sem `token` (login é ação `public`).

- [ ] **2.1** Rode 5x seguidas: `await rpc('auth.login', {login:'sava.admin', password:'senha-errada'})`.
      → Nas 5 tentativas, a mesma resposta genérica:
      `{ok:false, error:{code:'UNAUTHORIZED', message:'Usuário ou senha inválidos. Após tentativas
      repetidas, aguarde 15 minutos.'}}`. A mensagem não muda entre a 1ª e a 5ª tentativa (não revela
      quantas tentativas restam nem se o usuário existe).
- [ ] **2.2** 6ª tentativa, agora com a senha temporária **correta** da seção 1.1:
      `await rpc('auth.login', {login:'sava.admin', password:'<temp da 1.1>'})`.
      → Ainda `{ok:false, error:{code:'UNAUTHORIZED', ...}}` — mesma mensagem genérica (conta bloqueada
      por 15 minutos; a senha certa não desbloqueia antes do prazo).
- [ ] **2.3 — reset manual (única saída quando o único admin está bloqueado):** na planilha, aba
      `Users`, linha do `sava.admin`: apague o valor da célula `lockedUntil` e zere `failedAttempts`.
      (Não há como chamar `users.resetPassword` aqui — exige sessão de admin, e o único admin está
      bloqueado.)
- [ ] **2.4** Repita o login com a senha temporária correta.
      → `{ok:true, data:{token:'...', user:{login:'sava.admin', role:'admin',
      mustChangePassword:true, ...}}}`. Guarde o `token`.
- [ ] **2.5 — gate de troca de senha obrigatória:** com esse `token`, chame qualquer ação fora da
      allowlist, ex.: `await rpc('dashboard.summary', {}, token)`.
      → `{ok:false, error:{code:'FORBIDDEN', message:'Troque sua senha para continuar.'}}`.
      Confirme que a allowlist funciona: `await rpc('auth.me', undefined, token)` →
      `{ok:true, data:{...}}` (permitido mesmo com `mustChangePassword=true`).
- [ ] **2.6** Troque a senha: `await rpc('auth.changePassword', {currentPassword:'<temp>',
      newPassword:'SavaAdmin2026'}, token)` (política: mín. 8 caracteres, ≥1 letra, ≥1 dígito).
      → `{ok:true, data: undefined}` (ou `null`, ação não retorna corpo).
- [ ] **2.7** Confirme que o `token` antigo foi revogado: `await rpc('auth.me', undefined, token)`
      → `{ok:false, error:{code:'UNAUTHORIZED', message:'Sessão expirada. Entre novamente.'}}`
      (troca de senha derruba todas as sessões do usuário).
- [ ] **2.8** Login de novo com a senha nova: `await rpc('auth.login', {login:'sava.admin',
      password:'SavaAdmin2026'})` → `{ok:true, data:{token:'...', user:{mustChangePassword:false}}}`.
      Guarde este `token` — é o usado no resto do checklist (referido como `adminToken` abaixo).

## 3. Ciclo de vida de visita, participação por departamento, fila de revisão, apontamentos

> Nota: os pontos do spec que na UI futura viram diálogo de confirmação ou selo visual ("confirm
> dialog", "badge") ainda não existem (Plano 2). Aqui validamos o comportamento do servidor que os
> sustenta — o resultado da chamada RPC é o que a UI vai exibir/confirmar.

- [ ] **3.1** Crie uma cidade: `await rpc('cities.save', {city:{name:'Cidade Teste'}}, adminToken)`
      → `{ok:true, data:{id:'<cityId>', name:'Cidade Teste', active:true}}`. Guarde `cityId`.
- [ ] **3.2** Crie uma visita: `await rpc('visits.save', {visit:{cityId, period:'04/2026',
      mainDate:'2026-04-10'}}, adminToken)` → `{ok:true, data:{id:'<visitId>', ...}}`. Guarde
      `visitAId`.
- [ ] **3.3 — duplicidade (cidade, competência):** repita a mesma chamada (`cityId` +
      `period:'04/2026'`) → `{ok:false, error:{code:'CONFLICT', message:'Já existe uma visita desta
      cidade nesta competência.', details:{existingVisitId:'<visitAId>'}}}`.
- [ ] **3.4 — participação por departamento (upsert):** pegue um `departmentId` da aba `Departments`
      (seção 1.3). `await rpc('visitDepartments.save', {visitDepartment:{visitId:visitAId,
      departmentId}}, adminToken)` → cria (`{ok:true, data:{id:'<vdAId>', ...}}`). Rode de novo com o
      mesmo `visitId`+`departmentId` mas com um campo a mais, ex. `countYes:5` → atualiza o **mesmo**
      registro (mesmo `id`), não cria um segundo.
- [ ] **3.5** Crie um apontamento nesse departamento: `await rpc('findings.save', {finding:{
      visitDepartmentId:vdAId, itemRef:'1.1', itemText:'Item de teste', severity:'high',
      response:'no'}}, adminToken)` → `{ok:true, data:{id:'<findingId1>', code:'A-0001',
      status:'open', ...}}`.
- [ ] **3.6 — apontamento duplicado (mesmo itemRef, aberto):** repita a chamada 3.5 com o mesmo
      `itemRef:'1.1'` → `{ok:false, error:{code:'CONFLICT', message:'Já existe um apontamento em
      aberto para este item.', details:{existingFindingId:'<findingId1>'}}}`. Repita adicionando
      `force:true` no payload de `findings.save` (payload `{finding:{...}, force:true}`) → agora cria
      mesmo com duplicidade (`{ok:true, data:{id:'<findingId2>', code:'A-0002', ...}}`).
- [ ] **3.7 — nova visita (carry-over):** crie uma 2ª visita da mesma cidade, competência diferente:
      `await rpc('visits.save', {visit:{cityId, period:'10/2026', mainDate:'2026-10-05'}},
      adminToken)` → `visitBId`. Crie a participação do mesmo departamento nela:
      `await rpc('visitDepartments.save', {visitDepartment:{visitId:visitBId, departmentId}},
      adminToken)` → `vdBId`.
- [ ] **3.8 — fila de revisão traz apontamento em aberto da visita anterior:**
      `await rpc('findings.reviewQueue', {visitId:visitBId, departmentId}, adminToken)` →
      `{ok:true, data:[...]}` contendo `findingId1` e `findingId2` (ambos `open`, criados na visita A,
      logo entram na fila da visita B).
- [ ] **3.9** Revise um apontamento como resolvido: `await rpc('findingReviews.save',
      {findingId:findingId1, visitId:visitBId, result:'resolved'}, adminToken)` → `{ok:true,
      data:{id:'<reviewId>', result:'resolved', ...}}`. Confirme via `findings.get`
      (`await rpc('findings.get', {id:findingId1}, adminToken)`) que `status` virou `resolved`.
- [ ] **3.10 — correção de uma revisão:** rode `findingReviews.save` de novo para o **mesmo**
      `findingId1`+`visitBId`, agora `result:'not_resolved'` com `notes:'Reaberto por engano na
      revisão anterior'` (obrigatório para `not_resolved`/`partial`) → `{ok:true, data:{id:'<mesmo
      reviewId>', result:'not_resolved', ...}}` (mesmo `id` — corrige em vez de duplicar linha na aba
      `FindingReviews`). Confirme via `findings.get` que `status` voltou para `open`.
- [ ] **3.11 — markDone:** `await rpc('visitDepartments.markDone', {id:vdBId}, adminToken)` →
      `{ok:true, data:{id:vdBId, completedAt:'<iso>', completedBy:'<adminUserId>', ...}}`.
- [ ] **3.12 — selo de PDF/contagens faltando:** `vdBId` está `completed` mas sem `pdfFileId` nem
      `countYes` — isso é o dado que sustenta o selo visual da UI futura. Confirme no `dashboard.summary`
      (seção 6) que `completedMissingPdfOrCounts ≥ 1` e que a entrada de `visitBId` em `latestVisits`
      tem `missingPdfOrCounts ≥ 1`.

## 4. Upload e download de PDF

- [ ] **4.1** Gere um PDF de referência de ~100 KB (qualquer PDF real de ~100 KB serve; um PDF
      pequeno com algumas páginas de imagem já passa disso). No console da página `/exec`, converta
      para base64 sem sair da página:
      ```js
      const input = document.createElement('input');
      input.type = 'file'; document.body.appendChild(input); input.click();
      // selecione o PDF na janela que abrir, depois rode:
      const file = input.files[0];
      const buf = await file.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      ```
- [ ] **4.2** `await rpc('visitDepartments.uploadPdf', {id:vdBId, fileName:'relatorio.pdf',
      base64:pdfBase64}, adminToken)` → `{ok:true, data:{id:vdBId, pdfFileId:'<id>',
      pdfUrl:'https://drive.google.com/...', ...}}`.
- [ ] **4.3** No Drive, abra a pasta `PDF_FOLDER_ID` → confirme a árvore
      `pdfs/2026-10/Cidade Teste/<NomeDoDepartamento>.pdf` (o nome do arquivo salvo é sempre
      `<departamento>.pdf` — o `fileName` enviado no payload é ignorado para o nome final; o token de
      pasta `2026-10` vem da competência `10/2026` da visita B).
- [ ] **4.4 — download como `local` da própria cidade:** crie um usuário local dessa cidade:
      `await rpc('users.save', {user:{name:'Fulano Local', login:'fulano.local', role:'local',
      cityId}}, adminToken)` → guarde `tempPassword` retornado. Login:
      `await rpc('auth.login', {login:'fulano.local', password:'<tempPassword>'})` → guarde `token`
      dele. Troque a senha (obrigatório antes de qualquer outra ação, igual seção 2.5–2.8):
      `await rpc('auth.changePassword', {currentPassword:'<tempPassword>',
      newPassword:'Fulano2026'}, tokenAntigoDoLocal)`, depois login de novo com a senha nova →
      `localToken`.
      `await rpc('visitDepartments.downloadPdf', {visitDepartmentId:vdBId}, localToken)` →
      `{ok:true, data:{fileName:'<departamento>.pdf', base64:'...'}}` (mesmo conteúdo do upload).
- [ ] **4.5 — download bloqueado para outra cidade:** crie uma 2ª cidade e um usuário local dela
      (mesma sequência do 4.4: `cities.save`, `users.save` com `role:'local'` e o novo `cityId`,
      login, troca de senha, login de novo). Com o `token` desse 2º local:
      `await rpc('visitDepartments.downloadPdf', {visitDepartmentId:vdBId}, localToken2)` →
      `{ok:false, error:{code:'FORBIDDEN', message:'Acesso restrito à sua cidade.'}}`.

## 5. Chamadas RPC negativas (spec §13/§3)

Estas duas confirmam a defesa em duas camadas descrita no spec: `setup()` e as funções de serviço
internas (ex. `validateSession`) não são superfície pública, mesmo sendo tecnicamente alcançáveis por
qualquer chamador anônimo via `google.script.run` (a plataforma permite chamar **qualquer** função
global do projeto).

- [ ] **5.1** No console da página `/exec` (não precisa estar logado no SAVA nem no Google):
      ```js
      google.script.run
        .withSuccessHandler(r => console.log('OK', r))
        .withFailureHandler(e => console.error('FAIL', e.message))
        .validateSession('qualquer-token');
      ```
      → cai no `withFailureHandler` com um erro tipo *"Script function not found: validateSession"*.
      `validateSession` é uma função de serviço interna — o build (`src/server/gas/main.ts`) só expõe
      `doGet`, `api`, `setup`, `purgeSessions` e `weeklyBackup` no escopo global; nada mais é alcançável
      por nome.
- [ ] **5.2** No mesmo console:
      ```js
      google.script.run
        .withSuccessHandler(r => console.log('OK', r))
        .withFailureHandler(e => console.error('FAIL', e.message))
        .setup();
      ```
      → cai no `withFailureHandler`, mensagem contendo `setup/triggers: owner context required`.
      Diferente do 5.1: `setup` **é** global (o editor precisa chamá-la), mas o guard
      `assertOwnerContext()` barra a execução — numa implantação `ANYONE_ANONYMOUS`,
      `Session.getActiveUser().getEmail()` sempre volta vazio para quem chega pela web, então
      `active !== effective` mesmo que o navegador esteja logado com a conta institucional dona do
      projeto. `setup()` só roda pelo menu Executar do editor (seção 1) ou por um gatilho instalável.
- [ ] **5.3 (reforço):** confirme que a via legítima (`api`) tem sua própria defesa, mesmo sem tocar
      no guard acima: `await rpc('dashboard.summary', {}, undefined)` (sem token) →
      `{ok:false, error:{code:'UNAUTHORIZED', message:'Sessão inválida. Entre novamente.'}}` — aqui a
      Promise **resolve** com o envelope de erro (passou pelo dispatcher), diferente de 5.1/5.2 onde a
      chamada nem chega a existir/é barrada antes do dispatcher.

## 6. Números do dashboard batem com os dados semeados

- [ ] **6.1** `await rpc('dashboard.summary', {}, adminToken)` (sem `cityId` = visão regional
      completa) → `{ok:true, data:{openByCity, openByDepartment, overdue, highSeverityOpen,
      completedMissingPdfOrCounts, citiesVisitedInSemester, latestVisits, resolutionRateSemester}}`.
- [ ] **6.2** Confira à mão contra a aba `Findings`: conte manualmente as linhas com
      `status ∈ {open, in_treatment}` (não resolvidos) — a soma dos `open` em `openByCity` (ou em
      `openByDepartment`) deve bater com essa contagem. Depois dos passos 3.5–3.10, a aba deve ter:
      `findingId1` com `status=open` (reaberto na correção 3.10) e `findingId2` com `status=open`
      (nunca revisado) — 2 não resolvidos.
- [ ] **6.3** Confira `highSeverityOpen`: conte manualmente quantos dos não resolvidos têm
      `severity=high` (ambos os apontamentos de teste foram criados com `severity:'high'` no 3.5/3.6,
      então `highSeverityOpen ≥ 2`).
- [ ] **6.4** Confira `overdue`: nenhum apontamento de teste tem `deadline` preenchido, então eles não
      contam — `overdue` deve refletir só apontamentos com `deadline < hoje` (nenhum, se a planilha
      só tem os dados deste checklist).
- [ ] **6.5** Confira `completedMissingPdfOrCounts`: conte manualmente linhas de `VisitDepartments`
      com `completedAt` preenchido **e** (`pdfFileId` vazio **ou** `countYes` vazio). `vdAId` tem
      `countYes` preenchido (3.4) mas não foi marcado `completedAt` — não conta. `vdBId` foi marcado
      `completedAt` (3.11) e recebeu PDF (4.2) mas nunca recebeu `countYes` — conta 1.
- [ ] **6.6 — escopo por cidade:** `await rpc('dashboard.summary', {cityId:cityIdDaCidadeTeste},
      adminToken)` → só considera a Cidade Teste. Compare com a chamada feita pelo usuário `local`
      dessa cidade (`await rpc('dashboard.summary', {}, localToken)`, sem `cityId` no payload) —
      os dois devem bater, porque o servidor força `cityId = ctx.user.cityId` para `role=local`
      independentemente do que vier no payload.

## 7. Backup semanal

- [ ] **7.1** No editor do Apps Script, selecione `weeklyBackup` no dropdown e clique em **Executar**.
      → Sem erros. Na pasta `BACKUP_FOLDER_ID`, confirme um arquivo novo chamado
      `SAVA-DB-backup-<yyyy-MM-dd>` (data de hoje, fuso America/Sao_Paulo) — é uma cópia completa da
      planilha (abra e confirme que as abas/dados da seção 1–6 estão lá).
- [ ] **7.2 — retenção ≤ 8:** rode `weeklyBackup` mais 8 vezes seguidas pelo mesmo menu Executar
      (total de pelo menos 9 execuções). → Na pasta de backups, o número de arquivos com prefixo
      `SAVA-DB-backup-` nunca passa de 8 — os mais antigos (por nome, que embute a data) são movidos
      para a lixeira a cada execução que excede o limite.
- [ ] **7.3** Confira em **Acionadores** que `weeklyBackup` está instalado como gatilho baseado em
      tempo, periodicidade semanal (criado pelo `setup()` na seção 1.5 — não precisa recriar).

---

## 8. Verificação via interface

O Plano 2 entregou o cliente React (`src/client/`) — as seções acima descrevem o comportamento do
servidor chamando `google.script.run.api(...)` direto pelo console porque, no Plano 1, não havia UI
para clicar. Com o cliente pronto, a maior parte das seções 2–6 pode (e deve, num smoke test contra
um ambiente real) ser refeita clicando na tela em vez de colar RPCs — os resultados esperados
(mensagens, campos, badges) são os mesmos, só o caminho para chegar até eles muda. A tabela abaixo
mapeia cada fluxo de RPC ao seu equivalente na UI; o **§5 (chamadas RPC negativas) continua sendo
feito pelo console como está** — valida uma defesa de plataforma (`google.script.run` alcança
qualquer função global) que não tem equivalente clicável.

| Fluxo (seção RPC) | Onde na UI |
|---|---|
| 2.1–2.2 login errado / bloqueio | Tela de login (`/exec`) — usuário + senha errados, botão **Entrar**; a mensagem genérica aparece num banner acima do formulário, os dois campos ficam com borda de erro. |
| 2.3 reset manual (admin único bloqueado) | Sem equivalente de UI — segue via planilha (`Users`, apagar `lockedUntil`/zerar `failedAttempts`), como descrito. |
| 2.5 gate de troca de senha obrigatória | Login com um usuário `mustChangePassword=true` já leva direto à tela **Crie sua nova senha** (nenhuma outra tela é alcançável antes de trocar). |
| 2.6–2.8 troca de senha, revogação de sessão, novo login | Tela **Crie sua nova senha** (senha atual + nova + confirmação) → toast "Senha alterada com sucesso" → a própria tela reloga silenciosamente com a senha nova e cai no Painel (a revogação do token antigo é interna, não há um passo a mais para clicar). |
| 3.1 criar cidade | **Cadastros → Cidades → + Nova**. |
| 3.2–3.3 criar visita / duplicidade (reopen) | **Registrar visita** (D1: cidade + competência + data) → diálogo de confirmação (D2) → **Criar visita**; repetir com a mesma cidade+competência reabre a visita existente em vez de duplicar, sem erro visível. |
| 3.4 participação por departamento (upsert) | Dentro da visita, abrir um departamento na grade (D3) → aba **1 · Participação** → preencher contadores/representantes → **Salvar e ir para reverificação**; reabrir o mesmo departamento mostra os valores já salvos (mesmo registro, não duplicado). |
| 3.5–3.6 apontamento novo / duplicado (CONFLICT + force) | Aba **3 · Novos** → **+ Adicionar apontamento** → escolher item do catálogo → **+ Adicionar apontamento** (salva); repetir com o mesmo item mostra o banner de duplicidade com **Ir para a revisão** / **Registrar mesmo assim** (o segundo cria com `force`). |
| 3.7–3.8 nova visita (carry-over) / fila de revisão | Registrar uma 2ª visita da mesma cidade em outra competência e abrir o mesmo departamento → aba **2 · Reverificação** já vem populada com os apontamentos em aberto herdados da visita anterior. |
| 3.9–3.10 revisar apontamento / corrigir revisão | Na fila de reverificação, escolher **Resolvida/Não resolvida/Parcial** (+ observação quando exigida) → **Salvar decisão**; escolher outra opção para o mesmo item e salvar de novo corrige a mesma revisão (visível também em **Apontamentos → detalhe → linha do tempo**, ou via **Registrar revisão** no detalhe do apontamento, que também faz upsert por visita). |
| 3.11 markDone | Aba **3 · Novos** → **✓ Concluir departamento**; a grade (D3) volta a mostrar o card com ✓ e a contagem "N novos". |
| 3.12 selo de PDF/contagens faltando | Card do departamento concluído sem PDF/contagens mostra o selo ("falta PDF"/"falta resumo") na grade; o mesmo dado aparece em **Painel** ("deptos. concluídos sem PDF/resumo") e no card da visita em "Últimas visitas". |
| 4.1–4.3 upload de PDF | Aba **1 · Participação** → seção "PDF do SIGA" → clicar/soltar o arquivo; o card vira "PDF anexado ✓ · Substituir PDF" ao concluir o upload. |
| 4.4–4.5 download / bloqueio por cidade | **Apontamentos → detalhe do apontamento → Ver PDF do SIGA** (abre num visualizador embutido em desktop, com botão **Baixar**; em mobile baixa direto). Logado como `local` de outra cidade, o apontamento nem aparece na lista (filtro por cidade é forçado no servidor) — não há um botão visível para clicar e receber o FORBIDDEN. |
| 5.1–5.3 chamadas RPC negativas | **Sem equivalente de UI — continuam exatamente como descrito**, pelo console na página `/exec`. |
| 6.1–6.6 números do dashboard | **Painel** (KPIs + "Abertos por cidade" + "Últimas visitas") e **Indicadores** (mesmos KPIs + pills "Por cidade"/"Por departamento", clicáveis para abrir Apontamentos já filtrado). Conferir à mão contra a aba `Findings` continua sendo a forma de validar os números, só a leitura do resultado agora é na tela em vez do `console.log` do RPC. |

Vale registrar duas observações de uma passada de verificação via UI (Plano 2, Task 10) que não têm
seção própria acima:

- **Cidade desativada + KPI "apontamentos abertos" inconsistente:** desativar uma cidade com
  apontamentos em aberto (**Cadastros → Cidades**, confirmar "Desativar assim mesmo") faz o KPI
  "apontamentos abertos" (Painel/Indicadores) da visão daquela cidade cair para 0 e ela some da
  lista "Abertos por cidade" — mas "vencidos" e "criticidade alta em aberto" continuam contando
  normalmente os mesmos apontamentos, e eles continuam listáveis em **Apontamentos**. A causa é
  `src/server/services/dashboard.ts#dashboardSummary` (mirrored em
  `src/client/lib/mock/server.ts`): `citiesInScope` filtra por `city.active` mesmo no caso
  `singleCityScope` (usuário `local` da própria cidade, ou `cityId` explícito no payload), então
  `openByCity` fica vazio para uma cidade inativa e o KPI "abertos" (que soma `openByCity`) zera,
  enquanto `overdue`/`highSeverityOpen` são computados de `unresolved` sem esse filtro. Contradiz a
  cópia do próprio aviso de desativação ("Elas continuam listáveis e podem ser encerradas") — os
  apontamentos deveriam continuar contando em "abertos" também. Correção é server-side (Plano 1),
  fora do escopo desta task; não aplicada aqui.
- **Estados de erro (Indicadores/Painel/Apontamentos):** o padrão EmptyState + "Repetir" está
  presente em todas as telas que dependem de uma chamada primária (`Dashboard.tsx`,
  `Findings.tsx`, `FindingDetail.tsx`, `Indicators.tsx`, `Visit.tsx`), confirmado por leitura de
  código; não foi disparado ao vivo no navegador porque o mock de dev (`lib/mock/server.ts`) não
  tem um interruptor de "falhar a próxima chamada" e simular a falha exigiria alterar código
  temporariamente. Considerar adicionar esse hook ao mock se testes de erro via UI passarem a ser
  rotina.

---

Ao final, se todas as caixas acima estiverem marcadas: `npm run test && npm run typecheck` verdes
localmente + este checklist passado = liberado para `npm run deploy:prod`.
