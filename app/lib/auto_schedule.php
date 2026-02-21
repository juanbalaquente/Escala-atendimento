<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

function generate_auto_schedule(PDO $pdo, int $eventId): array
{
    $eventStmt = $pdo->prepare('SELECT id, event_date FROM events WHERE id = :id');
    $eventStmt->execute(['id' => $eventId]);
    $event = $eventStmt->fetch();

    if (!$event) {
        throw new RuntimeException('Evento nao encontrado.');
    }

    $eventDate = (string) $event['event_date'];
    $weekday = (int) (new DateTimeImmutable($eventDate))->format('N');
    if ($weekday !== 6 && $weekday !== 7) {
        throw new RuntimeException('Geracao automatica disponivel apenas para sabado e domingo.');
    }

    $teamStmt = $pdo->query("SELECT id, code FROM teams WHERE code IN ('ANALISTA', 'SUPORTE_N1')");
    $teamRows = $teamStmt->fetchAll();
    $teamByCode = [];
    foreach ($teamRows as $teamRow) {
        $teamByCode[(string) $teamRow['code']] = (int) $teamRow['id'];
    }

    if (!isset($teamByCode['ANALISTA'], $teamByCode['SUPORTE_N1'])) {
        throw new RuntimeException('Equipes ANALISTA e SUPORTE_N1 sao obrigatorias.');
    }

    $hasGender = collaborators_has_column($pdo, 'gender');
    $hasWeekdayEnd = collaborators_has_column($pdo, 'weekday_shift_end');

    $activeStmt = $pdo->prepare(
        'SELECT id, name, team_id'
        . ($hasGender ? ', gender' : '')
        . ($hasWeekdayEnd ? ', weekday_shift_end' : '')
        . '
         FROM collaborators
         WHERE is_active = 1 AND team_id IN (:analista_id, :n1_id)
         ORDER BY id'
    );
    $activeStmt->execute([
        'analista_id' => $teamByCode['ANALISTA'],
        'n1_id' => $teamByCode['SUPORTE_N1'],
    ]);

    $analysts = [];
    $n1 = [];

    foreach ($activeStmt->fetchAll() as $person) {
        $entry = [
            'id' => (int) $person['id'],
            'name' => (string) $person['name'],
            'gender' => $hasGender ? (string) ($person['gender'] ?? 'N') : 'N',
            'weekday_shift_end' => $hasWeekdayEnd ? normalize_time((string) ($person['weekday_shift_end'] ?? '')) : null,
        ];

        if ((int) $person['team_id'] === $teamByCode['ANALISTA']) {
            $analysts[] = $entry;
        } elseif ((int) $person['team_id'] === $teamByCode['SUPORTE_N1']) {
            $n1[] = $entry;
        }
    }

    if ($weekday === 6 && count($analysts) < 1) {
        throw new RuntimeException('Nao ha analistas ativos para escalar no sabado.');
    }

    $requiredN1 = $weekday === 6 ? 5 : 2;
    if (count($n1) < $requiredN1) {
        throw new RuntimeException("Necessario ao menos {$requiredN1} colaboradores ativos de SUPORTE_N1.");
    }

    $usage = load_usage_stats($pdo, $eventDate);
    $rows = [];
    $usedIds = [];
    $blockedByAdjacentEvent = load_blocked_adjacent_weekend_ids($pdo, $eventDate, $weekday);

    if ($weekday === 6) {
        $analyst = pick_rotating_analyst($pdo, $analysts, $eventDate, $teamByCode['ANALISTA'], $blockedByAdjacentEvent);
        $rows[] = [
            'team_id' => $teamByCode['ANALISTA'],
            'collaborator_id' => $analyst['id'],
            'shift_start' => '09:00:00',
            'shift_end' => '18:00:00',
            'break_10_1' => '10:40:00',
            'break_20' => '13:00:00',
            'break_10_2' => '16:00:00',
        ];

        $slots = [
            ['shift_start' => '08:00:00', 'shift_end' => '14:20:00', 'break_10_1' => '09:20:00', 'break_20' => '11:10:00', 'break_10_2' => '12:40:00', 'kind' => 'early'],
            ['shift_start' => '08:00:00', 'shift_end' => '14:20:00', 'break_10_1' => '09:40:00', 'break_20' => '11:30:00', 'break_10_2' => '12:50:00', 'kind' => 'early'],
            ['shift_start' => '09:00:00', 'shift_end' => '15:40:00', 'break_10_1' => '10:20:00', 'break_20' => '12:10:00', 'break_10_2' => '14:20:00', 'kind' => 'early'],
            ['shift_start' => '14:20:00', 'shift_end' => '20:40:00', 'break_10_1' => '15:40:00', 'break_20' => '17:30:00', 'break_10_2' => '19:20:00', 'kind' => 'late'],
            ['shift_start' => '15:40:00', 'shift_end' => '22:00:00', 'break_10_1' => '16:40:00', 'break_20' => '18:30:00', 'break_10_2' => '20:20:00', 'kind' => 'late'],
        ];

        foreach ($slots as $slot) {
            $person = pick_n1_for_slot($n1, $usedIds, $blockedByAdjacentEvent, $usage, $slot['kind'], $slot['shift_start']);
            $usedIds[$person['id']] = true;
            $rows[] = [
                'team_id' => $teamByCode['SUPORTE_N1'],
                'collaborator_id' => $person['id'],
                'shift_start' => $slot['shift_start'],
                'shift_end' => $slot['shift_end'],
                'break_10_1' => $slot['break_10_1'],
                'break_20' => $slot['break_20'],
                'break_10_2' => $slot['break_10_2'],
            ];
        }
    } else {
        $blockedSunday = load_blocked_sunday_ids($pdo, $eventDate, $blockedByAdjacentEvent);
        $blockedMorning = load_blocked_sunday_morning_ids($pdo, $eventDate, $blockedSunday);
        $sundayUsage = load_sunday_usage_stats($pdo, $eventDate);

        $morning = pick_n1_for_slot($n1, $usedIds, $blockedMorning, $usage, 'early', '08:00:00', $sundayUsage);
        $usedIds[$morning['id']] = true;
        $rows[] = [
            'team_id' => $teamByCode['SUPORTE_N1'],
            'collaborator_id' => $morning['id'],
            'shift_start' => '08:00:00',
            'shift_end' => '14:20:00',
            'break_10_1' => '09:20:00',
            'break_20' => '11:10:00',
            'break_10_2' => '12:40:00',
        ];

        $afternoon = pick_n1_for_slot($n1, $usedIds, $blockedSunday, $usage, 'regular', '10:40:00', $sundayUsage);
        $rows[] = [
            'team_id' => $teamByCode['SUPORTE_N1'],
            'collaborator_id' => $afternoon['id'],
            'shift_start' => '10:40:00',
            'shift_end' => '17:00:00',
            'break_10_1' => '12:00:00',
            'break_20' => '13:50:00',
            'break_10_2' => '15:40:00',
        ];
    }

    $pdo->beginTransaction();
    try {
        $deleteStmt = $pdo->prepare('DELETE FROM shifts WHERE event_id = :event_id');
        $deleteStmt->execute(['event_id' => $eventId]);

        $insertStmt = $pdo->prepare(
            'INSERT INTO shifts (event_id, team_id, collaborator_id, shift_start, shift_end, break_10_1, break_20, break_10_2)
             VALUES (:event_id, :team_id, :collaborator_id, :shift_start, :shift_end, :break_10_1, :break_20, :break_10_2)'
        );

        foreach ($rows as $row) {
            $insertStmt->execute([
                'event_id' => $eventId,
                'team_id' => $row['team_id'],
                'collaborator_id' => $row['collaborator_id'],
                'shift_start' => $row['shift_start'],
                'shift_end' => $row['shift_end'],
                'break_10_1' => $row['break_10_1'],
                'break_20' => $row['break_20'],
                'break_10_2' => $row['break_10_2'],
            ]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    return [
        'created' => count($rows),
        'message' => 'Escala automatica gerada com sucesso.',
    ];
}

function collaborators_has_column(PDO $pdo, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS cnt
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = :table_name
           AND column_name = :column_name'
    );
    $stmt->execute([
        'table_name' => 'collaborators',
        'column_name' => $column,
    ]);
    return (int) $stmt->fetchColumn() > 0;
}

function load_usage_stats(PDO $pdo, string $eventDate): array
{
    $stmt = $pdo->prepare(
        'SELECT s.collaborator_id, COUNT(*) AS shifts_count
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date < :event_date
         GROUP BY s.collaborator_id'
    );
    $stmt->execute(['event_date' => $eventDate]);

    $usage = [];
    foreach ($stmt->fetchAll() as $row) {
        $usage[(int) $row['collaborator_id']] = (int) $row['shifts_count'];
    }

    return $usage;
}

function pick_rotating_analyst(PDO $pdo, array $analysts, string $eventDate, int $analystTeamId, array $blockedIds): array
{
    usort($analysts, static fn (array $a, array $b): int => $a['id'] <=> $b['id']);
    $eligible = array_values(array_filter($analysts, static fn (array $a): bool => !isset($blockedIds[$a['id']])));
    if (count($eligible) === 0) {
        throw new RuntimeException('Nao ha analista elegivel para este sabado devido ao rodizio com domingo.');
    }

    $stmt = $pdo->prepare(
        'SELECT s.collaborator_id
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date < :event_date
           AND DAYOFWEEK(e.event_date) = 7
           AND s.team_id = :team_id
           AND s.shift_start = "09:00:00"
           AND s.shift_end = "18:00:00"
         ORDER BY e.event_date DESC, s.id DESC
         LIMIT 1'
    );
    $stmt->execute([
        'event_date' => $eventDate,
        'team_id' => $analystTeamId,
    ]);

    $last = $stmt->fetch();
    if (!$last) {
        return $eligible[0];
    }

    $lastId = (int) $last['collaborator_id'];
    $indexById = [];
    foreach ($eligible as $idx => $analyst) {
        $indexById[$analyst['id']] = $idx;
    }

    if (!isset($indexById[$lastId])) {
        return $eligible[0];
    }

    $nextIndex = ($indexById[$lastId] + 1) % count($eligible);
    return $eligible[$nextIndex];
}

function load_blocked_sunday_morning_ids(PDO $pdo, string $eventDate, array $initialBlocked): array
{
    $saturdayDate = (new DateTimeImmutable($eventDate))->modify('-1 day')->format('Y-m-d');

    $stmt = $pdo->prepare(
        'SELECT DISTINCT s.collaborator_id
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date = :saturday_date
           AND s.shift_start = "15:40:00"
           AND s.shift_end = "22:00:00"'
    );
    $stmt->execute(['saturday_date' => $saturdayDate]);

    $blocked = $initialBlocked;
    foreach ($stmt->fetchAll() as $row) {
        $blocked[(int) $row['collaborator_id']] = true;
    }

    return $blocked;
}

function load_blocked_adjacent_weekend_ids(PDO $pdo, string $eventDate, int $weekday): array
{
    if ($weekday === 6) {
        $adjacentDate = (new DateTimeImmutable($eventDate))->modify('+1 day')->format('Y-m-d');
    } else {
        $adjacentDate = (new DateTimeImmutable($eventDate))->modify('-1 day')->format('Y-m-d');
    }

    $stmt = $pdo->prepare(
        'SELECT DISTINCT s.collaborator_id
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date = :adjacent_date'
    );
    $stmt->execute(['adjacent_date' => $adjacentDate]);

    $blocked = [];
    foreach ($stmt->fetchAll() as $row) {
        $blocked[(int) $row['collaborator_id']] = true;
    }

    return $blocked;
}

function load_blocked_sunday_ids(PDO $pdo, string $eventDate, array $initialBlocked): array
{
    $saturdayDate = (new DateTimeImmutable($eventDate))->modify('-1 day')->format('Y-m-d');
    $blockedAfterThree = load_blocked_after_three_consecutive_sundays($pdo, $eventDate);

    $stmt = $pdo->prepare(
        'SELECT DISTINCT s.collaborator_id
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date = :saturday_date'
    );
    $stmt->execute(['saturday_date' => $saturdayDate]);

    $blocked = $initialBlocked;
    foreach ($blockedAfterThree as $collaboratorId => $isBlocked) {
        if ($isBlocked) {
            $blocked[$collaboratorId] = true;
        }
    }
    foreach ($stmt->fetchAll() as $row) {
        $blocked[(int) $row['collaborator_id']] = true;
    }

    return $blocked;
}

function load_blocked_after_three_consecutive_sundays(PDO $pdo, string $eventDate): array
{
    $base = new DateTimeImmutable($eventDate);
    $d1 = $base->modify('-7 day')->format('Y-m-d');
    $d2 = $base->modify('-14 day')->format('Y-m-d');
    $d3 = $base->modify('-21 day')->format('Y-m-d');

    $stmt = $pdo->prepare(
        'SELECT s.collaborator_id, COUNT(DISTINCT e.event_date) AS cnt
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date IN (:d1, :d2, :d3)
         GROUP BY s.collaborator_id
         HAVING cnt = 3'
    );
    $stmt->execute([
        'd1' => $d1,
        'd2' => $d2,
        'd3' => $d3,
    ]);

    $blocked = [];
    foreach ($stmt->fetchAll() as $row) {
        $blocked[(int) $row['collaborator_id']] = true;
    }

    return $blocked;
}

function load_sunday_usage_stats(PDO $pdo, string $eventDate): array
{
    $stmt = $pdo->prepare(
        'SELECT s.collaborator_id, COUNT(*) AS sunday_count
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date < :event_date
           AND DAYOFWEEK(e.event_date) = 1
         GROUP BY s.collaborator_id'
    );
    $stmt->execute(['event_date' => $eventDate]);

    $usage = [];
    foreach ($stmt->fetchAll() as $row) {
        $usage[(int) $row['collaborator_id']] = (int) $row['sunday_count'];
    }

    return $usage;
}

function pick_n1_for_slot(
    array $candidates,
    array $usedIds,
    array $blockedIds,
    array $usage,
    string $slotKind,
    string $slotStart,
    array $sundayUsage = []
): array
{
    $best = null;
    $bestScore = PHP_INT_MAX;

    foreach ($candidates as $candidate) {
        $id = (int) $candidate['id'];
        if (isset($usedIds[$id]) || isset($blockedIds[$id])) {
            continue;
        }

        $weekdayEnd = (string) ($candidate['weekday_shift_end'] ?? '');
        if ($weekdayEnd !== '' && $weekdayEnd >= '22:00:00' && $slotStart < '09:20:00') {
            continue;
        }

        $score = ($usage[$id] ?? 0) * 100;
        $gender = strtoupper((string) ($candidate['gender'] ?? 'N'));

        if ($slotKind === 'early') {
            if ($gender === 'F') {
                $score -= 15;
            }
        } elseif ($slotKind === 'late') {
            if ($gender === 'F') {
                $score += 15;
            }
        }

        if (isset($sundayUsage[$id])) {
            $score += $sundayUsage[$id] * 40;
        }

        $score += $id;

        if ($score < $bestScore) {
            $best = $candidate;
            $bestScore = $score;
        }
    }

    if ($best === null) {
        if ($slotKind === 'early' && count($blockedIds) > 0) {
            throw new RuntimeException('Nao ha colaborador elegivel para este turno por causa das restricoes de sabado/domingo ou expediente semanal.');
        }
        throw new RuntimeException('Nao foi possivel completar a escala automatica com os colaboradores ativos.');
    }

    return $best;
}
