USE escala_atendimento;

-- Colaboradores iniciais (base da planilha)
INSERT INTO collaborators (name, team_id, is_active)
SELECT src.name, t.id, 1
FROM (
    SELECT 'LEONNE' AS name, 'ANALISTA' AS team_code
    UNION ALL SELECT 'PEDRO', 'ANALISTA'
    UNION ALL SELECT 'JO?O', 'SUPORTE_N1'
    UNION ALL SELECT 'AGATA', 'SUPORTE_N1'
    UNION ALL SELECT 'RYAN', 'SUPORTE_N1'
    UNION ALL SELECT 'CARLOS', 'SUPORTE_N1'
    UNION ALL SELECT 'ANA LUIZA', 'SUPORTE_N1'
    UNION ALL SELECT 'LUANNA', 'SUPORTE_N1'
) src
INNER JOIN teams t ON t.code = src.team_code
LEFT JOIN collaborators c ON c.name = src.name AND c.team_id = t.id
WHERE c.id IS NULL;

-- Dados ficticios de teste (3 analistas + 6 suporte N1)
INSERT INTO collaborators (name, team_id, is_active)
SELECT src.name, t.id, 1
FROM (
    SELECT 'TESTE_ANALISTA_01' AS name, 'ANALISTA' AS team_code
    UNION ALL SELECT 'TESTE_ANALISTA_02', 'ANALISTA'
    UNION ALL SELECT 'TESTE_ANALISTA_03', 'ANALISTA'
    UNION ALL SELECT 'TESTE_SUPORTE_01', 'SUPORTE_N1'
    UNION ALL SELECT 'TESTE_SUPORTE_02', 'SUPORTE_N1'
    UNION ALL SELECT 'TESTE_SUPORTE_03', 'SUPORTE_N1'
    UNION ALL SELECT 'TESTE_SUPORTE_04', 'SUPORTE_N1'
    UNION ALL SELECT 'TESTE_SUPORTE_05', 'SUPORTE_N1'
    UNION ALL SELECT 'TESTE_SUPORTE_06', 'SUPORTE_N1'
) src
INNER JOIN teams t ON t.code = src.team_code
LEFT JOIN collaborators c ON c.name = src.name AND c.team_id = t.id
WHERE c.id IS NULL;

-- Evento ficticio
INSERT INTO events (type, event_date, label)
VALUES ('FDS', '2026-03-14', 'TESTE_FDS_14-03-2026')
ON DUPLICATE KEY UPDATE label = VALUES(label);

-- Escala ficticia do evento
INSERT INTO shifts (event_id, team_id, collaborator_id, shift_start, shift_end, break_10_1, break_20, break_10_2)
SELECT e.id, t.id, c.id,
       src.shift_start, src.shift_end, src.break_10_1, src.break_20, src.break_10_2
FROM (
    SELECT 'TESTE_ANALISTA_01' AS name, 'ANALISTA' AS team_code, '08:00:00' AS shift_start, '17:00:00' AS shift_end, '10:00:00' AS break_10_1, '12:30:00' AS break_20, '15:30:00' AS break_10_2
    UNION ALL SELECT 'TESTE_ANALISTA_02', 'ANALISTA', '09:00:00', '18:00:00', '10:40:00', '13:00:00', '16:00:00'
    UNION ALL SELECT 'TESTE_ANALISTA_03', 'ANALISTA', '13:00:00', '22:00:00', '15:00:00', '18:00:00', '20:30:00'
    UNION ALL SELECT 'TESTE_SUPORTE_01', 'SUPORTE_N1', '08:00:00', '14:20:00', '09:20:00', '11:10:00', '12:40:00'
    UNION ALL SELECT 'TESTE_SUPORTE_02', 'SUPORTE_N1', '08:00:00', '14:20:00', '09:40:00', '11:30:00', '12:50:00'
    UNION ALL SELECT 'TESTE_SUPORTE_03', 'SUPORTE_N1', '09:20:00', '15:40:00', '10:20:00', '12:10:00', '14:20:00'
    UNION ALL SELECT 'TESTE_SUPORTE_04', 'SUPORTE_N1', '14:20:00', '20:40:00', '15:40:00', '17:30:00', '19:20:00'
    UNION ALL SELECT 'TESTE_SUPORTE_05', 'SUPORTE_N1', '15:40:00', '22:00:00', '16:40:00', '18:30:00', '20:20:00'
    UNION ALL SELECT 'TESTE_SUPORTE_06', 'SUPORTE_N1', '15:40:00', '22:00:00', '16:50:00', '18:40:00', '20:40:00'
) src
INNER JOIN teams t ON t.code = src.team_code
INNER JOIN collaborators c ON c.name = src.name AND c.team_id = t.id
INNER JOIN events e ON e.label = 'TESTE_FDS_14-03-2026'
LEFT JOIN shifts s ON s.event_id = e.id AND s.collaborator_id = c.id
WHERE s.id IS NULL;

-- Ajustes opcionais para autoescala (se colunas existirem no schema atual)
SET @has_gender := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'collaborators'
      AND COLUMN_NAME = 'gender'
);

SET @has_weekday_end := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'collaborators'
      AND COLUMN_NAME = 'weekday_shift_end'
);

SET @sql_gender := IF(
    @has_gender > 0,
    "UPDATE collaborators
     SET gender = CASE UPPER(name)
         WHEN 'AGATA' THEN 'F'
         WHEN 'ANA LUIZA' THEN 'F'
         WHEN 'LUANNA' THEN 'F'
         ELSE gender
     END",
    "SELECT 1"
);
PREPARE stmt_gender FROM @sql_gender;
EXECUTE stmt_gender;
DEALLOCATE PREPARE stmt_gender;

SET @sql_weekday_end := IF(
    @has_weekday_end > 0,
    "UPDATE collaborators
     SET weekday_shift_end = CASE UPPER(name)
         WHEN 'PEDRO' THEN '22:00:00'
         WHEN 'ANA LUIZA' THEN '22:00:00'
         WHEN 'LUANNA' THEN '22:00:00'
         WHEN 'CARLOS' THEN '20:40:00'
         WHEN 'JOÃO' THEN '14:20:00'
         WHEN 'JO?O' THEN '14:20:00'
         WHEN 'AGATA' THEN '14:20:00'
         WHEN 'RYAN' THEN '15:40:00'
         WHEN 'LEONNE' THEN '17:00:00'
         ELSE weekday_shift_end
     END",
    "SELECT 1"
);
PREPARE stmt_weekday_end FROM @sql_weekday_end;
EXECUTE stmt_weekday_end;
DEALLOCATE PREPARE stmt_weekday_end;
