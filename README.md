# Instagram Posts

Frontend em React + TypeScript para buscar e exibir posts (fotos e vídeos) do Instagram por usuário, usando a API [Instagram120](https://rapidapi.com) da RapidAPI.

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

## Configuração da API (RapidAPI)

A aplicação usa a API **Instagram120** na RapidAPI.

### Desenvolvimento local

1. Crie um arquivo `.env` na raiz do projeto.
2. Adicione sua chave da RapidAPI:

```
VITE_RAPIDAPI_KEY=sua_chave_aqui
```

Opcional: para outro host, defina `VITE_RAPIDAPI_HOST`. O padrão é `instagram120.p.rapidapi.com`.

### Produção (Vercel) — uso seguro da chave

Em produção o frontend **não** envia a chave ao navegador. As requisições passam por um **proxy** (funções serverless em `/api/instagram/*`), e a chave fica só no servidor.

1. No [Dashboard da Vercel](https://vercel.com) → seu projeto → **Settings** → **Environment Variables**.
2. Crie a variável **`RAPIDAPI_KEY`** (nome exato) com o valor da sua chave da RapidAPI.
3. Marque o ambiente **Production** (e opcionalmente Preview).
4. Faça um novo deploy.

Assim a chave nunca é exposta no cliente e a comunicação com a API em produção funciona de forma segura.

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
