<?php

declare(strict_types=1);

$editing = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'create' || $action === 'update') {
        $id = (int) ($_POST['id'] ?? 0);
        $type = $_POST['type'] ?? '';
        $eventDate = $_POST['event_date'] ?? '';
        $label = trim($_POST['label'] ?? '');

        if (!in_array($type, ['FDS', 'FERIADO'], true) || $eventDate === '' || $label === '') {
            set_flash('error', 'Tipo, data e label sao obrigatorios.');
            redirect('index.php?page=events');
        }

        try {
            if ($action === 'create') {
                $stmt = $pdo->prepare('INSERT INTO events (type, event_date, label) VALUES (:type, :event_date, :label)');
                $stmt->execute(['type' => $type, 'event_date' => $eventDate, 'label' => $label]);
                set_flash('success', 'Evento criado com sucesso.');
            } else {
                if ($id <= 0) {
                    set_flash('error', 'Evento invalido.');
                    redirect('index.php?page=events');
                }

                $stmt = $pdo->prepare('UPDATE events SET type = :type, event_date = :event_date, label = :label WHERE id = :id');
                $stmt->execute(['id' => $id, 'type' => $type, 'event_date' => $eventDate, 'label' => $label]);
                set_flash('success', 'Evento atualizado com sucesso.');
            }
        } catch (Throwable $e) {
            set_flash('error', 'Nao foi possivel salvar o evento.');
        }

        redirect('index.php?page=events');
    }

    if ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        if ($id > 0) {
            $stmt = $pdo->prepare('DELETE FROM events WHERE id = :id');
            $stmt->execute(['id' => $id]);
            set_flash('success', 'Evento removido.');
        }
        redirect('index.php?page=events');
    }
}

if (isset($_GET['edit'])) {
    $editId = (int) $_GET['edit'];
    $stmt = $pdo->prepare('SELECT id, type, event_date, label FROM events WHERE id = :id');
    $stmt->execute(['id' => $editId]);
    $editing = $stmt->fetch();
}

$events = $pdo->query(
    'SELECT e.id, e.type, e.event_date, e.label, COUNT(s.id) AS shifts_count
     FROM events e
     LEFT JOIN shifts s ON s.event_id = e.id
     GROUP BY e.id
     ORDER BY e.event_date DESC, e.id DESC'
)->fetchAll();
?>

<section>
    <h2><?= $editing ? 'Editar evento' : 'Novo evento' ?></h2>
    <form method="post" class="grid-form">
        <input type="hidden" name="action" value="<?= $editing ? 'update' : 'create' ?>">
        <?php if ($editing): ?>
            <input type="hidden" name="id" value="<?= (int) $editing['id'] ?>">
        <?php endif; ?>

        <label>Tipo
            <select name="type" required>
                <option value="">Selecione</option>
                <option value="FDS" <?= ($editing['type'] ?? '') === 'FDS' ? 'selected' : '' ?>>FDS</option>
                <option value="FERIADO" <?= ($editing['type'] ?? '') === 'FERIADO' ? 'selected' : '' ?>>FERIADO</option>
            </select>
        </label>

        <label>Data
            <input type="date" name="event_date" required value="<?= h($editing['event_date'] ?? '') ?>">
        </label>

        <label>Label
            <input type="text" name="label" required value="<?= h($editing['label'] ?? '') ?>" placeholder="03 - Sabado">
        </label>

        <div class="actions-row">
            <button type="submit" class="btn-primary"><?= $editing ? 'Atualizar' : 'Criar' ?></button>
            <?php if ($editing): ?>
                <a class="btn-secondary" href="index.php?page=events">Cancelar</a>
            <?php endif; ?>
        </div>
    </form>
</section>

<section class="generate-box no-print">
    <h2>Gerar FDS do mes</h2>
    <div class="row-inline">
        <input type="month" id="monthInput" value="<?= h(date('Y-m')) ?>">
        <button type="button" id="btnGenerateWeekends" class="btn-primary">Gerar FDS do mes</button>
    </div>
    <p id="generateResult" class="muted"></p>
</section>

<section>
    <h2>Eventos</h2>
    <table>
        <thead>
        <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Label</th>
            <th>Linhas</th>
            <th>Acoes</th>
        </tr>
        </thead>
        <tbody>
        <?php if (!$events): ?>
            <tr><td colspan="5">Nenhum evento cadastrado.</td></tr>
        <?php endif; ?>
        <?php foreach ($events as $event): ?>
            <tr>
                <td><?= h(date('d/m/Y', strtotime($event['event_date']))) ?></td>
                <td><?= h($event['type']) ?></td>
                <td><?= h($event['label']) ?></td>
                <td><?= (int) $event['shifts_count'] ?></td>
                <td>
                    <a href="index.php?page=event_edit&id=<?= (int) $event['id'] ?>">Montar escala</a>
                    <a href="index.php?page=event_print&id=<?= (int) $event['id'] ?>" target="_blank">Print</a>
                    <a href="index.php?page=events&edit=<?= (int) $event['id'] ?>">Editar</a>
                    <form method="post" class="inline-form" onsubmit="return confirm('Excluir evento?');">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="id" value="<?= (int) $event['id'] ?>">
                        <button type="submit" class="link-btn">Excluir</button>
                    </form>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
</section>
