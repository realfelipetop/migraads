# Fase 0 · Criar o seu app na Meta e conectar

Leva uns 10 minutos e só precisa ser feito uma vez. O app fica em **modo de desenvolvimento**: só você usa, e a Meta não precisa revisar nada.

> A Meta muda os nomes dos menus com frequência. Se algum botão estiver com outro nome, procure o equivalente. E anote: isso vira melhoria para o guia final com prints.

## 1. Criar o app

1. Acesse **developers.facebook.com** e entre com o seu Facebook.
   - Primeira vez? A Meta pede para você se registrar como desenvolvedor (aceitar os termos e confirmar o celular). **Esse passo é seu.**
2. Clique em **Meus apps → Criar app**.
3. **Nome:** `Migra Ads (pessoal)`. Use o seu e-mail de contato.
4. **Caso de uso:** escolha **"Criar e gerenciar anúncios com a API de Marketing"** (ou o nome parecido que aparecer).
5. **Portfólio de negócios:** se pedir, pode escolher a **BM Principal** ou "não conectar agora". Isso não limita quais contas o app enxerga.
6. Conclua a criação.

## 2. Copiar App ID e Chave Secreta

1. No painel do app: **Configurações do app → Básico**.
2. Copie o **ID do app**.
3. Em **Chave secreta do app**, clique em **Mostrar** e copie.
   - ⚠️ A chave secreta é uma senha. Não mande em chat, não poste em lugar nenhum.

## 3. Colocar no arquivo local

Na pasta `spike`, copie o modelo:

**Mac:**
```bash
cp .env.example .env.local
```

**Windows (PowerShell):**
```powershell
Copy-Item .env.example .env.local
```

Abra o `spike/.env.local` no editor e preencha **você mesmo**:
```
META_APP_ID=seu_id_aqui
META_APP_SECRET=sua_chave_aqui
```
Esse arquivo está no `.gitignore` e nunca vai para o Git.

## 4. Configurar o retorno do login (teste da Pergunta 1)

1. No painel do app, adicione o produto **Login do Facebook** (ou **Login do Facebook para Empresas**, se for o único disponível).
2. Em **Configurações** do login, no campo **URIs de redirecionamento do OAuth válidos**, coloque:
   ```
   http://localhost:3000/api/auth/callback
   ```
   - Se a Meta recusar `localhost` ou disser que ele já é permitido automaticamente em modo de desenvolvimento, **anote a mensagem** e siga para o passo 5 assim mesmo.
3. Se o seu app usa **Login do Facebook para Empresas**, ele pede uma **Configuração**:
   - Tipo de token: **Token de acesso do usuário**.
   - Permissões: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`.
   - Copie o **ID da configuração** para `META_LOGIN_CONFIG_ID` no `.env.local`.

## 5. Conectar

**Plano A: login direto**
```bash
npm run login
```
O navegador abre, você autoriza e o terminal mostra **"Conectado ✔"**.

**Plano B: se o plano A der erro de URL ou redirecionamento**
1. Abra **developers.facebook.com/tools/explorer**.
2. Em **Aplicativo da Meta**, escolha o `Migra Ads (pessoal)`.
3. Em **Usuário ou página**, escolha **Obter token de acesso do usuário**.
4. Em **Permissões**, adicione: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`.
5. Clique em **Generate Access Token** e autorize.
6. Copie o token e rode:
   ```bash
   npm run token
   ```
   Cole o token quando o terminal pedir. Ele é trocado por um token de ~60 dias e salvo só no `.env.local`.

## 6. Conferir

```bash
npm run accounts
```
Tem que aparecer a mesma lista do seletor de contas do Gerenciador: **"A tua conta"** e as BMs (BM Clientes, BM Antiga, BM Principal…).
