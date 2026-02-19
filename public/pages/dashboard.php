<?php

declare(strict_types=1);

$collabCount = (int) $pdo->query('SELECT COUNT(*) FROM collaborators')->fetchColumn();
$activeCount = (int) $pdo->query('SELECT COUNT(*) FROM collaborators WHERE is_active = 1')->fetchColumn();
$eventCount = (int) $pdo->query('SELECT COUNT(*) FROM events')->fetchColumn();
$shiftCount = (int) $pdo->query('SELECT COUNT(*) FROM shifts')->fetchColumn();

$nextEventsStmt = $pdo->query(
    "SELECT id, type, event_date, label
     FROM events
     WHERE event_date >= CURDATE()
     ORDER BY event_date ASC
     LIMIT 10"
);
$nextEvents = $nextEventsStmt->fetchAll();
?>

<section class="cards">
    <article class="card">
        <h3>Colaboradores</h3>
        <p><?= $collabCount ?></p>
    </article>
    <article class="card">
        <h3>Ativos</h3>
        <p><?= $activeCount ?></p>
    </article>
    <article class="card">
        <h3>Eventos</h3>
        <p><?= $eventCount ?></p>
    </article>
    <article class="card">
        <h3>Linhas de Escala</h3>
        <p><?= $shiftCount ?></p>
    </article>
</section>

<section>
    <h2>Proximos eventos</h2>
    <table>
        <thead>
        <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Label</th>
            <th>Acoes</th>
        </tr>
        </thead>
        <tbody>
        <?php if (!$nextEvents): ?>
            <tr><td colspan="4">Sem eventos futuros.</td></tr>
        <?php endif; ?>
        <?php foreach ($nextEvents as $event): ?>
            <tr>
                <td><?= h(date('d/m/Y', strtotime($event['event_date']))) ?></td>
                <td><?= h($event['type']) ?></td>
                <td><?= h($event['label']) ?></td>
                <td>
                    <a href="index.php?page=event_edit&id=<?= (int) $event['id'] ?>">Montar</a>
                    <a href="index.php?page=event_print&id=<?= (int) $event['id'] ?>" target="_blank">Print</a>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
</section>

