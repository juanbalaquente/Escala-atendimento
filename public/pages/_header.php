<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Escala de Atendimento</title>
    <script>
    (function () {
        try {
            var theme = localStorage.getItem('escala-theme') === 'dark' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', theme);
        } catch (e) {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    })();
    </script>
    <link rel="stylesheet" href="assets/css/app.css">
</head>
<body>
<header class="sidebar no-print">
    <div class="brand">
        <h1>Escala de Atendimento</h1>
        <small>Operacao FDS e feriados</small>
    </div>
    <nav class="main-nav">
        <a class="nav-link" href="index.php?page=dashboard">Dashboard</a>
        <a class="nav-link" href="index.php?page=collaborators">Colaboradores</a>
        <a class="nav-link" href="index.php?page=events">Eventos</a>
    </nav>
    <div class="theme-switcher">
        <label for="themeSelect">Tema</label>
        <select id="themeSelect" aria-label="Selecionar tema">
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
        </select>
    </div>
</header>
<main class="container with-sidebar">
    <?php if ($flash): ?>
        <div class="alert <?= h($flash['type']) ?>"><?= h($flash['message']) ?></div>
    <?php endif; ?>

