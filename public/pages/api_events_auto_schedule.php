<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../app/config/db.php';
require_once __DIR__ . '/../../app/lib/auto_schedule.php';

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode((string) $raw, true);
    if (!is_array($payload)) {
        throw new RuntimeException('Payload invalido.');
    }

    $eventId = (int) ($payload['event_id'] ?? 0);
    if ($eventId <= 0) {
        throw new RuntimeException('Evento invalido.');
    }

    $result = generate_auto_schedule(db(), $eventId);

    echo json_encode([
        'success' => true,
        'created' => $result['created'],
        'message' => $result['message'],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}
