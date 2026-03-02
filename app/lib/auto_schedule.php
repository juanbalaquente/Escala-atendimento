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
    $hasRotationGroup = collaborators_has_column($pdo, 'rotation_group');

    $activeStmt = $pdo->prepare(
        'SELECT id, name, team_id'
        . ($hasGender ? ', gender' : '')
        . ($hasWeekdayEnd ? ', weekday_shift_end' : '')
        . ($hasRotationGroup ? ', rotation_group' : '')
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
            'rotation_group' => resolve_rotation_group((int) $person['id'], (string) $person['name'], (string) ($person['rotation_group'] ?? ''), $hasRotationGroup),
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
        $reservedForSunday = predict_reserved_ids_for_sunday($pdo, $eventDate, $n1, $usage, $blockedByAdjacentEvent, 5);
        $blockedSaturday = merge_blocked_ids($blockedByAdjacentEvent, $reservedForSunday);
        $eligibleSaturdayCount = count_available_candidates($n1, $blockedSaturday);
        if ($eligibleSaturdayCount < 5) {
            throw new RuntimeException(
                "Escala de sabado inviavel com as regras atuais: necessario 5 N1 elegiveis, mas ha {$eligibleSaturdayCount}. " .
                "A regra 'quem trabalha domingo nao trabalha sabado' bloqueou parte do time. Ative mais colaboradores ou flexibilize a regra."
            );
        }

        $reservedForNight = reserve_non_female_for_night_slots($n1, $blockedSaturday, $usage, 3, 2);

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

        // Prioriza turnos mais restritivos primeiro (08:00), depois fechamento.
        $slots = [
            ['shift_start' => '08:00:00', 'shift_end' => '14:20:00', 'break_10_1' => '09:20:00', 'break_20' => '11:10:00', 'break_10_2' => '12:40:00', 'kind' => 'early'],
            ['shift_start' => '08:00:00', 'shift_end' => '14:20:00', 'break_10_1' => '09:40:00', 'break_20' => '11:30:00', 'break_10_2' => '12:50:00', 'kind' => 'early'],
            [
                'shift_start' => '09:00:00',
                'shift_end' => '15:40:00',
                'break_10_1' => '10:20:00',
                'break_20' => '12:10:00',
                'break_10_2' => '14:20:00',
                'kind' => 'early',
                'allow_start_0920_fallback' => true,
                'fallback_shift_start' => '09:20:00',
                'fallback_break_10_1' => '10:40:00',
                'fallback_break_20' => '12:10:00',
                'fallback_break_10_2' => '14:30:00',
            ],
            ['shift_start' => '15:40:00', 'shift_end' => '22:00:00', 'break_10_1' => '16:40:00', 'break_20' => '18:30:00', 'break_10_2' => '20:20:00', 'kind' => 'last'],
            ['shift_start' => '14:20:00', 'shift_end' => '20:40:00', 'break_10_1' => '15:40:00', 'break_20' => '17:30:00', 'break_10_2' => '19:20:00', 'kind' => 'late'],
        ];

        foreach ($slots as $slotIndex => $slot) {
            $slotStartForRule = $slot['shift_start'];
            $slotStartToSave = $slot['shift_start'];
            $break101ToSave = $slot['break_10_1'];
            $break20ToSave = $slot['break_20'];
            $break102ToSave = $slot['break_10_2'];
            $blockedForThisSlot = $blockedSaturday;
            if (!in_array((string) ($slot['kind'] ?? ''), ['late', 'last'], true) && count($reservedForNight) > 0) {
                $blockedForThisSlot = merge_blocked_ids($blockedForThisSlot, $reservedForNight);
            }

            try {
                $person = pick_n1_for_slot(
                    $n1,
                    $usedIds,
                    $blockedForThisSlot,
                    $usage,
                    $slot['kind'],
                    $slotStartForRule,
                    [],
                    $eventDate,
                    (int) $slotIndex
                );
            } catch (RuntimeException $e) {
                $allowFallback = (bool) ($slot['allow_start_0920_fallback'] ?? false);
                if (!$allowFallback) {
                    throw $e;
                }

                $slotStartForRule = (string) ($slot['fallback_shift_start'] ?? '09:20:00');
                $slotStartToSave = $slotStartForRule;
                $break101ToSave = (string) ($slot['fallback_break_10_1'] ?? $break101ToSave);
                $break20ToSave = (string) ($slot['fallback_break_20'] ?? $break20ToSave);
                $break102ToSave = (string) ($slot['fallback_break_10_2'] ?? $break102ToSave);
                $person = pick_n1_for_slot(
                    $n1,
                    $usedIds,
                    $blockedForThisSlot,
                    $usage,
                    $slot['kind'],
                    $slotStartForRule,
                    [],
                    $eventDate,
                    (int) $slotIndex
                );
            }

            $usedIds[$person['id']] = true;
            $rows[] = [
                'team_id' => $teamByCode['SUPORTE_N1'],
                'collaborator_id' => $person['id'],
                'shift_start' => $slotStartToSave,
                'shift_end' => $slot['shift_end'],
                'break_10_1' => $break101ToSave,
                'break_20' => $break20ToSave,
                'break_10_2' => $break102ToSave,
            ];
        }
    } else {
        $activeSundayGroup = resolve_active_sunday_group($pdo, $eventDate, $n1);
        $sundayPool = array_values(array_filter(
            $n1,
            static fn (array $person): bool => (string) ($person['rotation_group'] ?? 'A') === $activeSundayGroup
        ));
        if (count($sundayPool) < 2) {
            // Fallback: se o grupo ativo nao tiver 2 pessoas, amplia para todo o pool N1.
            $sundayPool = $n1;
        }

        $blockedSunday = load_blocked_sunday_ids($pdo, $eventDate, $blockedByAdjacentEvent);
        $blockedMorning = load_blocked_sunday_morning_ids($pdo, $eventDate, $blockedSunday);
        $sundayUsage = load_sunday_usage_stats($pdo, $eventDate);

        try {
            $morning = pick_n1_for_slot(
                $sundayPool,
                $usedIds,
                $blockedMorning,
                $usage,
                'early',
                '08:00:00',
                $sundayUsage,
                $eventDate,
                0
            );
        } catch (RuntimeException $e) {
            try {
                // Relaxa apenas restricao do turno da manha.
                $morning = pick_n1_for_slot(
                    $sundayPool,
                    $usedIds,
                    $blockedSunday,
                    $usage,
                    'early',
                    '08:00:00',
                    $sundayUsage,
                    $eventDate,
                    0
                );
            } catch (RuntimeException $e2) {
                // Ultimo fallback: ignora bloqueios do sabado para nao travar geracao.
                $morning = pick_n1_for_slot(
                    $n1,
                    $usedIds,
                    [],
                    $usage,
                    'early',
                    '08:00:00',
                    $sundayUsage,
                    $eventDate,
                    0
                );
            }
        }
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

        try {
            $afternoon = pick_n1_for_slot(
                $sundayPool,
                $usedIds,
                $blockedSunday,
                $usage,
                'last',
                '10:40:00',
                $sundayUsage,
                $eventDate,
                1
            );
        } catch (RuntimeException $e) {
            // Fallback final para garantir preenchimento de domingo.
            $afternoon = pick_n1_for_slot(
                $n1,
                $usedIds,
                [],
                $usage,
                'last',
                '10:40:00',
                $sundayUsage,
                $eventDate,
                1
            );
        }
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

function merge_blocked_ids(array $a, array $b): array
{
    $merged = [];
    foreach ($a as $id => $blocked) {
        if ($blocked) {
            $merged[(int) $id] = true;
        }
    }
    foreach ($b as $id => $blocked) {
        if ($blocked) {
            $merged[(int) $id] = true;
        }
    }
    return $merged;
}

function count_available_candidates(array $candidates, array $blockedIds): int
{
    $count = 0;
    foreach ($candidates as $candidate) {
        $id = (int) ($candidate['id'] ?? 0);
        if ($id > 0 && !isset($blockedIds[$id])) {
            $count++;
        }
    }
    return $count;
}

function reserve_non_female_for_night_slots(
    array $candidates,
    array $blockedIds,
    array $usage,
    int $requiredBeforeNight,
    int $nightSlotsCount
): array
{
    $eligibleNightCandidates = [];
    foreach ($candidates as $candidate) {
        $id = (int) ($candidate['id'] ?? 0);
        if ($id <= 0 || isset($blockedIds[$id])) {
            continue;
        }
        $gender = strtoupper((string) ($candidate['gender'] ?? 'N'));
        if ($gender === 'F') {
            continue;
        }
        $eligibleNightCandidates[] = $candidate;
    }

    if (count($eligibleNightCandidates) === 0 || $nightSlotsCount <= 0) {
        return [];
    }

    usort($eligibleNightCandidates, static function (array $a, array $b) use ($usage): int {
        $aScore = (($usage[(int) $a['id']] ?? 0) * 100) + (int) $a['id'];
        $bScore = (($usage[(int) $b['id']] ?? 0) * 100) + (int) $b['id'];
        return $aScore <=> $bScore;
    });

    $reserved = [];
    foreach ($eligibleNightCandidates as $candidate) {
        if (count($reserved) >= $nightSlotsCount) {
            break;
        }
        $candidateId = (int) $candidate['id'];
        $reserved[$candidateId] = true;

        // Nao reserva se isso inviabilizar os turnos anteriores aos noturnos.
        $availableAfterReserve = count_available_candidates($candidates, merge_blocked_ids($blockedIds, $reserved));
        if ($availableAfterReserve < $requiredBeforeNight) {
            unset($reserved[$candidateId]);
            break;
        }
    }

    return $reserved;
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
        $sundayAfter = (new DateTimeImmutable($eventDate))->modify('+1 day')->format('Y-m-d');
        $sundayBefore = (new DateTimeImmutable($eventDate))->modify('-6 day')->format('Y-m-d');

        $stmt = $pdo->prepare(
            'SELECT DISTINCT s.collaborator_id
             FROM shifts s
             INNER JOIN events e ON e.id = s.event_id
             WHERE e.event_date IN (:sunday_after, :sunday_before)'
        );
        $stmt->execute([
            'sunday_after' => $sundayAfter,
            'sunday_before' => $sundayBefore,
        ]);
    } else {
        $adjacentDate = (new DateTimeImmutable($eventDate))->modify('-1 day')->format('Y-m-d');
        $stmt = $pdo->prepare(
            'SELECT DISTINCT s.collaborator_id
             FROM shifts s
             INNER JOIN events e ON e.id = s.event_id
             WHERE e.event_date = :adjacent_date'
        );
        $stmt->execute(['adjacent_date' => $adjacentDate]);
    }

    $blocked = [];
    foreach ($stmt->fetchAll() as $row) {
        $blocked[(int) $row['collaborator_id']] = true;
    }

    return $blocked;
}

