<?php

declare(strict_types=1);

session_start();

require_once __DIR__ . '/../app/config/db.php';
require_once __DIR__ . '/../app/lib/helpers.php';

$allowedPages = [
    'dashboard',
    'collaborators',
    'events',
    'event_edit',
    'event_print',
    'api_validate',
    'api_events_generate_weekends',
    'api_events_auto_schedule',
];

$page = $_GET['page'] ?? 'dashboard';
if (!in_array($page, $allowedPages, true)) {
    $page = 'dashboard';
}

if (str_starts_with($page, 'api_')) {
    require __DIR__ . '/pages/' . $page . '.php';
    exit;
}

$pdo = db();
$flash = get_flash();

require __DIR__ . '/pages/_header.php';
require __DIR__ . '/pages/' . $page . '.php';
require __DIR__ . '/pages/_footer.php';

