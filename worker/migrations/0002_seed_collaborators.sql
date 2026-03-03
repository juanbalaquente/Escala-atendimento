-- Seed inicial de colaboradores (idempotente)

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'LEONNE', t.id, 1, 'N', '17:00:00', NULL
FROM teams t
WHERE t.code = 'ANALISTA'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'LEONNE' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'PEDRO', t.id, 1, 'N', '22:00:00', NULL
FROM teams t
WHERE t.code = 'ANALISTA'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'PEDRO' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'JOAO', t.id, 1, 'N', '14:20:00', 'A'
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'JOAO' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'ARTHUR', t.id, 1, 'N', '14:20:00', NULL
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'ARTHUR' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'AGATA', t.id, 1, 'F', '14:20:00', 'A'
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'AGATA' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'RYAN', t.id, 1, 'N', '15:40:00', 'A'
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'RYAN' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'CARLOS', t.id, 1, 'N', '20:40:00', 'B'
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'CARLOS' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'ANA LUIZA', t.id, 1, 'F', '22:00:00', 'B'
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'ANA LUIZA' AND c.team_id = t.id
  );

INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end, rotation_group)
SELECT 'LUANNA', t.id, 1, 'F', '22:00:00', 'B'
FROM teams t
WHERE t.code = 'SUPORTE_N1'
  AND NOT EXISTS (
    SELECT 1
    FROM collaborators c
    WHERE c.name = 'LUANNA' AND c.team_id = t.id
  );

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
