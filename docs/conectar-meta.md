# Conectar o Migra Ads à Meta

Leva uns 10 minutos e é feito **uma vez só**. Você cria um app da Meta que é **só seu**: ele fica em **modo de desenvolvimento**, então não precisa publicar nem passar por análise da Meta.

O próprio Migra Ads mostra estes passos na tela **Conexão**. Este guia é a versão por escrito.

> A Meta muda os nomes dos menus com frequência. Se algum botão estiver diferente, procure o equivalente.

## 1. Criar o app

1. Acesse **developers.facebook.com/apps/creation** e entre com o seu Facebook.
   - Primeira vez? A Meta pede para você se registrar como desenvolvedor (aceitar os termos e confirmar o celular).
2. **Nome:** por exemplo, `Migra Ads (pessoal)`.
3. **Caso de uso:** “Criar e gerenciar anúncios com a API de Marketing” (ou o nome parecido).
4. Se pedir um portfólio de negócios, pode escolher qualquer um. Isso **não** limita as contas que o app enxerga.

Já tem um app? Pode usar ele.

## 2. Cadastrar o endereço de retorno do login

No painel do app, adicione o produto **Login do Facebook** (ou **Login do Facebook para Empresas**). Em **Configurações**, no campo **URIs de redirecionamento do OAuth válidos**, cole:

```
http://localhost:3000/api/auth/callback
```

Se a Meta disser que `localhost` já é permitido automaticamente em modo de desenvolvimento, tudo bem: siga em frente.

**Login do Facebook para Empresas:** se o seu app usar esse produto, crie uma **Configuração** com “Token de acesso do usuário” e as permissões `ads_management`, `ads_read`, `business_management`, `pages_show_list` e `pages_read_engagement`. Cole o **ID da configuração** no campo opcional da tela Conexão.

## 3. Copiar o ID e a chave secreta

Em **Configurações do app → Básico**:

- **Identificação da app** → é o *ID do app*.
- **Chave secreta da app** → clique em **Mostrar** e copie.

> ⚠️ **Erro comum:** não confunda com o **Token do cliente** (fica em *Avançado*). Os dois têm 32 caracteres, mas só a **Chave secreta** funciona. Se você colar o token do cliente, o Migra Ads avisa.
>
> A chave secreta é uma senha: não mande em chat nem e-mail. No Migra Ads ela fica criptografada só no seu computador.

Cole os dois no passo 3 da tela Conexão e clique em **Salvar e conferir**. O app confere com a Meta na hora.

## 4. Entrar com Facebook

Clique em **Entrar com Facebook** e autorize. Pronto: a tela mostra **“Conectado como…”** e a lista das suas contas, igual ao seletor do Gerenciador.

## Se der errado

| Mensagem | O que fazer |
|---|---|
| “O ID do app ou a chave secreta não conferem” | Copie de novo a **Chave secreta** em Configurações → Básico (não o Token do cliente). |
| “O endereço de retorno do login não está cadastrado” | Refaça o passo 2 com o endereço exato. |
| “URL bloqueada” na tela da Meta | Use o **modo avançado: colar um token** (abaixo). |
| “Faltam permissões” | Clique em **Reconectar** e marque todas as permissões. |

## Modo avançado: colar um token

1. Abra **developers.facebook.com/tools/explorer**.
2. Em *Aplicativo da Meta*, escolha o seu app.
3. Em *Usuário ou página*, escolha **Obter token de acesso do usuário**.
4. Adicione as permissões `ads_management`, `ads_read`, `business_management`, `pages_show_list` e `pages_read_engagement`.
5. **Generate Access Token**, copie e cole em **Conexão → Modo avançado**.

O Migra Ads troca por um token de longa duração. Também aceita token de **usuário do sistema** da BM, que não expira, mas só enxerga as contas daquela BM.

## Validade

O acesso aos dados vale cerca de **90 dias**. Uma semana antes, aparece uma faixa amarela no topo do app. É só clicar em **Reconectar**.
