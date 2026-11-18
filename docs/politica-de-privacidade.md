# Política de Privacidade — Migra Ads

*Última atualização: 12 de novembro de 2026*

O **Migra Ads** é uma ferramenta gratuita e de código aberto que roda **inteiramente no computador de quem a usa**. Ela serve para copiar campanhas, conjuntos e anúncios entre contas de anúncios da Meta (Facebook e Instagram) do próprio usuário.

## Quais dados o Migra Ads acessa

Com a autorização do usuário, feita pelo Login do Facebook, o Migra Ads acessa pela API oficial da Meta:

- a lista de contas de anúncios, portfólios de negócios, páginas e pixels a que o usuário já tem acesso;
- as configurações de campanhas, conjuntos de anúncios, anúncios e criativos;
- imagens e vídeos usados nos anúncios, somente quando necessário para copiá-los para outra conta do próprio usuário.

As permissões pedidas são: `ads_management`, `ads_read`, `business_management`, `pages_show_list` e `pages_read_engagement`.

## Onde os dados ficam

- **Todos os dados ficam no computador do usuário**, em uma pasta local do Migra Ads.
- O token de acesso da Meta é guardado localmente e **criptografado**.
- O Migra Ads **não tem servidor**. Nenhum dado é enviado ao autor nem a terceiros.
- A única comunicação externa é com a **API da Meta**, para ler e criar os anúncios que o usuário pediu, e, **se o usuário ativar**, com a **Utmify**, para mostrar métricas de vendas.

## O que o Migra Ads não faz

- Não vende, compartilha nem analisa dados do usuário.
- Não coleta dados de terceiros, de seguidores ou de clientes.
- Não usa cookies de rastreamento nem ferramentas de analytics.

## Como apagar seus dados

1. **No computador:** apague a pasta de dados do Migra Ads (`data/`). Isso remove o token, os backups e todas as cópias.
2. **Na Meta:** remova o acesso do app em *Facebook → Configurações e privacidade → Configurações → Apps e sites*.

Como nenhum dado é guardado fora do computador do usuário, não há mais nada a apagar.

## Contato

Dúvidas sobre esta política: abra uma issue no repositório do projeto ou fale com o autor, **Felipe Top**, pelo Instagram **@realfelipetop**.
