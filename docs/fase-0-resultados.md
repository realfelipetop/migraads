# Fase 0 · Resultados

> Testes feitos em 12/11/2026 com as contas reais do Felipe, Graph API **v26.0**, app "Meu app" em modo de desenvolvimento.
> Leitura em várias contas. **Escrita:** uma campanha de teste criada **pausada** na conta 2222222222222222 (BM Principal):
> `VENDAS - PRODUTO X - 28-06 [MIGRA TESTE]` (ID 120000000000000002). Pode ser excluída quando quiser.

## Placar das 8 perguntas

| # | Pergunta | Resultado | Status |
|---|---|---|---|
| 1 | O login com Facebook volta para `localhost`? | **Sim.** Token de usuário de ~60 dias, com todas as 5 permissões | ✅ Respondida |
| 2 | Dá para copiar imagem e vídeo direto entre contas? | **Imagem: sim** (`copy_from` funcionou). Vídeo: não testado (os 2 anúncios que precisaram eram só de imagem) | 🟡 Parcial |
| 3 | O destino aceita criativo com o ID de um post usado em outra conta? | **Sim.** 25 de 27 anúncios recriados reaproveitando o post, inclusive numa conta em que a página não aparecia como vinculada | ✅ Respondida |
| 4 | Quais campos de Advantage+ são aceitos na criação? | Público e orçamento Advantage+ e vários anunciantes: **sim**. **Recusados com erro:** pacote `standard_enhancements` e posicionamento `explore` do IG (Achado 7). **Ignorados sem erro:** melhorias de criativo e as sugestões de idade/gênero do público (Achado 11) | 🟡 Parcial |
| 5 | Conta desativada continua legível? | **Sim.** As contas CA02 (BM Loja) e CA05 (BM Antiga), ambas desativadas, listaram campanhas normalmente | ✅ Respondida |
| 6 | Proporções por posicionamento e "vários anunciantes" podem ser copiados? | Vários anunciantes: **sim**. Proporções por posicionamento: **exigem o app em modo público** (ver Achado 8) | 🟡 Parcial |
| 7 | Integração com a Utmify fora do Claude | **Sim, parcial:** API oficial de consulta (`query-api.utmify.com.br`), só com o **resumo do dashboard** filtrável por conta de anúncios, sem métricas por campanha; planos Monster/Scale/Enterprise, em beta. Não testada com chave real | 🟡 Fase 9 |
| 8 | O Gerenciador já duplica entre contas? | Não testado | ⏳ Pendente |

## Achados

### Achado 1: o conteúdo dos anúncios mora no post, não no criativo (muda a estratégia)

Na campanha **VENDAS - PRODUTO X - 28-06**, com 27 anúncios legíveis:

| Tipo | Qtd | O que a API devolve |
|---|---|---|
| Publicação existente (escolhida no Gerenciador) | 2 | `object_story_id` |
| Sem conteúdo no criativo | 14 | **Sem `object_story_spec`**. Só o `effective_object_story_id` (o post oculto que o anúncio gerou) e um `asset_feed_spec` com a configuração do botão "Ligar agora" |
| Com conteúdo completo no criativo | 11 | 3 imagem, 1 vídeo e 7 `asset_feed_spec` com várias mídias/textos |

Ou seja, **para 14 dos 27 anúncios a API não devolve texto, imagem nem vídeo no criativo**. Tudo está dentro do post oculto da página. Por outro lado, **os 27 têm o ID do post** (`effective_object_story_id`).

**Consequência:** o caminho principal do Migra Ads passa a ser **reaproveitar o ID do post** (`effective_object_story_id`) para **todos** os anúncios, não só os de "publicação existente". É o mesmo que fazer no Gerenciador "Usar publicação existente → Introduzir identificação da publicação". De quebra, mantém curtidas e comentários.

O caminho "baixar e subir de novo" (C) fica como plano B, e tem limites (Achado 3).

### Achado 2: estrutura real da campanha

- **Campanha:** `OUTCOME_SALES`, `LOWEST_COST_WITH_BID_CAP`, orçamento na campanha de R$ 182/dia, `smart_promotion_type: GUIDED_CREATION`, `advantage_state_info` (orçamento e público Advantage+ ligados, posicionamento desligado).
- **Conjunto:** `OFFSITE_CONVERSIONS` / `PURCHASE`, pixel MINHALOJA, lance R$ 40, destino `WEBSITE_AND_PHONE_CALL`, atribuição de 7 dias clique + 1 dia visualização, público Advantage+, Brasil, 18–65.
- **Anúncios:** os 27 têm melhorias Advantage+ (`degrees_of_freedom_spec` com animação de imagem, retoques, melhorias padrão e otimização de texto) e `tracking_specs` com pixel e conversão personalizada.
- Nenhum campo pedido foi recusado pela v26.0.

