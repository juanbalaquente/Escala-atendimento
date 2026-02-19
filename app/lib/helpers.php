<?php

declare(strict_types=1);

function h(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function redirect(string $url): void
{
    header('Location: ' . $url);
    exit;
}

function set_flash(string $type, string $message): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    $_SESSION['flash'] = ['type' => $type, 'message' => $message];
}

function get_flash(): ?array
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }

    if (!isset($_SESSION['flash'])) {
        return null;
    }

    $flash = $_SESSION['flash'];
    unset($_SESSION['flash']);

    return $flash;
}

function time_to_minutes(string $time): ?int
{
    if (!preg_match('/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/', $time)) {
        return null;
    }

    $parts = explode(':', $time);
    $hour = (int) $parts[0];
    $minute = (int) $parts[1];

    return ($hour * 60) + $minute;
}

function normalize_time(?string $time): ?string
{
    if ($time === null) {
        return null;
    }

    $time = trim($time);
    if ($time === '') {
        return null;
    }

    if (!preg_match('/^(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/', $time)) {
        return null;
    }

    $parts = explode(':', $time);
    return sprintf('%02d:%02d:00', (int) $parts[0], (int) $parts[1]);
}

