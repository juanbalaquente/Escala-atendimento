# Escala de Atendimento (MVP)

Sistema web simples para substituir planilha de escala de atendimento, rodando em ambiente local com XAMPP.

## Objetivo

Centralizar a montagem de escala de atendimento em um site, com foco em eventos de:
- `FDS` (sabado e domingo)
- `FERIADO`

Escopo do MVP:
- Sem login/autenticacao
- Uso local (intranet/maquina local)
- CRUD de colaboradores
- CRUD de eventos
- Montagem de escala por evento
- Validacao rigida de turno e pausas
- Visualizacao para impressao

## Stack

- Apache + PHP 8+ (XAMPP)
- MySQL/MariaDB
- PHP puro (PDO)
- HTML + CSS + JavaScript (sem framework)

## Regras de negocio implementadas

A escala considera apenas:
- `ANALISTA`
- `SUPORTE_N1`

Cada linha de escala exige:
- inicio do turno (`shift_start`)
- fim do turno (`shift_end`)
- `break_10_1`
- `break_20`
- `break_10_2`

Validacoes obrigatorias:
1. `shift_end > shift_start`
2. As 3 pausas devem estar dentro do turno
3. Ordem obrigatoria das pausas: `break_10_1 < break_20 < break_10_2`
4. Colaborador nao pode repetir no mesmo evento
5. Todos os campos sao obrigatorios (incluindo pausas)

## Estrutura do projeto

```text
escala/
  app/
    config/
      db.php
    lib/
      helpers.php
      validate.php
  database/
    schema.sql
  public/
    index.php
    assets/
      css/app.css
      js/app.js
    pages/
      _header.php
      _footer.php
      dashboard.php
      collaborators.php
      events.php
      event_edit.php
      event_print.php
      api_validate.php
      api_events_generate_weekends.php
```

## Banco de dados

Banco: `escala_atendimento`

Tabelas:
- `teams`
- `collaborators`
- `events`
- `shifts`

Detalhes importantes:
- Seed de `teams` no schema:
  - `ANALISTA`
  - `SUPORTE_N1`
- `shifts` possui `UNIQUE(event_id, collaborator_id)`

## Como rodar localmente (XAMPP)

1. Inicie `Apache` e `MySQL` no XAMPP.
2. Abra o `phpMyAdmin`.
3. Importe o arquivo:
   - `database/schema.sql`
4. Verifique as credenciais em `app/config/db.php`:
   - host: `127.0.0.1`
   - porta: `3306`
   - banco: `escala_atendimento`
   - usuario: `root`
   - senha: `''` (vazia, padrao local)
5. Acesse no navegador:
   - `http://localhost/escala/public/`

## Rotas

Roteador: `public/index.php`

Paginas:
- `?page=dashboard`
- `?page=collaborators`
- `?page=events`
- `?page=event_edit&id={EVENT_ID}`
- `?page=event_print&id={EVENT_ID}`

APIs:
- `?page=api_validate`
- `?page=api_events_generate_weekends`

## Fluxo de uso recomendado

1. Cadastre colaboradores em `Colaboradores`.
2. Crie eventos manualmente em `Eventos` ou use `Gerar FDS do mes`.
3. Entre em `Montar escala` para um evento.
4. Adicione linhas, selecione equipe/colaborador, turno e pausas.
5. Clique em `Validar` (opcional) ou `Salvar escala`.
6. Use `Print` para impressao.

## Tela de impressao

A pagina `event_print`:
- Agrupa por equipe
- Lista colaboradores e horarios
- Usa CSS de impressao (`@media print`)

## Observacoes tecnicas

- Projeto orientado a uso local e simplicidade.
- Sem autenticacao/login.
- Sem framework.
- Persistencia via PDO + prepared statements.

## Troubleshooting rapido

### Erro de conexao com banco
- Confirme MySQL ligado no XAMPP.
- Confirme credenciais em `app/config/db.php`.
- Reimporte `database/schema.sql`.

### Pagina em branco ou erro PHP
- Confira se esta acessando `http://localhost/escala/public/`.
- Verifique logs do Apache/PHP no XAMPP.

### Nao salva escala
- Confira se todos os campos de cada linha foram preenchidos.
- Verifique mensagens de validacao na tela.
- Confirme que o colaborador nao esta repetido no mesmo evento.

## Proximos passos sugeridos

- Exportar escala para CSV/PDF
- Filtro por periodo (mes/ano)
- Copiar escala de um evento para outro
- Controle de versao da escala (historico)

---

Projeto MVP para operacao de escala de atendimento local.
