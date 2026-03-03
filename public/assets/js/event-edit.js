import {
  api,
  escapeHtml,
  formatDateBr,
  getQueryParam,
  showFlash,
  showValidationResult,
} from "./common.js";

export async function initEventEditPage() {
  const eventId = Number(getQueryParam("id") || getQueryParam("event_id") || 0);
  const header = document.getElementById("eventHeader");
  const printLink = document.getElementById("printLink");
  const form = document.getElementById("shiftsForm");
  const tbody = document.getElementById("shiftsBody");
  const addBtn = document.getElementById("btnAddRow");
  const autoBtn = document.getElementById("btnAutoSchedule");
  const validateBtn = document.getElementById("btnValidate");

  if (!header || !printLink || !form || !tbody || !addBtn || !autoBtn || !validateBtn) {
    return;
  }

  if (eventId <= 0) {
    showFlash("Evento invalido.", "error");
    return;
  }

  let teams = [];
  let activeByTeam = {};
  let currentRows = [];
  printLink.href = `event-print.html?id=${eventId}`;

  function rows() {
    return Array.from(tbody.querySelectorAll("tr.shift-row"));
  }

  function teamMembers(teamId) {
    return activeByTeam[String(teamId)] || [];
  }

  function renumberRows() {
    rows().forEach((row, index) => {
      row.querySelectorAll("[name]").forEach((field) => {
        field.name = field.name.replace(/rows\[\d+\]/, `rows[${index}]`);
      });
      const list = row.querySelector(".collab-list");
      const nameInput = row.querySelector(".collab-name");
      if (list && nameInput) {
        const listId = `collab-list-${index}`;
        list.id = listId;
        nameInput.setAttribute("list", listId);
      }
    });
  }

  function fillDatalist(row) {
    const teamId = Number(row.querySelector(".team-select")?.value || 0);
    const dataList = row.querySelector(".collab-list");
    if (!dataList) {
      return;
    }
    const members = teamMembers(teamId);
    dataList.innerHTML = members.map((person) => `<option value="${escapeHtml(person.name)}"></option>`).join("");
  }

  function syncCollaboratorId(row) {
    const teamId = Number(row.querySelector(".team-select")?.value || 0);
    const nameInput = row.querySelector(".collab-name");
    const hidden = row.querySelector(".collab-id");
    if (!nameInput || !hidden) {
      return;
    }
    const typed = nameInput.value.trim().toLowerCase();
    const person = teamMembers(teamId).find((item) => String(item.name).trim().toLowerCase() === typed);
    hidden.value = person ? String(person.id) : "";
  }

  function bindRow(row) {
    const teamSelect = row.querySelector(".team-select");
    const collabName = row.querySelector(".collab-name");
    const removeBtn = row.querySelector(".btn-remove-row");

    if (teamSelect) {
      teamSelect.addEventListener("change", function () {
        fillDatalist(row);
        if (collabName) {
          collabName.value = "";
        }
        const hidden = row.querySelector(".collab-id");
        if (hidden) {
          hidden.value = "";
        }
      });
    }

    if (collabName) {
      collabName.addEventListener("input", function () {
        syncCollaboratorId(row);
      });
      collabName.addEventListener("change", function () {
        syncCollaboratorId(row);
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
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

  function createRow(index, rowData) {
    const tr = document.createElement("tr");
    tr.className = "shift-row";
    tr.innerHTML = `
      <td>
        <select name="rows[${index}][team_id]" class="team-select" required>
          <option value="">Selecione</option>
          ${teams
            .map(
              (team) =>
                `<option value="${team.id}" ${Number(rowData.team_id) === Number(team.id) ? "selected" : ""}>${escapeHtml(team.name)}</option>`,
            )
            .join("")}
        </select>
      </td>
      <td>
        <input type="text" name="rows[${index}][collaborator_name]" class="collab-name" placeholder="Digite e selecione" list="collab-list-${index}" value="${escapeHtml(rowData.collaborator_name || "")}" required>
        <input type="hidden" name="rows[${index}][collaborator_id]" class="collab-id" value="${escapeHtml(String(rowData.collaborator_id || ""))}">
        <datalist id="collab-list-${index}" class="collab-list"></datalist>
      </td>
      <td><input type="time" name="rows[${index}][shift_start]" value="${escapeHtml(rowData.shift_start || "")}" required></td>
      <td><input type="time" name="rows[${index}][shift_end]" value="${escapeHtml(rowData.shift_end || "")}" required></td>
      <td><input type="time" name="rows[${index}][break_10_1]" value="${escapeHtml(rowData.break_10_1 || "")}" required></td>
      <td><input type="time" name="rows[${index}][break_20]" value="${escapeHtml(rowData.break_20 || "")}" required></td>
      <td><input type="time" name="rows[${index}][break_10_2]" value="${escapeHtml(rowData.break_10_2 || "")}" required></td>
      <td><button type="button" class="btn-danger btn-remove-row">Remover</button></td>
    `;
    tbody.appendChild(tr);
    bindRow(tr);
  }

  function addRow() {
    createRow(rows().length, {
      team_id: "",
      collaborator_id: "",
      collaborator_name: "",
      shift_start: "",
      shift_end: "",
      break_10_1: "",
      break_20: "",
      break_10_2: "",
    });
    renumberRows();
  }

  function renderRows() {
    tbody.innerHTML = "";
    if (!Array.isArray(currentRows) || currentRows.length === 0) {
      addRow();
      return;
    }
    currentRows.forEach((rowData, index) => {
      createRow(index, rowData);
    });
    renumberRows();
  }

  function collectRowsPayload() {
    return rows().map((row) => ({
      team_id: row.querySelector(".team-select")?.value || "",
      collaborator_id: row.querySelector(".collab-id")?.value || "",
      shift_start: row.querySelector('[name$="[shift_start]"]')?.value || "",
      shift_end: row.querySelector('[name$="[shift_end]"]')?.value || "",
      break_10_1: row.querySelector('[name$="[break_10_1]"]')?.value || "",
      break_20: row.querySelector('[name$="[break_20]"]')?.value || "",
      break_10_2: row.querySelector('[name$="[break_10_2]"]')?.value || "",
    }));
  }

  async function runValidation(showSuccess) {
    const payloadRows = collectRowsPayload();
    if (payloadRows.length === 0) {
      showValidationResult(["Adicione pelo menos 1 linha de escala."], false);
      return false;
    }

    try {
      await api("/validate/shifts", {
        method: "POST",
        body: { rows: payloadRows },
      });
      if (showSuccess) {
        showValidationResult(["Validacao concluida. Escala pronta para salvar."], true);
      } else {
        showValidationResult([], false);
      }
      return true;
    } catch (error) {
      const lines =
        Array.isArray(error.data?.data?.errors) && error.data.data.errors.length > 0
          ? error.data.data.errors
          : [error.message || "Falha na validacao."];
      showValidationResult(lines, false);
      return false;
    }
  }

  async function loadData() {
    const response = await api(`/events/${eventId}/shifts`);
    const data = response.data || {};
    const event = data.event;
    teams = data.teams || [];
    activeByTeam = data.activeCollaboratorsByTeam || {};
    currentRows = data.rows || [];
    if (event) {
      header.textContent = `${formatDateBr(event.event_date)} - ${event.label} (${event.type})`;
    }
    renderRows();
  }

  addBtn.addEventListener("click", function () {
    addRow();
  });

  validateBtn.addEventListener("click", function () {
    runValidation(true);
  });

  autoBtn.addEventListener("click", async function () {
    const originalText = autoBtn.textContent;
    autoBtn.disabled = true;
    autoBtn.textContent = "Gerando...";
    showValidationResult([], false);

    try {
      const response = await api(`/events/${eventId}/auto-schedule`, { method: "POST" });
      showValidationResult([response.data?.message || "Escala automatica gerada."], true);
      await loadData();
    } catch (error) {
      showValidationResult([error.message || "Falha ao gerar escala automatica."], false);
    } finally {
      autoBtn.disabled = false;
      autoBtn.textContent = originalText;
    }
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const isValid = await runValidation(false);
    if (!isValid) {
      return;
    }

    try {
      await api(`/events/${eventId}/shifts`, {
        method: "PUT",
        body: { rows: collectRowsPayload() },
      });
      showFlash("Escala salva com sucesso.", "success");
      showValidationResult([], false);
      await loadData();
    } catch (error) {
      showFlash(error.message || "Falha ao salvar escala.", "error");
    }
  });

  try {
    await loadData();
  } catch (error) {
    showFlash(error.message || "Falha ao carregar evento.", "error");
  }
}
