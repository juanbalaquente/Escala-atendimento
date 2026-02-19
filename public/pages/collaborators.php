<?php

declare(strict_types=1);

$teams = $pdo->query('SELECT id, code, name FROM teams ORDER BY id')->fetchAll();
$editing = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    if ($action === 'create' || $action === 'update') {
        $id = (int) ($_POST['id'] ?? 0);
        $name = trim($_POST['name'] ?? '');
        $teamId = (int) ($_POST['team_id'] ?? 0);
        $isActive = isset($_POST['is_active']) ? 1 : 0;

        if ($name === '' || $teamId <= 0) {
            set_flash('error', 'Nome e equipe sao obrigatorios.');
            redirect('index.php?page=collaborators');
        }

        if ($action === 'create') {
            $stmt = $pdo->prepare('INSERT INTO collaborators (name, team_id, is_active) VALUES (:name, :team_id, :is_active)');
            $stmt->execute(['name' => $name, 'team_id' => $teamId, 'is_active' => $isActive]);
            set_flash('success', 'Colaborador criado com sucesso.');
        } else {
            if ($id <= 0) {
                set_flash('error', 'Colaborador invalido.');
                redirect('index.php?page=collaborators');
            }

            $stmt = $pdo->prepare('UPDATE collaborators SET name = :name, team_id = :team_id, is_active = :is_active WHERE id = :id');
            $stmt->execute(['id' => $id, 'name' => $name, 'team_id' => $teamId, 'is_active' => $isActive]);
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
    $stmt = $pdo->prepare('SELECT id, name, team_id, is_active FROM collaborators WHERE id = :id');
    $stmt->execute(['id' => $editId]);
    $editing = $stmt->fetch();
}

$collaborators = $pdo->query(
    'SELECT c.id, c.name, c.is_active, t.name AS team_name
     FROM collaborators c
     INNER JOIN teams t ON t.id = c.team_id
     ORDER BY c.name'
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
            <th>Status</th>
            <th>Acoes</th>
        </tr>
        </thead>
        <tbody>
        <?php if (!$collaborators): ?>
            <tr><td colspan="4">Nenhum colaborador cadastrado.</td></tr>
        <?php endif; ?>
        <?php foreach ($collaborators as $collaborator): ?>
            <tr>
                <td><?= h($collaborator['name']) ?></td>
                <td><?= h($collaborator['team_name']) ?></td>
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
