# Prompt para o Claude Design — Mockups do SAVA

> Cole o texto abaixo no Claude Design. Ele contém todo o contexto necessário; nenhuma referência externa é preciso.

---

Preciso de mockups (mobile e desktop) para o **SAVA — Sistema de Acompanhamento e Verificação Administrativa**, um web app interno usado por uma regional administrativa para acompanhar visitas administrativas semestrais às cidades.

## Contexto de uso

- A cada semestre, uma equipe regional visita cada uma das ~30 cidades. Em cada visita, ~21 departamentos (Informática, Tesouraria, Secretaria, Contabilidade etc.) verificam checklists e registram **apontamentos** (não conformidades ou ressalvas) que precisam ser acompanhados até a visita seguinte.
- O app é usado **no celular durante a visita** (registro em campo, muitas vezes com pressa, em pé) e **no desktop entre visitas** (acompanhamento, filtros, indicadores).
- **Três perfis de usuário:**
  - **Admin** — tudo o que a equipe regional faz + a área de Administração (usuários, cidades, departamentos, catálogo de itens).
  - **Equipe regional** — registra visitas, apontamentos e revisões; muda status; vê todas as cidades. Não vê a Administração.
  - **Responsável local** — somente leitura, restrito à própria cidade.
- Perfil das pessoas: adultos de todas as idades, nem todos habituados a tecnologia — a interface precisa ser **simples, direta, com letras legíveis e alvos de toque generosos**.

## Estrutura de navegação

- Seções da navegação principal por perfil:
  - **Equipe regional:** Painel · Apontamentos · Registrar visita · Indicadores
  - **Admin:** as mesmas + Administração (no mobile, pode virar item "Mais")
  - **Responsável local:** Painel · Apontamentos · Indicadores
- No celular: bottom nav. No desktop: sidebar ou topbar com as mesmas seções.
- A tela de detalhe do apontamento (tela 4) é um drill-down a partir das listas, não uma seção da navegação.
- **Chrome do app** (todas as telas): barra superior com o nome do sistema e menu do usuário mostrando nome + perfil, com ações "Alterar senha" e "Sair".

## Diretrizes visuais

- Tom: institucional, sóbrio, limpo. É uma ferramenta administrativa de uma organização religiosa — nada lúdico ou colorido demais. Azul institucional como cor primária funciona bem, mas fique à vontade para propor.
- Todo o texto da interface em **português do Brasil**.
- Semântica de cores consistente para estados: apontamento **aberto** (atenção), **em tratamento** (progresso), **resolvido** (ok), **cancelado** (neutro); criticidade **alta/média/baixa**; apontamentos **vencidos** (prazo estourado) precisam saltar aos olhos.
- **Estados de carregamento são importantes**: a plataforma (Google Apps Script) tem ~1s de latência por chamada — cada ação precisa de feedback visual imediato (spinners, skeletons, botões com estado "salvando…").
- Restrição técnica: o app roda dentro de um iframe do Google (sem controle da barra do navegador, sem deep-links bonitos). Evitar depender de gestos do navegador; toda navegação é interna ao app.
- Incluir estados vazios (ex.: "Nenhum apontamento aberto 🎉") e mensagens de erro amigáveis (toasts). Incluir também o estado de sessão expirada (volta ao login com aviso).

## Telas necessárias

**1. Login** — usuário + senha, logotipo/nome do sistema, mensagem de erro de credencial (genérica — o sistema não diz se o usuário existe). Variante: troca obrigatória de senha no primeiro acesso (senha atual, nova, confirmação). A mesma tela de troca de senha é acessível pelo menu do usuário.

**2. Painel (home)** — cartões de resumo: apontamentos abertos por cidade, por departamento, vencidos, criticidade alta em aberto, departamentos concluídos com pendência de PDF/resumo, últimas visitas registradas. Para o responsável local, a mesma tela mostra apenas a cidade dele. Botão de destaque: "Registrar visita" (só equipe regional/admin) — se já existe visita para a cidade+competência escolhida, ele **entra na visita existente** em vez de criar outra; tocar numa visita recente também reabre essa visita.

**3. Lista de apontamentos** — filtros: cidade, departamento, status, competência (ex.: 10/2025), criticidade, tipo de resposta ("Não" / "Sim, com ressalvas") + busca por texto. Cada item mostra: cidade, departamento, referência do item (ex.: 4.5), resumo do texto, criticidade, status, prazo (com alerta se vencido). No celular: cartões; no desktop: tabela.

