# Escala de Atendimento - Deploy Cloudflare (Pages + Worker + D1)

Projeto preparado para deploy com:

- Front estatico em `public/`
- API no Worker em `worker/`
- Banco D1 com migration em `worker/migrations/0001_init.sql`

O front usa `fetch("/api/...")` por padrao.

## Requisitos

- Node.js 20+
- npm
- Conta Cloudflare

## A) Login no Wrangler

```bash
wrangler login
```

## B) Criar D1

```bash
cd worker
wrangler d1 create escala-db
```

Copie o `database_id` retornado e preencha `worker/wrangler.toml`:

```toml
name = "escala-api"
main = "src/index.ts"
compatibility_date = "2026-03-01"

[[d1_databases]]
binding = "DB"
database_name = "escala-db"
database_id = "__PREENCHER__"
migrations_dir = "migrations"

[vars]
APP_VERSION = "0.1.0"
```

## C) Aplicar migrations no remoto

```bash
cd worker
wrangler d1 migrations apply escala-db --remote
```

## D) Rodar local

Terminal 1 (Worker):

```bash
cd worker
npm i
npm run dev
```

Terminal 2 (front estatico):

```bash
npx serve public
```

Se abrir o front em outra porta e precisar apontar para o Worker local, rode no console do navegador:

```js
localStorage.setItem("escala_api_base", "http://127.0.0.1:8787/api");
location.reload();
```

Para voltar ao padrao `/api`:

```js
localStorage.removeItem("escala_api_base");
location.reload();
```

## E) Deploy do Worker

```bash
cd worker
npm run deploy
```

## F) Configurar Cloudflare Pages

No projeto Pages:

- Framework preset: `None`
- Build command: `exit 0`
- Output directory: `public`

## G) Rota `/api/*` no mesmo dominio

No Dashboard Cloudflare:

`Workers & Pages -> escala-api -> Settings -> Domains & Routes -> Add route`

Pattern:

`<SEU_DOMINIO>/api/*`

Exemplo:

`app.seudominio.com/api/*`

## H) Pos deploy (validacao)

1. Teste health:
   `https://<dominio>/api/health`
2. Confirme resposta:
   `ok: true`, `data.ts`, `data.version`.
3. Abra as telas:
   - `/index.html`
   - `/collaborators.html`
   - `/events.html`
   - `/event-edit.html?id=<id>`
   - `/event-print.html?id=<id>`
4. Teste CRUD de colaboradores e eventos.

## Observacoes

- Front sem PHP em `public/`.
- API usa apenas `/api/*`.
- Banco D1 via binding `DB`.
