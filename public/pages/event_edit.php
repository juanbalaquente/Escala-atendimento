<?php

declare(strict_types=1);

require_once __DIR__ . '/../../app/lib/validate.php';

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

$teams = $pdo->query('SELECT id, code, name FROM teams ORDER BY id')->fetchAll();
$activeByTeam = [];

$activeStmt = $pdo->query(
    'SELECT id, name, team_id
     FROM collaborators
     WHERE is_active = 1
     ORDER BY name'
);
foreach ($activeStmt->fetchAll() as $c) {
    $activeByTeam[(int) $c['team_id']][] = ['id' => (int) $c['id'], 'name' => $c['name']];
}

$saveErrors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_shifts') {
    $rowsInput = $_POST['rows'] ?? [];

    if (!is_array($rowsInput)) {
        $rowsInput = [];
    }

    $validation = validate_shift_rows($pdo, $rowsInput);

    if (!$validation['valid']) {
        $saveErrors = $validation['errors'];
    } else {
        try {
            $pdo->beginTransaction();

            $deleteStmt = $pdo->prepare('DELETE FROM shifts WHERE event_id = :event_id');
            $deleteStmt->execute(['event_id' => $eventId]);

            $insertStmt = $pdo->prepare(
                'INSERT INTO shifts (event_id, team_id, collaborator_id, shift_start, shift_end, break_10_1, break_20, break_10_2)
                 VALUES (:event_id, :team_id, :collaborator_id, :shift_start, :shift_end, :break_10_1, :break_20, :break_10_2)'
            );

            foreach ($validation['rows'] as $row) {
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
            set_flash('success', 'Escala salva com sucesso.');
            redirect('index.php?page=event_edit&id=' . $eventId);
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $saveErrors[] = 'Erro ao salvar escala: ' . $e->getMessage();
        }
    }
}

$rowsForForm = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['action'] ?? '') === 'save_shifts') {
    $postedRows = $_POST['rows'] ?? [];
    foreach ($postedRows as $row) {
        $rowsForForm[] = [
            'team_id' => (int) ($row['team_id'] ?? 0),
            'collaborator_id' => (int) ($row['collaborator_id'] ?? 0),
            'collaborator_name' => trim((string) ($row['collaborator_name'] ?? '')),
            'shift_start' => trim((string) ($row['shift_start'] ?? '')),
            'shift_end' => trim((string) ($row['shift_end'] ?? '')),
            'break_10_1' => trim((string) ($row['break_10_1'] ?? '')),
            'break_20' => trim((string) ($row['break_20'] ?? '')),
            'break_10_2' => trim((string) ($row['break_10_2'] ?? '')),
        ];
    }
} else {
    $shiftsStmt = $pdo->prepare(
        'SELECT s.team_id, s.collaborator_id, c.name AS collaborator_name,
                TIME_FORMAT(s.shift_start, "%H:%i") AS shift_start,
                TIME_FORMAT(s.shift_end, "%H:%i") AS shift_end,
                TIME_FORMAT(s.break_10_1, "%H:%i") AS break_10_1,
                TIME_FORMAT(s.break_20, "%H:%i") AS break_20,
                TIME_FORMAT(s.break_10_2, "%H:%i") AS break_10_2
         FROM shifts s
         INNER JOIN collaborators c ON c.id = s.collaborator_id
         WHERE s.event_id = :event_id
         ORDER BY s.team_id ASC, s.shift_start ASC'
    );
    $shiftsStmt->execute(['event_id' => $eventId]);
    $rowsForForm = $shiftsStmt->fetchAll();
}

if (!$rowsForForm) {
    $rowsForForm[] = [
        'team_id' => 0,
        'collaborator_id' => 0,
        'collaborator_name' => '',
        'shift_start' => '',
        'shift_end' => '',
        'break_10_1' => '',
        'break_20' => '',
        'break_10_2' => '',
    ];
}
?>

<section>
    <h2>Montar escala</h2>
    <p><strong>Evento:</strong> <?= h(date('d/m/Y', strtotime($event['event_date']))) ?> - <?= h($event['label']) ?> (<?= h($event['type']) ?>)</p>
    <p class="muted">Escala inclui apenas Analistas e Suporte N1 ativos.</p>

    <?php if ($saveErrors): ?>
        <div class="alert error">
            <?php foreach ($saveErrors as $error): ?>
                <div><?= h($error) ?></div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <div id="validationResult" class="alert error hidden"></div>

    <form method="post" id="shiftsForm">
        <input type="hidden" name="action" value="save_shifts">
        <input type="hidden" name="event_id" value="<?= (int) $eventId ?>">

        <table id="shiftsTable">
            <thead>
            <tr>
                <th>Equipe</th>
                <th>Colaborador</th>
                <th>Inicio</th>
                <th>Fim</th>
                <th>Pausa 10 1</th>
                <th>Pausa 20</th>
                <th>Pausa 10 2</th>
                <th>Acoes</th>
            </tr>
            </thead>
            <tbody id="shiftsBody">
            <?php foreach ($rowsForForm as $idx => $row): ?>
                <tr class="shift-row">
                    <td>
                        <select name="rows[<?= $idx ?>][team_id]" class="team-select" required>
                            <option value="">Selecione</option>
                            <?php foreach ($teams as $team): ?>
                                <option value="<?= (int) $team['id'] ?>" <?= (int) $row['team_id'] === (int) $team['id'] ? 'selected' : '' ?>>
                                    <?= h($team['name']) ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </td>
                    <td>
                        <input type="text" name="rows[<?= $idx ?>][collaborator_name]" class="collab-name" placeholder="Digite e selecione" list="collab-list-<?= $idx ?>" value="<?= h($row['collaborator_name']) ?>" required>
                        <input type="hidden" name="rows[<?= $idx ?>][collaborator_id]" class="collab-id" value="<?= (int) $row['collaborator_id'] ?>">
                        <datalist id="collab-list-<?= $idx ?>" class="collab-list"></datalist>
                    </td>
                    <td><input type="time" name="rows[<?= $idx ?>][shift_start]" value="<?= h($row['shift_start']) ?>" required></td>
                    <td><input type="time" name="rows[<?= $idx ?>][shift_end]" value="<?= h($row['shift_end']) ?>" required></td>
                    <td><input type="time" name="rows[<?= $idx ?>][break_10_1]" value="<?= h($row['break_10_1']) ?>" required></td>
                    <td><input type="time" name="rows[<?= $idx ?>][break_20]" value="<?= h($row['break_20']) ?>" required></td>
                    <td><input type="time" name="rows[<?= $idx ?>][break_10_2]" value="<?= h($row['break_10_2']) ?>" required></td>
                    <td><button type="button" class="btn-danger btn-remove-row">Remover</button></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>

        <div class="actions-row">
            <button type="button" id="btnAddRow" class="btn-secondary">Adicionar linha</button>
            <button type="button" id="btnValidate" class="btn-secondary">Validar</button>
            <button type="submit" id="btnSaveShifts" class="btn-primary">Salvar escala</button>
            <a class="btn-secondary" href="index.php?page=events">Voltar</a>
            <a class="btn-secondary" href="index.php?page=event_print&id=<?= (int) $eventId ?>" target="_blank">Print</a>
        </div>
    </form>
</section>

<script>
window.escalaData = {
    eventId: <?= (int) $eventId ?>,
    teams: <?= json_encode($teams, JSON_UNESCAPED_UNICODE) ?>,
    activeCollaboratorsByTeam: <?= json_encode($activeByTeam, JSON_UNESCAPED_UNICODE) ?>
};
</script>

