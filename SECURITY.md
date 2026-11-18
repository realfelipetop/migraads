# Segurança

## Como o Migra Ads protege seus dados

- Roda só no seu computador; o servidor escuta apenas em `127.0.0.1` e recusa requisições cujo endereço (Host) não seja `localhost`. Isso bloqueia sites maliciosos que tentem falar com o app pelo seu navegador (*DNS rebinding*).
- Token da Meta, chave secreta do app e chave da Utmify ficam criptografados (AES-256-GCM) em `data/`, com a chave em `data/secret.key`. A pasta `data/` está no `.gitignore`.
- Nada é enviado para servidores do projeto. As únicas conexões externas são com a API da Meta e, se você ativar, com a API da Utmify.
- Tudo é criado **pausado** por padrão e só depois de uma tela de revisão.

**Limite:** a criptografia evita vazamento acidental (print do banco, backup compartilhado, commit por engano). Ela não protege contra um programa malicioso no seu computador, que poderia ler a chave e o banco juntos.

## Boas práticas

- Nunca compartilhe a pasta `data/` nem o arquivo `data/secret.key`.
- Não mande a chave secreta do seu app da Meta em chat, e-mail ou issue.
- Se achar que o token vazou: em Conexão, clique em **Desconectar** e, no Facebook, remova o acesso do app em *Configurações → Apps e sites*. Depois gere uma nova chave secreta no painel do app.

## Reportar uma vulnerabilidade

Não abra issue pública para falhas de segurança. Fale direto com o autor, **Felipe Top** ([@realfelipetop](https://instagram.com/realfelipetop)), ou use o recurso de *Security advisory* privado do GitHub, se estiver ativo no repositório.
