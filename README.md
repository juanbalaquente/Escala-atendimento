# Escala de Atendimento (MVP)

Sistema web para substituir planilha de escala de atendimento, rodando localmente com XAMPP.

## Objetivo

Centralizar a montagem da escala em um site, com foco em eventos:
- `FDS` (sabado e domingo)
- `FERIADO`

## Funcionalidades

- CRUD de colaboradores
- CRUD de eventos
- Geracao de eventos de fim de semana por mes (`Gerar FDS do mes`)
- Montagem manual de escala por evento
- Geracao automatica de escala por evento (`Gerar escala automatica`)
- Validacao rigida de turno e pausas (cliente + servidor)
- Visualizacao de impressao (`Print`)
- Menu lateral para navegacao
- Tema claro/escuro com persistencia em `localStorage`

## Regras de negocio

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
3. Ordem obrigatoria: `break_10_1 < break_20 < break_10_2`
4. Colaborador nao pode repetir no mesmo evento
5. Todos os campos sao obrigatorios (incluindo pausas)

## Escala automatica

A autoescala fica na tela `Montar escala`.

Comportamento atual:
- Sabado: monta 1 analista + 5 SUPORTE_N1
- Domingo: monta 2 SUPORTE_N1
- Considera historico para reduzir repeticao de pessoas
- Aplica aleatorizacao por evento/slot para evitar padrao fixo entre semanas
- Usa bloqueios entre sabado/domingo para reduzir escalas consecutivas no fim de semana
- Possui fallback progressivo no domingo para evitar erro de geracao quando o pool estiver muito restrito

## Stack

- Apache + PHP 8+ (XAMPP)
- MySQL/MariaDB
- PHP puro (PDO)
- HTML + CSS + JavaScript (sem framework)

## Estrutura do projeto

```text
escala/
  app/
    config/
      db.php
    lib/
      helpers.php
      validate.php
      auto_schedule.php
  database/
    schema.sql
    seed.sql
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
      api_events_auto_schedule.php
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
- `collaborators` possui campos extras usados pela autoescala:
  - `gender` (`F|M|N`)
  - `weekday_shift_end` (TIME, opcional)
  - `rotation_group` (`A|B`, opcional)

## Como rodar localmente (XAMPP)

1. Inicie `Apache` e `MySQL` no XAMPP.
2. Abra o `phpMyAdmin`.
3. Importe os arquivos nesta ordem:
   - `database/schema.sql`
   - `database/seed.sql` (opcional, dados iniciais e dados ficticios)
4. Verifique as credenciais em `app/config/db.php`:
   - host: `127.0.0.1`
   - porta: `3306`
   - banco: `escala_atendimento`
   - usuario: `root`
   - senha: `''` (vazia, padrao local)
5. Acesse:
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
- `?page=api_events_auto_schedule`

## Fluxo recomendado

1. Cadastre colaboradores em `Colaboradores`.
2. Crie eventos manualmente em `Eventos` ou use `Gerar FDS do mes`.
3. Entre em `Montar escala`.
4. Escolha entre:
   - montar manualmente
   - gerar automaticamente (`Gerar escala automatica`)
5. Valide e salve.
6. Use `Print` para impressao.

## Tela de impressao

A pagina `event_print`:
- agrupa por equipe
- lista colaboradores e horarios
- usa CSS de impressao (`@media print`)

## Observacoes tecnicas

- Projeto orientado a uso local e simplicidade
- Sem autenticacao/login
- Sem framework
- Persistencia via PDO + prepared statements

## Troubleshooting rapido

### Erro de conexao com banco
- Confirme MySQL ligado no XAMPP
- Confirme credenciais em `app/config/db.php`
- Reimporte `database/schema.sql`

### Pagina em branco / erro PHP
- Confira URL: `http://localhost/escala/public/`
- Verifique logs do Apache/PHP no XAMPP

### Nao salva escala
- Confira preenchimento de todos os campos
- Verifique mensagens de validacao na tela
- Confirme que colaborador nao esta repetido no mesmo evento

### Erro ao gerar escala automatica
- Verifique se ha colaboradores ativos suficientes
- Revise `rotation_group` quando usar divisao A/B
- Verifique se regras de bloqueio de fim de semana nao deixaram o pool muito restrito

---

Projeto MVP para operacao local de escala de atendimento.