**4. Detalhe do apontamento** — todos os dados + **linha do tempo** que mistura, em ordem cronológica e visualmente diferenciadas, (a) revisões de visita (resolvida / não resolvida / parcial, com observação, autor e data) e (b) mudanças manuais de status (ex.: cancelado, reaberto) com justificativa, autor e data. Ação "Ver/Baixar PDF": o arquivo é carregado **dentro do app** pelo servidor (pode levar alguns segundos — botão com spinner/progresso); no desktop exibe o PDF no app, no mobile dispara o download/visualizador nativo. **Não** é um link externo para o Google Drive. Ações (equipe regional/admin):
- **Editar** os campos descritivos.
- **Mudar status** — diálogo com o novo status (apenas transições permitidas) + campo de **justificativa obrigatório**.
- **Registrar revisão** — diálogo vinculado a uma visita (seletor com as visitas da cidade do apontamento) com resultado (Resolvida / Não resolvida / Parcial, como no Passo D da tela 5) + observação.

**5. Registro de visita** (a tela mais importante — fluxo de campo no celular). Importante: **cada passo é salvo no servidor assim que é concluído — não existe um "enviar" final da visita.** O fluxo pode ser interrompido e retomado a qualquer momento, inclusive por outra pessoa em outro dia.
   - **Passo A: criar ou reabrir.** Seleção de cidade, data e competência (mês/ano) com **confirmação explícita** (cidade + competência em destaque) antes de criar. Só existe **uma visita por cidade+competência**: se já houver, o app entra nela direto (sem erro, sem duplicar). Nota: admin pode excluir uma visita/departamento registrado por engano enquanto ainda não tem apontamentos nem revisões.
   - **Passo B: grade de departamentos ativos**, cada um em um de três estados visuais: **concluído** (✓), **iniciado** (em andamento) e **não iniciado**. Departamentos concluídos mas sem PDF ou sem o resumo de respostas ganham um badge "falta PDF/resumo". Qualquer departamento pode ser reaberto tocando nele — concluir não trava nada.
   - **Passo C (por departamento): participação** — representantes da regional e da cidade; data própria (opcional, quando diferente do dia principal); os 4 números do resumo de respostas (Sim / Sim com ressalvas / Não / Não aplicável) e o upload do PDF do SIGA — **ambos adiáveis** ("pode preencher/anexar depois", quando o relatório do SIGA ainda não saiu no dia).
   - **Passo D (por departamento): fila de reverificação** — lista das pendências abertas das visitas anteriores daquela cidade+departamento; para cada uma, marcar **Resolvida / Não resolvida / Parcial**. Observação: **opcional** para "Resolvida", **obrigatória** para "Parcial" e "Não resolvida" (a próxima visita precisa do contexto) — mockup com decisão em um toque + campo de observação expansível. Ao reentrar no fluxo, itens já revisados **nesta visita** aparecem com a resposta anterior pré-selecionada e editável (corrigir substitui a resposta, nunca duplica).
   - **Passo E (por departamento): apontamentos novos** — selecionar item do checklist num dropdown (referência + texto; seção e criticidade se preenchem sozinhas), tipo de resposta, considerações, prazo e responsável opcionais. Alternativa de digitação livre quando o item não está no catálogo. Se o item escolhido já tem pendência **não resolvida** nessa cidade+departamento, o app avisa e pede confirmação (o caminho certo é revisar no Passo D, não recadastrar).
   - **Passo F (por departamento): concluir** — botão "Concluir departamento" encerra o fluxo daquele departamento e volta para a grade do Passo B (que atualiza o estado para ✓).

**6. Administração** (só admin) — abas ou seções:
- **Usuários** — criar/editar/desativar/resetar senha. Campos do formulário: nome, login, perfil (admin / regional / local), cidade (apenas para perfil local), ativo. **Criar e resetar senha exibem a senha temporária gerada**, mostrada uma única vez, com botão de copiar.
- **Cidades** e **Departamentos** — CRUD simples com ativar/desativar (desativar com pendências abertas mostra aviso).
- **Catálogo de itens de checklist** — importação por colar texto: cada linha colada tem referência do item, seção, texto e criticidade. A pré-visualização é uma tabela que classifica cada linha como **novo / alterado / inalterado / ausente do texto colado**; itens ausentes aparecem como **proposta de desativação** que o admin confirma explicitamente (ou desmarca) antes de aplicar.

**7. Indicadores** — os mesmos cartões de resumo do Painel (contagens por cidade/departamento: abertos, vencidos, criticidade alta etc.), eventualmente com agrupamentos/recortes adicionais dos mesmos números, + botão "Painel completo" que abre o Looker Studio em nova aba — **botão visível apenas para equipe regional/admin; o responsável local vê somente os cartões**. As análises avançadas (taxa de resolução, recorrência, idade dos apontamentos) vivem no Looker Studio e não precisam de mockup.

## Entregáveis

- Mockups mobile (375px) de todas as telas; desktop (1280px) das telas 2, 3, 4, 6 e 7.
- Mini design system: paleta com semântica de status/criticidade, tipografia, botões (primário/secundário/perigo), inputs, selects, chips de filtro, cartões, badges de status (incluindo os 3 estados de departamento + "falta PDF/resumo"), toasts, diálogos de confirmação, estados de loading (skeleton + botão salvando) e estados vazios.
