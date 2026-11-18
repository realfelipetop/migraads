# Migra Ads · Spike da Fase 0

Scripts descartáveis para validar a API da Meta **antes** de construir o app. O que for aprendido aqui vai para `docs/fase-0-resultados.md` e vira a base do app de verdade.

> **Tudo aqui é só leitura**, exceto o script de recriação, que ainda vai ser feito e só cria objetos **pausados**, sempre com a sua confirmação.

## Preparar

```bash
cd spike
npm install
```

Depois, siga o guia [docs/fase-0/criar-app-meta.md](../docs/fase-0/criar-app-meta.md) para criar o app na Meta e conectar.

## Comandos

| Comando | O que faz | Pergunta da Fase 0 |
|---|---|---|
| `npm run login` | Login com Facebook voltando para `localhost:3000` | P1 |
| `npm run token` | Plano B: cola um token do Graph API Explorer | P1 (plano B) |
| `npm run accounts` | Lista contas pessoais, BMs, contas próprias e compartilhadas | — |
| `npm run read -- --account <ID>` | Lista as campanhas da conta | — |
| `npm run read -- --account <ID> --name PRODUTO X` | Lê a árvore completa e salva um snapshot em `data/` | P4, P5, P6 |

Os snapshots ficam em `spike/data/` (fora do Git).
