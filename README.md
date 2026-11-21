# Instagram Posts

Frontend em React + TypeScript para buscar e exibir posts (fotos e vídeos) do Instagram por usuário, e para baixar qualquer post, reel ou story pelo link.

## Estrutura do projeto

```
src/
├── components/
│   ├── Button/
│   ├── Card/
│   ├── EmptyState/
│   ├── ErrorMessage/
│   ├── Filter/
│   ├── Header/
│   ├── Layout/
│   ├── PostCard/        # Card de post (mídia + legenda)
│   ├── Spinner/
│   └── UsernameInput/   # Campo usuário + botão Buscar
├── config/
│   └── constants.ts
├── pages/
│   └── NewsPage/        # Página principal (busca por usuário)
├── services/
│   └── instagram.service.ts   # POST /api/instagram/posts
├── styles/
│   └── global.css
├── types/
│   └── instagram.types.ts
├── App.tsx
└── main.tsx
```

## De onde vêm os dados

Toda a lógica de servidor fica em `api/_lib/instagram.js`, usada pelas funções da Vercel (`/api/instagram/posts`, `/search`, `/link`) e pelo proxy do Vite em dev. O campo de busca aceita `@perfil` ou o link de um post.

**Perfil (`@nike`)**, sempre grátis:

1. **Instagram direto** (endpoint público do site, `web_profile_info`): só a 1ª página (12 posts). O Instagram bloqueia por IP quando há muitas requisições (HTTP 429), e o app pausa essa fonte por 10 min quando isso acontece. Costuma ser bloqueado em IPs de datacenter, como os da Vercel.
2. **Graph API da Meta (Business Discovery)**: oficial, com paginação ("Ver mais"). Só atende perfis **profissionais** (Empresa/Criador). Ativa apenas se `IG_GRAPH_TOKEN` e `IG_GRAPH_USER_ID` estiverem configurados. Sem ela, o botão "Ver mais" não aparece.

**Link (`instagram.com/p/…`, `/reel/…`, `/stories/…`)**: API [Download All in One!](https://rapidapi.com/coder2077/api/instagram-downloader-download-instagram-videos-stories1) da RapidAPI (`GET /fetch?url=`). O plano Basic é grátis: 500 créditos/mês, 2 por post ou reel, 5 por story, e chamadas que falham não são cobradas.

**Sugestões de perfil** usam o endpoint público de busca do Instagram, que costuma exigir login; quando ele recusa, o campo só não mostra sugestões (Enter abre o @ digitado).

Detalhes:

- Respostas ficam em cache na memória do servidor (perfis 10 min, links 30 min, porque os links de download expiram em algumas horas).
- **De onde veio cada resposta:** o terminal do `npm run dev` (e os logs da Vercel) mostram linhas como `[instagram] posts @nike → graph` ou `link … → rapidapi (falhou (HTTP 403))`. Quando um perfil não carrega, a mensagem de erro no app lista o motivo de cada fonte.

## Configurar a Graph API da Meta (gratuita)

Você precisa de uma conta **sua** do Instagram do tipo profissional. Ela é só quem faz as consultas e pode ser uma conta secundária.

1. **Conta profissional:** no app do Instagram, *Configurações → Tipo de conta e ferramentas → Mudar para conta profissional* (Criador de conteúdo ou Empresa).
2. **Página do Facebook:** crie uma Página e vincule a conta do Instagram a ela (nas configurações da Página, em *Contas vinculadas*, ou pela Central de Contas).
3. **App da Meta:** em [developers.facebook.com](https://developers.facebook.com) → *Meus apps → Criar app*, escolha o caso de uso de Instagram com login do Facebook (API do Instagram com Login do Facebook). O app pode ficar em **modo de desenvolvimento**: como só você usa o token, não é preciso enviar para revisão.
4. **Token:** no [Graph API Explorer](https://developers.facebook.com/tools/explorer/), selecione o app, clique em *Generate Access Token* e conceda as permissões `instagram_basic`, `pages_show_list`, `pages_read_engagement` e `business_management`.
5. **ID da sua conta do Instagram:** no próprio Explorer, rode `GET me/accounts` para pegar o ID da Página e depois `GET <ID_DA_PAGINA>?fields=instagram_business_account`. O `id` retornado é o `IG_GRAPH_USER_ID`.
6. **Token de longa duração:** o token do Explorer expira em cerca de 1 hora. Troque-o por um de ~60 dias acessando
   `https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id=<APP_ID>&client_secret=<APP_SECRET>&fb_exchange_token=<TOKEN_CURTO>`
   (App ID e App Secret ficam em *Configurações do app → Básico*). O `access_token` da resposta é o `IG_GRAPH_TOKEN`.
7. **Configure** no `.env` (dev) e nas Environment Variables da Vercel (produção):

```
IG_GRAPH_TOKEN=seu_token_de_longa_duracao
IG_GRAPH_USER_ID=17841400000000000
```

8. **Teste:** rode `npm run dev`, abra um perfil de marca (ex.: `nike`) e confira no terminal a linha `→ graph`.

Quando o token expirar, o terminal mostra `graph (falhou (token inválido ou expirado))` e o app volta a usar a RapidAPI até você gerar um novo (passos 4 e 6).

## Configuração da RapidAPI (download por link)

1. Na página da [Download All in One!](https://rapidapi.com/coder2077/api/instagram-downloader-download-instagram-videos-stories1), clique em **Subscribe / Alterar plano** e assine o plano **Basic** (grátis).
2. Copie a chave (`X-RapidAPI-Key`) do playground.
3. **Dev:** no `.env`, `VITE_RAPIDAPI_KEY=sua_chave` (a chave fica só no servidor do Vite, não vai para o navegador).
4. **Produção (Vercel):** *Settings → Environment Variables*, crie `RAPIDAPI_KEY` com a mesma chave e faça um novo deploy.

Se o app mostrar "Sua chave não está inscrita na API…", a chave do `.env` não tem a assinatura do passo 1 (confira se é a mesma conta/aplicativo da RapidAPI).

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run preview` — visualizar o build

## Requisitos

- Node.js 18+
- npm ou yarn

## Instalação

```bash
npm install
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173). Digite um usuário do Instagram e clique em **Buscar** para listar os posts.