function load_blocked_sunday_ids(PDO $pdo, string $eventDate, array $initialBlocked): array
{
    $saturdayDate = (new DateTimeImmutable($eventDate))->modify('-1 day')->format('Y-m-d');

    $stmt = $pdo->prepare(
        'SELECT DISTINCT s.collaborator_id
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         WHERE e.event_date = :saturday_date'
    );
    $stmt->execute(['saturday_date' => $saturdayDate]);

    $blocked = $initialBlocked;
    foreach ($stmt->fetchAll() as $row) {
        $blocked[(int) $row['collaborator_id']] = true;
    }

    return $blocked;
}

function resolve_rotation_group(int $id, string $name, string $rawGroup, bool $hasRotationGroup): string
{
    if ($hasRotationGroup) {
        $normalized = strtoupper(trim($rawGroup));
        if ($normalized === 'A' || $normalized === 'B') {
            return $normalized;
        }
    }

    $firstLetter = strtoupper(substr(trim($name), 0, 1));
    if (in_array($firstLetter, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'], true)) {
        return 'A';
    }
    if (in_array($firstLetter, ['N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'], true)) {
        return 'B';
    }

    return $id % 2 === 0 ? 'A' : 'B';
}

function resolve_active_sunday_group(PDO $pdo, string $eventDate, array $n1Pool): string
{
    $allGroups = ['A', 'B'];
    $history = load_sunday_group_history($pdo, $eventDate);
    if (!$history) {
        $groupCounts = ['A' => 0, 'B' => 0];
        foreach ($n1Pool as $person) {
            $group = (string) ($person['rotation_group'] ?? 'A');
            if (!isset($groupCounts[$group])) {
                $groupCounts[$group] = 0;
            }
        }
        $groupSundayUsage = load_sunday_group_usage_stats($pdo, $eventDate, $n1Pool);
        foreach ($groupSundayUsage as $group => $count) {
            $groupCounts[$group] = $count;
        }
        if ($groupCounts['A'] === $groupCounts['B']) {
            return random_int(0, 1) === 0 ? 'A' : 'B';
        }
        return $groupCounts['A'] <= $groupCounts['B'] ? 'A' : 'B';
    }

    $lastGroup = $history[0]['group'];
    $consecutive = 0;
    foreach ($history as $item) {
        if ($item['group'] !== $lastGroup) {
            break;
        }
        $consecutive++;
    }

    if ($consecutive >= 3) {
        return $lastGroup === 'A' ? 'B' : 'A';
    }

    return in_array($lastGroup, $allGroups, true) ? $lastGroup : 'A';
}

function load_sunday_group_history(PDO $pdo, string $eventDate): array
{
    $hasRotationGroup = collaborators_has_column($pdo, 'rotation_group');
    $stmt = $pdo->prepare(
        'SELECT e.event_date'
         . ($hasRotationGroup ? ', c.rotation_group' : '')
         . ', c.id, c.name
         FROM shifts s
         INNER JOIN events e ON e.id = s.event_id
         INNER JOIN collaborators c ON c.id = s.collaborator_id
         INNER JOIN teams t ON t.id = s.team_id
         WHERE e.event_date < :event_date
           AND DAYOFWEEK(e.event_date) = 1
           AND t.code = "SUPORTE_N1"
         ORDER BY e.event_date DESC, s.id ASC'
    );
    $stmt->execute(['event_date' => $eventDate]);

    $grouped = [];
    foreach ($stmt->fetchAll() as $row) {
        $date = (string) $row['event_date'];
        $group = resolve_rotation_group(
            (int) $row['id'],
            (string) $row['name'],
            (string) ($row['rotation_group'] ?? ''),
            $hasRotationGroup
        );
        if (!isset($grouped[$date])) {
            $grouped[$date] = [];
        }
        $grouped[$date][$group] = ($grouped[$date][$group] ?? 0) + 1;
    }

    $history = [];
    foreach ($grouped as $date => $counts) {
        $groupA = $counts['A'] ?? 0;
        $groupB = $counts['B'] ?? 0;
        $history[] = [
            'date' => $date,
            'group' => $groupA >= $groupB ? 'A' : 'B',
        ];
    }

    usort($history, static fn (array $a, array $b): int => strcmp($b['date'], $a['date']));
    return $history;
}

function load_sunday_group_usage_stats(PDO $pdo, string $eventDate, array $n1Pool): array
{
    $usageByCollaborator = load_sunday_usage_stats($pdo, $eventDate);
    $groupUsage = ['A' => 0, 'B' => 0];
    foreach ($n1Pool as $person) {
        $group = (string) ($person['rotation_group'] ?? 'A');
        if (!isset($groupUsage[$group])) {
            $groupUsage[$group] = 0;
        }
        $groupUsage[$group] += (int) ($usageByCollaborator[(int) $person['id']] ?? 0);
    }

    return $groupUsage;
}

function predict_reserved_ids_for_sunday(
    PDO $pdo,
    string $saturdayDate,
    array $n1Pool,
    array $usage,
    array $alreadyBlocked,
    int $requiredSaturdaySlots
): array
{
    $sundayDate = (new DateTimeImmutable($saturdayDate))->modify('+1 day')->format('Y-m-d');
    $activeGroup = resolve_active_sunday_group($pdo, $sundayDate, $n1Pool);
    $groupPool = array_values(array_filter(
        $n1Pool,
        static fn (array $person): bool => (string) ($person['rotation_group'] ?? 'A') === $activeGroup
    ));

    if (count($groupPool) <= 2) {
        $reserved = [];
        foreach ($groupPool as $person) {
            $reserved[(int) $person['id']] = true;
        }
        return $reserved;
    }

    usort($groupPool, static function (array $a, array $b) use ($usage): int {
        $aScore = (($usage[(int) $a['id']] ?? 0) * 100) + (int) $a['id'];
        $bScore = (($usage[(int) $b['id']] ?? 0) * 100) + (int) $b['id'];
        return $aScore <=> $bScore;
    });

    $reserved = [];
    $maxReserve = 2;
    if (count($groupPool) > 0) {
        $baseScore = (($usage[(int) $groupPool[0]['id']] ?? 0) * 100) + (int) $groupPool[0]['id'];
        $window = array_values(array_filter($groupPool, static function (array $person) use ($usage, $baseScore): bool {
            $score = (($usage[(int) $person['id']] ?? 0) * 100) + (int) $person['id'];
            return $score <= ($baseScore + 15);
        }));
        if (count($window) >= $maxReserve) {
            shuffle($window);
            $window = array_slice($window, 0, $maxReserve);
            foreach ($window as $person) {
                $reserved[(int) $person['id']] = true;
            }
        } else {
            foreach ($groupPool as $person) {
                if (count($reserved) >= $maxReserve) {
                    break;
                }
                $reserved[(int) $person['id']] = true;
            }
        }
    }

    $availableForSaturday = 0;
    foreach ($n1Pool as $person) {
        $id = (int) $person['id'];
        if (isset($alreadyBlocked[$id]) || isset($reserved[$id])) {
            continue;
        }
        $availableForSaturday++;
    }

    if ($availableForSaturday < $requiredSaturdaySlots) {
        return [];
    }

    return $reserved;
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
    array $sundayUsage = [],
    string $eventDate = '',
    int $slotIndex = 0
): array
{
    $scored = [];
    $eligibleNonFemale = 0;

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
        if ($gender !== 'F') {
            $eligibleNonFemale++;
        }

        if ($slotKind === 'early') {
            if ($gender === 'F') {
                $score -= 25;
            }
        } elseif ($slotKind === 'late') {
            if ($gender === 'F') {
                $score += 50;
            }
        } elseif ($slotKind === 'last') {
            if ($gender === 'F') {
                // Forte preferencia para nao deixar mulheres no ultimo horario do dia.
                $score += 500;
            }
        }

        if (isset($sundayUsage[$id])) {
            $score += $sundayUsage[$id] * 40;
        }

        // Introduz variacao por evento/slot para evitar padrao fixo entre semanas.
        // Mantem peso de uso historico, mas desempata de forma pseudoaleatoria.
        if ($eventDate !== '') {
            $score += stable_event_jitter($eventDate, $slotKind, $slotStart, $slotIndex, $id, 61);
        } else {
            $score += random_int(0, 60);
        }

        $scored[] = [
            'candidate' => $candidate,
            'score' => $score,
        ];
    }

    if (count($scored) === 0) {
        if ($slotKind === 'early' && count($blockedIds) > 0) {
            throw new RuntimeException('Nao ha colaborador elegivel para este turno por causa das restricoes de sabado/domingo ou expediente semanal.');
        }
        throw new RuntimeException('Nao foi possivel completar a escala automatica com os colaboradores ativos.');
    }

    if (in_array($slotKind, ['late', 'last'], true) && $eligibleNonFemale > 0) {
        $scored = array_values(array_filter(
            $scored,
            static fn (array $item): bool => strtoupper((string) ($item['candidate']['gender'] ?? 'N')) !== 'F'
        ));
    }

    usort($scored, static fn (array $a, array $b): int => $a['score'] <=> $b['score']);
    $bestScore = (int) $scored[0]['score'];

    // Janela mais ampla para variar melhor entre eventos, sem perder aderencia por score.
    $window = array_values(array_filter(
        $scored,
        static fn (array $item): bool => ((int) $item['score']) <= ($bestScore + 45)
    ));

    if (count($window) < 2) {
        $window = array_slice($scored, 0, min(3, count($scored)));
    }

    $index = pick_stable_index_for_event($eventDate, $slotKind, $slotStart, $slotIndex, count($window));
    return $window[$index]['candidate'];
}

function stable_event_jitter(
    string $eventDate,
    string $slotKind,
    string $slotStart,
    int $slotIndex,
    int $collaboratorId,
    int $mod
): int {
    if ($mod <= 1) {
        return 0;
    }

    $seed = $eventDate . '|' . $slotKind . '|' . $slotStart . '|' . $slotIndex . '|' . $collaboratorId;
    $hash = hash('sha256', $seed, true);
    $chunk = unpack('N', substr($hash, 0, 4));
    $value = (int) ($chunk[1] ?? 0);

    return $value % $mod;
}

function pick_stable_index_for_event(
    string $eventDate,
    string $slotKind,
    string $slotStart,
    int $slotIndex,
    int $poolSize
): int {
    if ($poolSize <= 1) {
        return 0;
    }

    if ($eventDate === '') {
        return random_int(0, $poolSize - 1);
    }

    $seed = $eventDate . '|pick|' . $slotKind . '|' . $slotStart . '|' . $slotIndex;
    $hash = hash('sha256', $seed, true);
    $chunk = unpack('N', substr($hash, 0, 4));
    $value = (int) ($chunk[1] ?? 0);

    return $value % $poolSize;
}