### Achado 3: baixar mídias não é confiável

| Com token de… | Posts ocultos legíveis | Vídeos com arquivo baixável |
|---|---|---|
| Usuário | 0 / 27 (exige permissão da página) | 1 / 13 |
| Página (Minha Loja) | 16 / 27 | 7 / 13 |

Imagens: 13 de 13 com URL. Os vídeos ficam presos à página e nem o token da página libera todos.

**Consequência:** para migrar entre contas que usam a **mesma página** (o caso principal), não precisamos baixar nada. O download só é necessário para BM → BM com página diferente, e lá o app precisa avisar quando um vídeo não puder ser copiado.

### Achado 4: anúncios excluídos não aparecem

No Gerenciador, a PRODUTO X mostra 32 anúncios. A API devolve **28**: 22 ativos, 5 pausados e 1 arquivado. Os outros 4 são **excluídos**, e a API recusa a leitura (`Não podes pedir objetos eliminados`). O app deve explicar isso na contagem.

### Achado 5: a verificação de acesso à página não é conclusiva

`act_X/promote_pages` lista a Minha Loja na conta de origem (pessoal), mas **não** nas contas da BM Principal, mesmo a página pertencendo à BM Principal e o Felipe tendo permissão ADVERTISE nela. Só o teste de escrita vai dizer se a conta de destino consegue usar a página. Até lá, o diagnóstico (§9 do plano) **não pode** reprovar uma conta só por esse sinal.

### Achado 6: contas de destino candidatas

| Conta | BM | Moeda / fuso | Pagamento | Pixel MINHALOJA |
|---|---|---|---|---|
| 2222222222222222 | BM Principal | BRL / Noronha (igual à origem) | ✔ | ✔ |
| 333333333333333 | BM Principal | BRL / **Los Angeles** | ✔ | ✔ |
| 444444444444444 | pessoal | BRL / Noronha | ✔ | ✔ |

### Achado 7: a Meta recusa na criação coisas que ela ainda aceita em campanhas antigas

Campanhas que já rodam carregam configurações que a Meta **não aceita mais em objetos novos**. O app precisa "atualizar" cada campo antes de criar:

| O que | Erro da Meta | Correção aplicada |
|---|---|---|
| Posicionamento `explore` do Instagram | `2490589`: "O posicionamento Explorar do IG foi descontinuado" | Remover de `instagram_positions` (e das regras de posicionamento) |
| Melhoria `standard_enhancements` | `3858504`: "melhorias padrão foi descontinuada" | Remover. As melhorias individuais continuam |
| Melhorias `pac_*` reaproveitando post | `1815017`: "criativo dinâmico sem conjunto de produtos" | Remover quando o criativo reaproveita o post |
| `smart_promotion_type: GUIDED_CREATION` | — | Não enviar (marca do fluxo do Gerenciador) |
| Conversão personalizada em `tracking_specs` | — | Manter só o pixel (a conversão pertence à conta de origem) |

**Consequência:** o mapper do app vira um "tradutor" com uma lista de regras versionada (`DEPRECATED_POSITIONS`, `DROPPED_FEATURES`…), coberta por testes, e cada correção aparece nos avisos da revisão.

### Achado 8: criar conteúdo novo exige o app em modo público

Para os 2 anúncios cujo post é **multi-formato** (imagem recortada por posicionamento), reaproveitar o post falha. O caminho B (copiar imagens e remontar o criativo) funcionou até a cópia das imagens, mas a criação do criativo foi recusada:

> `1885183`: "A publicação do criativo de anúncios criada por uma app em modo de programação. Tem de estar em modo público para criar este anúncio."

| Caminho | App em desenvolvimento | App em modo público (Live) |
|---|---|---|
| A · reaproveitar post | ✅ Funciona | ✅ |
| B/C · criar post novo | ❌ Recusado | A testar |

Tentativa extra: reaproveitar o post multi-formato com o pedido **mínimo** (só o ID do post, com e sem Instagram). Também foi recusado (`1815017`). Ou seja, esses posts **nunca** são reaproveitáveis pela API.

