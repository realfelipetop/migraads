# Como contribuir

Obrigado por querer ajudar o Migra Ads!

## Antes de começar

- Abra uma **issue** contando o problema ou a ideia antes de um PR grande.
- A interface e as mensagens são em **português do Brasil**, numa linguagem que gestor de tráfego entende.

## Rodando localmente

```bash
npm install
npm run dev      # recarga automática em http://127.0.0.1:3000
npm run check    # lint + tipos + testes
npm run smoke    # sobe o app de verdade e confere as telas
```

## Regras importantes

- **Nunca** inclua tokens, chaves ou dados reais de contas (IDs, nomes de clientes, pixels) em código, testes, issues ou prints. Use valores fictícios.
- Testes automáticos **não** podem escrever na Meta. Use os fakes que já existem (`src/migration/executor.test.ts`).
- Achou um campo que a Meta passou a recusar ou ignorar? Trate no `src/migration/mapper.ts`, adicione teste e um aviso na revisão.
- Mudou o banco (`src/db/schema.ts`)? Rode `npm run db:generate` e **leia o SQL gerado**: ele precisa funcionar em bancos que já têm dados.
- O app tem que funcionar em macOS, Windows e Linux.

Veja também o [CLAUDE.md](CLAUDE.md), que resume a arquitetura e as regras do projeto.

## Pull requests

- Um assunto por PR, com descrição do que mudou e como testou.
- `npm run check` e `npm run smoke` passando.
- Mudança visual: inclua um print (sem dados reais).
