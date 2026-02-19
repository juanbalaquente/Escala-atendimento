<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../app/config/db.php';
require_once __DIR__ . '/../../app/lib/validate.php';

try {
    $raw = file_get_contents('php://input');
    $payload = json_decode((string) $raw, true);

    if (!is_array($payload)) {
        throw new RuntimeException('Payload invalido.');
    }

    $rows = $payload['rows'] ?? [];
    if (!is_array($rows)) {
        throw new RuntimeException('Rows invalido.');
    }

    $result = validate_shift_rows(db(), $rows);

    echo json_encode([
        'valid' => $result['valid'],
        'errors' => $result['errors'],
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'valid' => false,
        'errors' => [$e->getMessage()],
    ], JSON_UNESCAPED_UNICODE);
}

