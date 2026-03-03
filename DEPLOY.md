# Deploy Checklist (Cloudflare)

Marque cada item conforme concluir.

## Checklist

- [ ] 1. Instale Node.js 20+.
- [ ] 2. Rode `wrangler login`.
- [ ] 3. Entre em `worker/` e rode `wrangler d1 create escala-db`.
- [ ] 4. Copie o `database_id` para `worker/wrangler.toml` (`database_id = "__PREENCHER__"` -> id real).
- [ ] 5. Rode `wrangler d1 migrations apply escala-db --remote`.
- [ ] 6. Rode `npm i` em `worker/`.
- [ ] 7. Rode `npm run deploy` em `worker/`.
- [ ] 8. Configure Pages: Framework `None`, Build `exit 0`, Output `public`.
- [ ] 9. Adicione route no Worker: `<SEU_DOMINIO>/api/*`.
- [ ] 10. Valide `https://<dominio>/api/health` e teste as telas + CRUD.

## Troubleshooting rapido

- CORS/404 no front:
  confirme que a route do Worker esta no mesmo dominio com `/api/*`.
- Erro de banco no Worker:
  confirme `binding = "DB"` e `database_id` correto em `worker/wrangler.toml`.
- Tabela nao encontrada:
  rode novamente `wrangler d1 migrations apply escala-db --remote`.
