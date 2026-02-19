<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

function validate_shift_rows(PDO $pdo, array $rows): array
{
    $errors = [];
    $cleanRows = [];
    $seenCollaborators = [];

    if (count($rows) === 0) {
        $errors[] = 'Adicione pelo menos 1 linha de escala.';
        return ['valid' => false, 'errors' => $errors, 'rows' => []];
    }

    $collaboratorStmt = $pdo->prepare(
        'SELECT id, team_id, is_active
         FROM collaborators
         WHERE id = :id'
    );

    foreach ($rows as $index => $row) {
        $line = $index + 1;

        $teamId = isset($row['team_id']) ? (int) $row['team_id'] : 0;
        $collaboratorId = isset($row['collaborator_id']) ? (int) $row['collaborator_id'] : 0;
        $shiftStart = normalize_time($row['shift_start'] ?? null);
        $shiftEnd = normalize_time($row['shift_end'] ?? null);
        $break10_1 = normalize_time($row['break_10_1'] ?? null);
        $break20 = normalize_time($row['break_20'] ?? null);
        $break10_2 = normalize_time($row['break_10_2'] ?? null);

        if ($teamId <= 0 || $collaboratorId <= 0 || !$shiftStart || !$shiftEnd || !$break10_1 || !$break20 || !$break10_2) {
            $errors[] = "Linha {$line}: todos os campos sao obrigatorios (incluindo as 3 pausas).";
            continue;
        }

        $startMin = time_to_minutes($shiftStart);
        $endMin = time_to_minutes($shiftEnd);
        $b1Min = time_to_minutes($break10_1);
        $b20Min = time_to_minutes($break20);
        $b2Min = time_to_minutes($break10_2);

        if ($startMin === null || $endMin === null || $b1Min === null || $b20Min === null || $b2Min === null) {
            $errors[] = "Linha {$line}: horario invalido.";
            continue;
        }

        if ($endMin <= $startMin) {
            $errors[] = "Linha {$line}: fim do turno deve ser maior que o inicio.";
        }

        if (!($startMin < $b1Min && $b1Min < $endMin) || !($startMin < $b20Min && $b20Min < $endMin) || !($startMin < $b2Min && $b2Min < $endMin)) {
            $errors[] = "Linha {$line}: pausas devem estar dentro do turno.";
        }

        if (!($b1Min < $b20Min && $b20Min < $b2Min)) {
            $errors[] = "Linha {$line}: pausas devem estar em ordem (pausa_10_1 < pausa_20 < pausa_10_2).";
        }

        if (isset($seenCollaborators[$collaboratorId])) {
            $errors[] = "Linha {$line}: colaborador repetido no mesmo evento.";
        }
        $seenCollaborators[$collaboratorId] = true;

        $collaboratorStmt->execute(['id' => $collaboratorId]);
        $collaborator = $collaboratorStmt->fetch();

        if (!$collaborator) {
            $errors[] = "Linha {$line}: colaborador nao encontrado.";
            continue;
        }

        if ((int) $collaborator['is_active'] !== 1) {
            $errors[] = "Linha {$line}: colaborador inativo.";
        }

        if ((int) $collaborator['team_id'] !== $teamId) {
            $errors[] = "Linha {$line}: colaborador nao pertence a equipe selecionada.";
        }

        $cleanRows[] = [
            'team_id' => $teamId,
            'collaborator_id' => $collaboratorId,
            'shift_start' => $shiftStart,
            'shift_end' => $shiftEnd,
            'break_10_1' => $break10_1,
            'break_20' => $break20,
            'break_10_2' => $break10_2,
        ];
    }

    return ['valid' => count($errors) === 0, 'errors' => $errors, 'rows' => $cleanRows];
}

