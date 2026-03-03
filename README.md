# Escala de Atendimento

Aplicacao de escala FDS/feriados pronta para deploy gratuito com Cloudflare:

- Front estatico em `public/` (Cloudflare Pages)
- API REST em `worker/src/index.ts` (Cloudflare Worker)
- Banco SQLite D1 com migrations em `worker/migrations/`

## Stack e arquitetura

- `Cloudflare Pages`: entrega HTML/CSS/JS
- `Cloudflare Worker`: rotas `/api/*`
- `Cloudflare D1`: persistencia de equipes, colaboradores, eventos e escalas

O front usa `fetch("/api/...")` por padrao (mesmo dominio).

## Estrutura

```text
public/
  index.html
  collaborators.html
  events.html
  event-edit.html
  event-print.html
  assets/css/app.css
  assets/js/*.js
  assets/img/brand-avatar.svg

worker/
  src/index.ts
  migrations/0001_init.sql
  migrations/0002_seed_collaborators.sql
  wrangler.toml
```

## Regras da autoescala (resumo)

Campos do colaborador que influenciam a geracao automatica:

- `Genero`: turnos de fechamento (`14:20+` e `15:40+`) nao sao atribuiveis para `F`.
- `Fim expediente semanal (HH:MM)`: se for `>= 22:00`, a pessoa nao entra em slot antes de `09:20`.
- `Equipe Domingo` (`A`/`B`): usada no rodizio de domingo. Se vazio, o sistema infere grupo por nome/id.

Observacao: a validacao final continua no backend (`/api/validate/shifts`).

## Endpoints principais

- `GET /api/health`
- `GET /api/dashboard`
- `GET/POST/PUT/DELETE /api/collaborators`
- `GET/POST/PUT/DELETE /api/events`
- `POST /api/events/generate-weekends`
- `GET /api/events/:id/shifts`
- `PUT /api/events/:id/shifts`
- `POST /api/events/:id/auto-schedule`
- `POST /api/validate/shifts`

## Rodar local

Terminal 1 (API):

```bash
cd worker
npm i
npm run dev
```

Terminal 2 (front):

```bash
npx serve public
```

Por padrao o front usa `API_BASE="/api"`.
Para apontar manualmente para worker local:

```js
localStorage.setItem("escala_api_base", "http://127.0.0.1:8787/api");
location.reload();
```

Para limpar override:

```js
localStorage.removeItem("escala_api_base");
location.reload();
```

## Deploy Cloudflare (copiar/colar)

### 1) Login

```bash
wrangler login
```

### 2) Criar D1

```bash
cd worker
wrangler d1 create escala-db
```

Copie o `database_id` retornado para `worker/wrangler.toml`:

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

### 3) Aplicar migrations no remoto

```bash
cd worker
wrangler d1 migrations apply escala-db --remote
```

Migrations atuais:

- `0001_init.sql`: schema base + indices + triggers + seed de teams
- `0002_seed_collaborators.sql`: seed inicial de colaboradores (idempotente)

### 4) Deploy Worker

```bash
cd worker
npm run deploy
```

### 5) Configurar Pages

No projeto Pages:

- Framework preset: `None`
- Build command: `exit 0`
- Output directory: `public`

### 6) Rota `/api/*` no mesmo dominio

Dashboard:

`Workers & Pages -> escala-api -> Settings -> Domains & Routes -> Add route`

Pattern:

`<SEU_DOMINIO>/api/*`

Exemplo:

`app.seudominio.com/api/*`

## Validacao pos-deploy

1. Abrir `https://<dominio>/api/health`
2. Confirmar retorno com:
   - `ok: true`
   - `data.ts`
   - `data.version`
3. Testar telas:
   - `/index.html`
   - `/collaborators.html`
   - `/events.html`
   - `/event-edit.html?id=<id>`
   - `/event-print.html?id=<id>`
4. Testar CRUD e "Gerar escala automatica"

## Troubleshooting rapido

- `404` em `/api/...`: rota `<SEU_DOMINIO>/api/*` nao aplicada no Worker correto.
- Erro de DB: conferir `binding = "DB"` e `database_id` no `wrangler.toml`.
- Tabela inexistente: reaplicar `wrangler d1 migrations apply escala-db --remote`.
- Front em host separado: configurar `localStorage.escala_api_base`.
- Se estiver em `*.pages.dev` sem route no mesmo dominio, o front usa fallback para `workers.dev` configurado em `public/assets/js/common.js`.
