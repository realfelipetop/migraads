# Migra Ads — contexto para o Claude Code

App local (Next.js 16 + SQLite) que migra campanhas da Meta entre contas de anúncios. Interface e textos em **português do Brasil**. Leia também `AGENTS.md` (regras do Next.js 16) e `PLANO_DE_IMPLEMENTACAO.md`.

## Comandos

- `npm run check`: lint + tipos + testes (rode antes de terminar qualquer mudança)
- `npm run smoke`: sobe o app de verdade (`scripts/start.mjs`) e confere as telas
- `npm run dev`: desenvolvimento em `127.0.0.1:3000`
- `npm run db:generate`: gera migração SQL depois de mudar `src/db/schema.ts`. **Confira o SQL gerado**: o drizzle-kit já gerou um INSERT copiando coluna inexistente (ver `drizzle/0001_*.sql`).

## Mapa do código

- `src/meta/`: cliente da Graph API (`graph.ts`: remove campos inexistentes, espera limite de chamadas), conexão e token criptografado (`store.ts`), login OAuth (`auth.ts`), contas (`accounts.ts`), Explorador (`explorer.ts`), métricas (`metrics.ts`), erros em português (`errors.ts`)
- `src/migration/`: o motor
  - `mapper.ts`: tradutor origem → destino, com as regras da Fase 0 (o que a Meta recusa na criação), mapeamentos e moeda. **Funções puras, com testes.**
  - `snapshot.ts`: cópia da origem; a migração usa o snapshot, não a origem ao vivo
  - `precheck.ts`: diagnóstico do destino (§9) e necessidades de mapeamento
  - `planner.ts`: plano (simulação) → `migration_items`, um conjunto por cópia
  - `executor.ts`: cria em ordem, usa `id_map` por migração (retomar não duplica) e **adota** objetos criados na Meta mas não registrados
  - `events.ts`: progresso em tempo real (SSE)
- `src/backup/`: backup automático (agendador ligado em `src/instrumentation.ts`)
- `src/integrations/utmify.ts`: API oficial de consulta da Utmify (só resumo)
- `src/lib/selection.ts`: seleção em cascata do Explorador
- `spike/`: scripts da Fase 0 (validação da API). Projeto separado; não é usado pelo app.

## Regras do projeto

1. **SQLite é síncrono:** em Server Components e rotas, chame `await connection()` (de `next/server`) ANTES de ler o banco, senão a consulta roda no build e o dado fica congelado. Partes que leem dados da requisição ficam dentro de `<Suspense>` (Cache Components).
2. **Nunca** mande token, chave secreta do app ou chave da Utmify para o navegador, logs ou mensagens de erro. Use `getConnectionStatus()` para mostrar estado.
3. **Escritas na Meta só pelo executor**, sempre a partir de um plano revisado pelo usuário, e **pausadas por padrão**. Testes automáticos nunca escrevem na Meta (use os fakes de `executor.test.ts`).
4. Regra nova da Meta descoberta (campo recusado/ignorado)? Coloque no `mapper.ts` (ex.: `DEPRECATED_POSITIONS`, `DROPPED_FEATURES`) com teste e aviso na revisão, e registre em `docs/fase-0-resultados.md`.
5. O que não dá para migrar vira **"migrar manualmente"** com motivo e link. Não exija configuração extra do usuário (ex.: publicar o app) para casos raros.
6. Nada de dados reais (IDs de contas, pixels, nomes de clientes) em testes ou docs: use valores fictícios.
7. O app precisa funcionar em **macOS, Windows e Linux** (o CI roda nos três).
8. `src/proxy.ts` recusa qualquer Host que não seja localhost (proteção contra DNS rebinding). Não remova.
