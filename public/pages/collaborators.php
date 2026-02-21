<?php

declare(strict_types=1);

$hasGender = false;
$hasWeekdayEnd = false;

try {
    $colStmt = $pdo->prepare('SHOW COLUMNS FROM collaborators LIKE :column');
    $colStmt->execute(['column' => 'gender']);
    $hasGender = (bool) $colStmt->fetch();
    $colStmt->execute(['column' => 'weekday_shift_end']);
    $hasWeekdayEnd = (bool) $colStmt->fetch();
} catch (Throwable $e) {
    $hasGender = false;
    $hasWeekdayEnd = false;
}

$teams = $pdo->query('SELECT id, code, name FROM teams ORDER BY id')->fetchAll();
$editing = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'create' || $action === 'update') {
        $id = (int) ($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $teamId = (int) ($_POST['team_id'] ?? 0);
        $isActive = isset($_POST['is_active']) ? 1 : 0;
        $gender = strtoupper(trim((string) ($_POST['gender'] ?? 'N')));
        $weekdayShiftEnd = trim((string) ($_POST['weekday_shift_end'] ?? ''));

        if ($name === '' || $teamId <= 0) {
            set_flash('error', 'Nome e equipe sao obrigatorios.');
            redirect('index.php?page=collaborators');
        }

        if (!in_array($gender, ['F', 'M', 'N'], true)) {
            $gender = 'N';
        }

        if ($weekdayShiftEnd !== '' && !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $weekdayShiftEnd)) {
            set_flash('error', 'Horario de fim semanal invalido. Use HH:MM.');
            redirect('index.php?page=collaborators');
        }

        if ($action === 'create') {
            if ($hasGender && $hasWeekdayEnd) {
                $stmt = $pdo->prepare(
                    'INSERT INTO collaborators (name, team_id, is_active, gender, weekday_shift_end)
                     VALUES (:name, :team_id, :is_active, :gender, :weekday_shift_end)'
                );
                $stmt->execute([
                    'name' => $name,
                    'team_id' => $teamId,
                    'is_active' => $isActive,
                    'gender' => $gender,
                    'weekday_shift_end' => $weekdayShiftEnd !== '' ? $weekdayShiftEnd . ':00' : null,
                ]);
            } elseif ($hasGender) {
                $stmt = $pdo->prepare(
                    'INSERT INTO collaborators (name, team_id, is_active, gender)
                     VALUES (:name, :team_id, :is_active, :gender)'
                );
                $stmt->execute([
                    'name' => $name,
                    'team_id' => $teamId,
                    'is_active' => $isActive,
                    'gender' => $gender,
                ]);
            } elseif ($hasWeekdayEnd) {
                $stmt = $pdo->prepare(
                    'INSERT INTO collaborators (name, team_id, is_active, weekday_shift_end)
                     VALUES (:name, :team_id, :is_active, :weekday_shift_end)'
                );
                $stmt->execute([
                    'name' => $name,
                    'team_id' => $teamId,
                    'is_active' => $isActive,
                    'weekday_shift_end' => $weekdayShiftEnd !== '' ? $weekdayShiftEnd . ':00' : null,
                ]);
            } else {
                $stmt = $pdo->prepare('INSERT INTO collaborators (name, team_id, is_active) VALUES (:name, :team_id, :is_active)');
                $stmt->execute(['name' => $name, 'team_id' => $teamId, 'is_active' => $isActive]);
            }
            set_flash('success', 'Colaborador criado com sucesso.');
        } else {
            if ($id <= 0) {
                set_flash('error', 'Colaborador invalido.');
                redirect('index.php?page=collaborators');
            }

            if ($hasGender && $hasWeekdayEnd) {
                $stmt = $pdo->prepare(
                    'UPDATE collaborators
                     SET name = :name, team_id = :team_id, is_active = :is_active, gender = :gender, weekday_shift_end = :weekday_shift_end
                     WHERE id = :id'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $name,
                    'team_id' => $teamId,
                    'is_active' => $isActive,
                    'gender' => $gender,
                    'weekday_shift_end' => $weekdayShiftEnd !== '' ? $weekdayShiftEnd . ':00' : null,
                ]);
            } elseif ($hasGender) {
                $stmt = $pdo->prepare(
                    'UPDATE collaborators
                     SET name = :name, team_id = :team_id, is_active = :is_active, gender = :gender
                     WHERE id = :id'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $name,
                    'team_id' => $teamId,
                    'is_active' => $isActive,
                    'gender' => $gender,
                ]);
            } elseif ($hasWeekdayEnd) {
                $stmt = $pdo->prepare(
                    'UPDATE collaborators
                     SET name = :name, team_id = :team_id, is_active = :is_active, weekday_shift_end = :weekday_shift_end
                     WHERE id = :id'
                );
                $stmt->execute([
                    'id' => $id,
                    'name' => $name,
                    'team_id' => $teamId,
                    'is_active' => $isActive,
                    'weekday_shift_end' => $weekdayShiftEnd !== '' ? $weekdayShiftEnd . ':00' : null,
                ]);
            } else {
                $stmt = $pdo->prepare('UPDATE collaborators SET name = :name, team_id = :team_id, is_active = :is_active WHERE id = :id');
                $stmt->execute(['id' => $id, 'name' => $name, 'team_id' => $teamId, 'is_active' => $isActive]);
            }
            set_flash('success', 'Colaborador atualizado com sucesso.');
        }

        redirect('index.php?page=collaborators');
    }

    if ($action === 'delete') {
        $id = (int) ($_POST['id'] ?? 0);
        if ($id > 0) {
            $stmt = $pdo->prepare('DELETE FROM collaborators WHERE id = :id');
            $stmt->execute(['id' => $id]);
            set_flash('success', 'Colaborador removido.');
        }
        redirect('index.php?page=collaborators');
    }
}

