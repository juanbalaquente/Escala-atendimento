(function () {
    function showValidationResult(lines, isSuccess) {
        const box = document.getElementById('validationResult');
        if (!box) {
            return;
        }

        if (!lines || lines.length === 0) {
            box.classList.add('hidden');
            box.innerHTML = '';
            return;
        }

        box.classList.remove('hidden', 'error', 'success');
        box.classList.add(isSuccess ? 'success' : 'error');
        box.innerHTML = lines.map((line) => `<div>${line}</div>`).join('');
    }

    function initEventsPage() {
        const btn = document.getElementById('btnGenerateWeekends');
        const monthInput = document.getElementById('monthInput');
        const result = document.getElementById('generateResult');

        if (!btn || !monthInput || !result) {
            return;
        }

        btn.addEventListener('click', async function () {
            const month = monthInput.value;
            if (!month) {
                result.textContent = 'Selecione um mes.';
                return;
            }

            result.textContent = 'Gerando eventos...';

            try {
                const response = await fetch('index.php?page=api_events_generate_weekends', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ month: month })
                });

                const data = await response.json();
                result.textContent = data.message || 'Operacao concluida.';

                if (data.success) {
                    setTimeout(function () {
                        window.location.reload();
                    }, 600);
                }
            } catch (error) {
                result.textContent = 'Falha ao gerar FDS do mes.';
            }
        });
    }

    function initEventEditPage() {
        if (!window.escalaData) {
            return;
        }

        const form = document.getElementById('shiftsForm');
        const tbody = document.getElementById('shiftsBody');
        const addBtn = document.getElementById('btnAddRow');
        const autoBtn = document.getElementById('btnAutoSchedule');
        const validateBtn = document.getElementById('btnValidate');

        if (!form || !tbody || !addBtn || !autoBtn || !validateBtn) {
            return;
        }

        let bypassSubmitValidation = false;

        function rows() {
            return Array.from(tbody.querySelectorAll('tr.shift-row'));
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function renumberRows() {
            rows().forEach((row, index) => {
                row.querySelectorAll('[name]').forEach((field) => {
                    field.name = field.name.replace(/rows\[\d+\]/, `rows[${index}]`);
                });

                const list = row.querySelector('.collab-list');
                const nameInput = row.querySelector('.collab-name');
                if (list && nameInput) {
                    const listId = `collab-list-${index}`;
                    list.id = listId;
                    nameInput.setAttribute('list', listId);
                }
            });
        }

        function getTeamList(teamId) {
            return window.escalaData.activeCollaboratorsByTeam[String(teamId)] || [];
        }

        function fillDatalist(row) {
            const teamId = Number(row.querySelector('.team-select')?.value || 0);
            const dataList = row.querySelector('.collab-list');
            if (!dataList) {
                return;
            }

            const people = getTeamList(teamId);
            dataList.innerHTML = people.map((person) => `<option value="${escapeHtml(person.name)}"></option>`).join('');
        }

        function syncCollaboratorId(row) {
            const teamId = Number(row.querySelector('.team-select')?.value || 0);
            const nameInput = row.querySelector('.collab-name');
            const hidden = row.querySelector('.collab-id');
            if (!nameInput || !hidden) {
                return;
            }

            const typed = nameInput.value.trim().toLowerCase();
            const person = getTeamList(teamId).find((p) => p.name.trim().toLowerCase() === typed);
            hidden.value = person ? String(person.id) : '';
        }

        function bindRow(row) {
            const teamSelect = row.querySelector('.team-select');
            const collabName = row.querySelector('.collab-name');
            const removeBtn = row.querySelector('.btn-remove-row');

            if (teamSelect) {
                teamSelect.addEventListener('change', function () {
                    fillDatalist(row);
                    const hidden = row.querySelector('.collab-id');
                    if (collabName) {
                        collabName.value = '';
                    }
                    if (hidden) {
                        hidden.value = '';
                    }
                });
            }

            if (collabName) {
                collabName.addEventListener('input', function () {
                    syncCollaboratorId(row);
                });
                collabName.addEventListener('change', function () {
                    syncCollaboratorId(row);
                });
            }

            if (removeBtn) {
                removeBtn.addEventListener('click', function () {
                    row.remove();
                    if (rows().length === 0) {
                        addRow();
                    }
                    renumberRows();
                });
            }

            fillDatalist(row);
            syncCollaboratorId(row);
        }

        function addRow() {
            const index = rows().length;
            const tr = document.createElement('tr');
            tr.className = 'shift-row';
            tr.innerHTML = `
                <td>
                    <select name="rows[${index}][team_id]" class="team-select" required>
                        <option value="">Selecione</option>
                        ${window.escalaData.teams.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <input type="text" name="rows[${index}][collaborator_name]" class="collab-name" placeholder="Digite e selecione" list="collab-list-${index}" required>
                    <input type="hidden" name="rows[${index}][collaborator_id]" class="collab-id" value="">
                    <datalist id="collab-list-${index}" class="collab-list"></datalist>
                </td>
                <td><input type="time" name="rows[${index}][shift_start]" required></td>
                <td><input type="time" name="rows[${index}][shift_end]" required></td>
                <td><input type="time" name="rows[${index}][break_10_1]" required></td>
                <td><input type="time" name="rows[${index}][break_20]" required></td>
                <td><input type="time" name="rows[${index}][break_10_2]" required></td>
                <td><button type="button" class="btn-danger btn-remove-row">Remover</button></td>
            `;
            tbody.appendChild(tr);
            bindRow(tr);
            renumberRows();
        }

        function collectPayloadRows() {
            return rows().map((row) => ({
                team_id: row.querySelector('.team-select')?.value || '',
                collaborator_id: row.querySelector('.collab-id')?.value || '',
                shift_start: row.querySelector('[name$="[shift_start]"]')?.value || '',
                shift_end: row.querySelector('[name$="[shift_end]"]')?.value || '',
                break_10_1: row.querySelector('[name$="[break_10_1]"]')?.value || '',
                break_20: row.querySelector('[name$="[break_20]"]')?.value || '',
                break_10_2: row.querySelector('[name$="[break_10_2]"]')?.value || ''
            }));
        }

        async function runValidation(submitWhenValid) {
            const rowsData = collectPayloadRows();

            if (rowsData.length === 0) {
                showValidationResult(['Adicione pelo menos 1 linha de escala.'], false);
                return false;
            }

            try {
                const response = await fetch('index.php?page=api_validate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_id: window.escalaData.eventId, rows: rowsData })
                });

                const data = await response.json();
                if (!response.ok || !data.valid) {
                    showValidationResult(data.errors || ['Validacao falhou.'], false);
                    return false;
                }

                showValidationResult(['Validacao concluida. Escala pronta para salvar.'], true);

                if (submitWhenValid) {
                    bypassSubmitValidation = true;
                    form.submit();
                }

                return true;
            } catch (error) {
                showValidationResult(['Erro ao validar via API.'], false);
                return false;
            }
        }

        rows().forEach(bindRow);
        renumberRows();

        addBtn.addEventListener('click', addRow);
        autoBtn.addEventListener('click', async function () {
            const originalText = autoBtn.textContent;
            autoBtn.disabled = true;
            autoBtn.textContent = 'Gerando...';
            showValidationResult([], false);

            try {
                const response = await fetch('index.php?page=api_events_auto_schedule', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event_id: window.escalaData.eventId })
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    showValidationResult([data.message || 'Falha ao gerar escala automatica.'], false);
                    return;
                }

                showValidationResult([data.message || 'Escala automatica gerada.'], true);
                setTimeout(function () {
                    window.location.reload();
                }, 500);
            } catch (error) {
                showValidationResult(['Erro ao gerar escala automatica.'], false);
            } finally {
                autoBtn.disabled = false;
                autoBtn.textContent = originalText;
            }
        });
        validateBtn.addEventListener('click', function () {
            runValidation(false);
        });

        form.addEventListener('submit', function (event) {
            if (bypassSubmitValidation) {
                return;
            }
            event.preventDefault();
            runValidation(true);
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initEventsPage();
        initEventEditPage();
    });
})();
