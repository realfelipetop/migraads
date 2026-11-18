# Checklist antes de publicar no GitHub

Preparado em 12/11/2026. Nada disto foi feito automaticamente: publicar é decisão do autor.

## 1. Repositório novo, sem o histórico

O código e os documentos atuais já estão **sem dados reais**: IDs de contas, pixel, campanhas, nomes de BMs e do negócio foram trocados por valores fictícios. Mas o **histórico do Git** (commits antigos) ainda tem esses dados.

Por isso, **publique como um repositório novo, com um único commit inicial**, e não envie este histórico:

```bash
# numa pasta separada, a partir de uma cópia limpa
git clone /caminho/para/MigraAds migra-ads-publico
cd migra-ads-publico
rm -rf .git
git init -b main
git add -A
git commit -m "Migra Ads v0.9.0"
# depois: criar o repositório no GitHub e dar push
```

Confira antes do push:

```bash
git grep -n -i -e "act_[0-9]\{12,\}" -e "EAA[A-Za-z0-9]\{20,\}" -- . ':!package-lock.json'
```

Não deve aparecer nada além dos exemplos fictícios.

## 2. O que NÃO vai junto (já está no .gitignore)

- `data/`: banco, token criptografado, `secret.key`, backups e mídias
- `spike/.env.local` e `spike/data/`
- `.env*`, `node_modules/`, `.next/`

## 3. Ajustes no repositório público

- [ ] Trocar `<usuario>` pelo seu usuário do GitHub no README (comando `git clone`).
- [ ] Adicionar prints ou um GIF no README, feitos **com uma conta de teste** (sem nomes de clientes, rostos nem números reais).
- [ ] Ativar *Private vulnerability reporting* (Settings → Security) para o SECURITY.md funcionar.
- [ ] Conferir se o CI (GitHub Actions) passou em **macOS, Windows e Linux**. **Windows nunca foi testado de verdade**: é o primeiro teste nele.
- [ ] Publicar as páginas de [Política de Privacidade](politica-de-privacidade.md) e [Termos](termos-de-servico.md), caso algum dia o app da Meta precise delas (só para quem publicar o app).

## 4. Versão

- Hoje: **0.9.0** (Fases 1–4 e 6–9 prontas; a Fase 5, de criativos novos, ficou opcional, porque só funciona com o app da Meta publicado).
- Sugestão: virar **1.0.0** depois que o CI passar no Windows e alguém (além do autor) migrar com sucesso seguindo só o README.
