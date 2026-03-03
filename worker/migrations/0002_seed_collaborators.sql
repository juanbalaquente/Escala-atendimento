-- Seed inicial de colaboradores (idempotente)

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT src.name, t.id, 1, src.gender, src.weekday_shift_end, src.rotation_group
FROM (
  SELECT 'LEONNE' AS name, 'ANALISTA' AS team_code, 'N' AS gender, '17:00:00' AS weekday_shift_end, NULL AS rotation_group
  UNION ALL SELECT 'PEDRO', 'ANALISTA', 'N', '22:00:00', NULL
  UNION ALL SELECT 'JOAO', 'SUPORTE_N1', 'N', '14:20:00', 'A'
  UNION ALL SELECT 'ARTHUR', 'SUPORTE_N1', 'N', '14:20:00', NULL
  UNION ALL SELECT 'AGATA', 'SUPORTE_N1', 'F', '14:20:00', 'A'
  UNION ALL SELECT 'RYAN', 'SUPORTE_N1', 'N', '15:40:00', 'A'
  UNION ALL SELECT 'CARLOS', 'SUPORTE_N1', 'N', '20:40:00', 'B'
  UNION ALL SELECT 'ANA LUIZA', 'SUPORTE_N1', 'F', '22:00:00', 'B'
  UNION ALL SELECT 'LUANNA', 'SUPORTE_N1', 'F', '22:00:00', 'B'
) src
INNER JOIN teams t ON t.code = src.team_code
LEFT JOIN collaborators c ON c.name = src.name AND c.team_id = t.id
WHERE c.id IS NULL;

-- Atualiza dados de expediente/atributos caso os colaboradores ja existam
UPDATE collaborators
SET
  weekday_shift_end = CASE UPPER(name)
    WHEN 'LEONNE' THEN '17:00:00'
    WHEN 'PEDRO' THEN '22:00:00'
    WHEN 'JOAO' THEN '14:20:00'
    WHEN 'ARTHUR' THEN '14:20:00'
    WHEN 'AGATA' THEN '14:20:00'
    WHEN 'RYAN' THEN '15:40:00'
    WHEN 'CARLOS' THEN '20:40:00'
    WHEN 'ANA LUIZA' THEN '22:00:00'
    WHEN 'LUANNA' THEN '22:00:00'
    ELSE weekday_shift_end
  END,
  gender = CASE UPPER(name)
    WHEN 'AGATA' THEN 'F'
    WHEN 'ANA LUIZA' THEN 'F'
    WHEN 'LUANNA' THEN 'F'
    ELSE gender
  END,
  rotation_group = CASE UPPER(name)
    WHEN 'JOAO' THEN 'A'
    WHEN 'AGATA' THEN 'A'
    WHEN 'RYAN' THEN 'A'
    WHEN 'CARLOS' THEN 'B'
    WHEN 'ANA LUIZA' THEN 'B'
    WHEN 'LUANNA' THEN 'B'
    ELSE rotation_group
  END
WHERE UPPER(name) IN ('LEONNE', 'PEDRO', 'JOAO', 'ARTHUR', 'AGATA', 'RYAN', 'CARLOS', 'ANA LUIZA', 'LUANNA');
