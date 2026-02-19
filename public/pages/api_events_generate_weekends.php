<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../app/config/db.php';

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode((string) $raw, true);

    if (!is_array($payload)) {
        throw new RuntimeException('Payload invalido.');
    }

    $month = $payload['month'] ?? '';
    if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $month)) {
        throw new RuntimeException('Mes invalido. Use formato YYYY-MM.');
    }

    [$year, $monthNum] = array_map('intval', explode('-', $month));
    $date = new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $monthNum));
    $lastDay = (int) $date->format('t');

    $pdo = db();
    $insertStmt = $pdo->prepare('INSERT INTO events (type, event_date, label) VALUES (:type, :event_date, :label)');

    $created = 0;
    $ignored = 0;

    for ($day = 1; $day <= $lastDay; $day++) {
        $current = new DateTimeImmutable(sprintf('%04d-%02d-%02d', $year, $monthNum, $day));
        $weekday = (int) $current->format('N');

        if ($weekday !== 6 && $weekday !== 7) {
            continue;
        }

        $label = sprintf('%02d - %s', $day, $weekday === 6 ? 'Sabado' : 'Domingo');

        try {
            $insertStmt->execute([
                'type' => 'FDS',
                'event_date' => $current->format('Y-m-d'),
                'label' => $label,
            ]);
            $created++;
        } catch (PDOException $e) {
            if ($e->errorInfo[1] === 1062) {
                $ignored++;
            } else {
                throw $e;
            }
        }
    }

    echo json_encode([
        'success' => true,
        'created' => $created,
        'ignored' => $ignored,
        'message' => "Geracao concluida: {$created} criados, {$ignored} ja existentes.",
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