**Decisão (12/11/2026):** o modo público **não é exigido** de ninguém.
- O Migra Ads funciona com o app **em desenvolvimento**, que é o padrão. Isso cobre o caso principal (25 de 27 aqui, ~93%).
- Anúncios de post multi-formato aparecem na revisão como **"migrar manualmente"**, com o motivo e o link para o anúncio original.
- O modo público vira um **passo opcional e avançado** no guia, para quem quiser migrar também esses anúncios ou fazer BM → BM com outra página.
- Ideia para o futuro: um **app central do Migra Ads** publicado uma vez pelo autor, para que ninguém precise criar app próprio. Exige revisão da Meta e verificação do negócio, então não entra na v1.

### Achado 9: limite de chamadas da conta de anúncios

Depois de ~4 rodadas de criação seguidas, a Meta bloqueou temporariamente (`17/2446079`: "A conta de anúncios tem demasiadas chamadas da API"). Apps em modo de desenvolvimento têm o limite mais baixo. O cliente agora **espera e retoma sozinho**, usando o tempo informado pela Meta (`estimated_time_to_regain_access`).

**Consequência:** a migração real precisa de leitura em lote, criação em lote (batch API) e uma barra de progresso honesta ("aguardando a Meta liberar…").

### Achado 10: retomar sem duplicar funciona

O mesmo comando foi rodado 4 vezes. A campanha e o conjunto foram criados **uma vez só**, e cada rodada continuou de onde a anterior parou, graças ao mapa origem → destino em `spike/data/runs/`.

### Achado 11: conferência do que foi criado (lendo o destino de volta)

| Item | Origem | Destino | |
|---|---|---|---|
| Campanha | R$ 182/dia, bid cap, orçamento e público Advantage+ | Igual, **pausada** | ✅ |
| Conjunto | Lance R$ 40, pixel/PURCHASE, 7d clique + 1d visualização, `WEBSITE_AND_PHONE_CALL` | Igual, **pausado** | ✅ |
| Posicionamentos | Com `explore` | Sem `explore` (descontinuado) | ⚠️ esperado |
| Público Advantage+ | `individual_setting` (sugestões de idade e gênero) | **Sumiu**, a Meta ignorou | ⚠️ |
| Anúncios | 27 | 25 (os 2 multi-formato dependem do Achado 8) | ⚠️ |
| Prova social | — | **25/25 usam o mesmo post da origem** | ✅ |
| Status | — | 25 em análise (`PENDING_REVIEW`), todos pausados | ✅ esperado |
| Melhorias de criativo | animação, retoques, texto **ligados** | **80 opções, todas desligadas**, mesmo enviando ligadas | ❌ |

**A Meta aceita o pedido, mas descarta parte dele sem avisar.** Por isso o app precisa **ler de volta** o que criou e comparar com a origem, mostrando no relatório o que não passou (ex.: "melhorias Advantage+ ficaram desligadas: ligue no Gerenciador se quiser"). Vale testar de novo com o app em modo público: pode ser outra restrição do modo de desenvolvimento.

## Mudanças no plano

1. Caminho A passa a ser **"reaproveitar o post pelo ID"** para todo anúncio que tenha `effective_object_story_id`.
2. O diagnóstico de página vira **aviso**, não bloqueio, até o teste de escrita confirmar o comportamento.
3. A contagem do Explorador separa "excluídos (não migráveis)".
4. O download de mídias usa o **token da página** quando disponível, e o relatório lista vídeos não copiáveis.
5. Mapper com **regras de atualização de campos** (Achado 7), versionadas e testadas.
6. App em **modo de desenvolvimento** é o padrão e basta para o caso principal. A revisão marca como "migrar manualmente" os anúncios que exigiriam modo público. O modo público fica como passo **opcional** no guia (Achado 8).
7. Criação em lote e espera automática por limite de chamadas (Achado 9).
8. **Conferência pós-migração**: ler de volta o que foi criado, comparar campo a campo com a origem e listar no relatório o que a Meta descartou (Achado 11).

## O que falta na Fase 0

- [ ] *(Opcional, só se algum dia alguém publicar o app)* Testar o caminho B e as melhorias de criativo em modo público
- [ ] Testar cópia de **vídeo** entre contas
- [ ] Pergunta 7 (Utmify) e pergunta 8 (Gerenciador)