if (isset($_GET['edit'])) {
    $editId = (int) $_GET['edit'];
    $editingFields = 'id, name, team_id, is_active'
        . ($hasGender ? ', gender' : '')
        . ($hasWeekdayEnd ? ', TIME_FORMAT(weekday_shift_end, "%H:%i") AS weekday_shift_end' : '');
    $stmt = $pdo->prepare("SELECT {$editingFields} FROM collaborators WHERE id = :id");
    $stmt->execute(['id' => $editId]);
    $editing = $stmt->fetch();
}

$collabFields = 'c.id, c.name, c.is_active, t.name AS team_name'
    . ($hasGender ? ', c.gender' : '')
    . ($hasWeekdayEnd ? ', TIME_FORMAT(c.weekday_shift_end, "%H:%i") AS weekday_shift_end' : '');

$collaborators = $pdo->query(
    "SELECT {$collabFields}
     FROM collaborators c
     INNER JOIN teams t ON t.id = c.team_id
     ORDER BY c.name"
)->fetchAll();
?>

<section>
    <h2><?= $editing ? 'Editar colaborador' : 'Novo colaborador' ?></h2>
    <form method="post" class="grid-form">
        <input type="hidden" name="action" value="<?= $editing ? 'update' : 'create' ?>">
        <?php if ($editing): ?>
            <input type="hidden" name="id" value="<?= (int) $editing['id'] ?>">
        <?php endif; ?>

        <label>Nome
            <input type="text" name="name" required value="<?= h($editing['name'] ?? '') ?>">
        </label>

        <label>Equipe
            <select name="team_id" required>
                <option value="">Selecione</option>
                <?php foreach ($teams as $team): ?>
                    <option value="<?= (int) $team['id'] ?>" <?= (int) ($editing['team_id'] ?? 0) === (int) $team['id'] ? 'selected' : '' ?>>
                        <?= h($team['name']) ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </label>

        <?php if ($hasGender): ?>
            <label>Genero
                <select name="gender">
                    <option value="N" <?= ($editing['gender'] ?? 'N') === 'N' ? 'selected' : '' ?>>Nao informado</option>
                    <option value="F" <?= ($editing['gender'] ?? '') === 'F' ? 'selected' : '' ?>>Feminino</option>
                    <option value="M" <?= ($editing['gender'] ?? '') === 'M' ? 'selected' : '' ?>>Masculino</option>
                </select>
            </label>
        <?php endif; ?>

        <?php if ($hasWeekdayEnd): ?>
            <label>Fim semana (HH:MM)
                <input type="time" name="weekday_shift_end" value="<?= h($editing['weekday_shift_end'] ?? '') ?>">
            </label>
        <?php endif; ?>

        <label class="checkbox-label">
            <input type="checkbox" name="is_active" <?= !isset($editing['is_active']) || (int) $editing['is_active'] === 1 ? 'checked' : '' ?>>
            Ativo
        </label>

        <div class="actions-row">
            <button type="submit" class="btn-primary"><?= $editing ? 'Atualizar' : 'Criar' ?></button>
            <?php if ($editing): ?>
                <a class="btn-secondary" href="index.php?page=collaborators">Cancelar</a>
            <?php endif; ?>
        </div>
    </form>
</section>

<section>
    <h2>Lista de colaboradores</h2>
    <table>
        <thead>
        <tr>
            <th>Nome</th>
            <th>Equipe</th>
            <?php if ($hasGender): ?>
                <th>Genero</th>
            <?php endif; ?>
            <?php if ($hasWeekdayEnd): ?>
                <th>Fim semana</th>
            <?php endif; ?>
            <th>Status</th>
            <th>Acoes</th>
        </tr>
        </thead>
        <tbody>
        <?php if (!$collaborators): ?>
            <tr><td colspan="<?= 4 + ($hasGender ? 1 : 0) + ($hasWeekdayEnd ? 1 : 0) ?>">Nenhum colaborador cadastrado.</td></tr>
        <?php endif; ?>
        <?php foreach ($collaborators as $collaborator): ?>
            <tr>
                <td><?= h($collaborator['name']) ?></td>
                <td><?= h($collaborator['team_name']) ?></td>
                <?php if ($hasGender): ?>
                    <td>
                        <?php
                        $g = $collaborator['gender'] ?? 'N';
                        echo h($g === 'F' ? 'Feminino' : ($g === 'M' ? 'Masculino' : 'Nao informado'));
                        ?>
                    </td>
                <?php endif; ?>
                <?php if ($hasWeekdayEnd): ?>
                    <td><?= h($collaborator['weekday_shift_end'] ?? '') ?></td>
                <?php endif; ?>
                <td><?= (int) $collaborator['is_active'] === 1 ? 'Ativo' : 'Inativo' ?></td>
                <td>
                    <a href="index.php?page=collaborators&edit=<?= (int) $collaborator['id'] ?>">Editar</a>
                    <form method="post" class="inline-form" onsubmit="return confirm('Excluir colaborador?');">
                        <input type="hidden" name="action" value="delete">
                        <input type="hidden" name="id" value="<?= (int) $collaborator['id'] ?>">
                        <button type="submit" class="link-btn">Excluir</button>
                    </form>
                </td>
            </tr>
        <?php endforeach; ?>
        </tbody>
    </table>
</section>
