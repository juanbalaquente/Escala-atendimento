# Escala de Atendimento (Cloudflare Pages + Worker + D1)

Aplicacao pronta para deploy gratuito na Cloudflare com:

- Front estatico em `public/`
- API em Cloudflare Worker (`worker/src/index.ts`)
- Banco D1 (SQLite) com migrations versionadas
- Front consumindo `fetch("/api/...")` no mesmo dominio

## Arquitetura

- Pages: entrega os arquivos estaticos de `public/`
- Worker: atende rotas REST em `/api/*`
- D1: persiste equipes, colaboradores, eventos e escalas

## Estrutura do repositorio

```text
public/
  index.html
  collaborators.html
  events.html
  event-edit.html
  event-print.html
  assets/js/*.js
worker/
  src/index.ts
  migrations/0001_init.sql
  migrations/0002_seed_collaborators.sql
  wrangler.toml
```

## Requisitos

- Node.js 20+
- npm
- Conta Cloudflare
- Wrangler CLI (via `npm`, usando o `package.json` em `worker/`)

## 1) Login no Cloudflare

```bash
wrangler login
```

## 2) Criar o banco D1

```bash
cd worker
wrangler d1 create escala-db
```

Copie o `database_id` retornado e preencha em `worker/wrangler.toml`:

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

Se voce estiver usando este repositorio na mesma conta onde o D1 ja existe, mantenha o `database_id` atual.

## 3) Aplicar migrations no remoto (D1)

```bash
cd worker
wrangler d1 migrations apply escala-db --remote
```

Migrations atuais:

- `0001_init.sql`: schema base (teams, collaborators, events, shifts, indices e triggers)
- `0002_seed_collaborators.sql`: seed inicial de colaboradores (idempotente)

## 4) Rodar local

Terminal 1 (API Worker):

```bash
cd worker
npm i
npm run dev
```

Terminal 2 (front estatico):

```bash
npx serve public
```

Por padrao o front usa `API_BASE="/api"`.
Se quiser testar front em porta separada contra o worker local (`127.0.0.1:8787`):

```js
localStorage.setItem("escala_api_base", "http://127.0.0.1:8787/api");
location.reload();
```

Para voltar ao padrao:

```js
localStorage.removeItem("escala_api_base");
location.reload();
```

## 5) Deploy do Worker

```bash
cd worker
npm run deploy
```

## 6) Configurar Cloudflare Pages

No projeto Pages:

- Framework preset: `None`
- Build command: `exit 0`
- Output directory: `public`

## 7) Colocar API no mesmo dominio (`/api/*`)

No Dashboard Cloudflare:

`Workers & Pages -> escala-api -> Settings -> Domains & Routes -> Add route`

Pattern da rota:

`<SEU_DOMINIO>/api/*`

Exemplo:

`app.seudominio.com/api/*`

Esse passo e essencial porque o front chama `fetch("/api/...")`.

## 8) Validacao pos-deploy

1. Abrir `https://<dominio>/api/health`
2. Confirmar JSON com:
   - `ok: true`
   - `data.ts` (ISO string)
   - `data.version` (vem de `APP_VERSION`)
3. Testar telas:
   - `/index.html`
   - `/collaborators.html`
   - `/events.html`
   - `/event-edit.html?id=<id>`
   - `/event-print.html?id=<id>`
4. Testar CRUD de colaboradores/eventos e salvar escala

## 9) Troubleshooting rapido

- `404` em `/api/...`: confira se a route `<SEU_DOMINIO>/api/*` foi adicionada ao Worker certo
- Erro de banco no Worker: valide `binding = "DB"` e `database_id` em `worker/wrangler.toml`
- Tabela inexistente: rode novamente `wrangler d1 migrations apply escala-db --remote`
- Front chamando API errada: remova override local com `localStorage.removeItem("escala_api_base")`

## 10) Subir atualizacoes para o GitHub

```bash
git add .
git commit -m "chore: final review and production deploy docs"
git push origin main
```

Se a branch padrao do seu repositorio nao for `main`, ajuste o ultimo comando.
