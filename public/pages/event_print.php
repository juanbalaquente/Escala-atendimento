<?php

declare(strict_types=1);

$eventId = (int) ($_GET['id'] ?? 0);
if ($eventId <= 0) {
    echo '<p>Evento invalido.</p>';
    return;
}

$eventStmt = $pdo->prepare('SELECT id, type, event_date, label FROM events WHERE id = :id');
$eventStmt->execute(['id' => $eventId]);
$event = $eventStmt->fetch();

if (!$event) {
    echo '<p>Evento nao encontrado.</p>';
    return;
}

$shiftsStmt = $pdo->prepare(
    'SELECT s.*, c.name AS collaborator_name, t.code AS team_code, t.name AS team_name,
            TIME_FORMAT(s.shift_start, "%H:%i") AS shift_start_fmt,
            TIME_FORMAT(s.shift_end, "%H:%i") AS shift_end_fmt,
            TIME_FORMAT(s.break_10_1, "%H:%i") AS break_10_1_fmt,
            TIME_FORMAT(s.break_20, "%H:%i") AS break_20_fmt,
            TIME_FORMAT(s.break_10_2, "%H:%i") AS break_10_2_fmt
     FROM shifts s
     INNER JOIN collaborators c ON c.id = s.collaborator_id
     INNER JOIN teams t ON t.id = s.team_id
     WHERE s.event_id = :event_id
     ORDER BY t.id ASC, s.shift_start ASC'
);
$shiftsStmt->execute(['event_id' => $eventId]);
$shifts = $shiftsStmt->fetchAll();

$grouped = [];
foreach ($shifts as $shift) {
    $grouped[$shift['team_name']][] = $shift;
}
?>

<section class="print-toolbar no-print">
    <a class="btn-secondary" href="index.php?page=event_edit&id=<?= (int) $eventId ?>">Voltar</a>
    <button type="button" onclick="window.print()" class="btn-primary">Imprimir</button>
</section>

<section class="print-event-block">
    <h2>Escala de Atendimento</h2>
    <p><strong>Evento:</strong> <?= h(date('d/m/Y', strtotime($event['event_date']))) ?> - <?= h($event['label']) ?> (<?= h($event['type']) ?>)</p>

    <?php if (!$grouped): ?>
        <p>Nenhuma linha de escala cadastrada para este evento.</p>
    <?php endif; ?>

    <?php foreach ($grouped as $teamName => $items): ?>
        <article class="team-block">
            <h3><?= h($teamName) ?></h3>
            <table>
                <thead>
                <tr>
                    <th>Colaborador</th>
                    <th>Turno</th>
                    <th>Pausa 10 1</th>
                    <th>Pausa 20</th>
                    <th>Pausa 10 2</th>
                </tr>
                </thead>
                <tbody>
                <?php foreach ($items as $item): ?>
                    <tr>
                        <td><?= h($item['collaborator_name']) ?></td>
                        <td><?= h($item['shift_start_fmt']) ?> - <?= h($item['shift_end_fmt']) ?></td>
                        <td><?= h($item['break_10_1_fmt']) ?></td>
                        <td><?= h($item['break_20_fmt']) ?></td>
                        <td><?= h($item['break_10_2_fmt']) ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </article>
    <?php endforeach; ?>
</section>

