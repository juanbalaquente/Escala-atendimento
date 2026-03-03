import { api, clearFlash, escapeHtml, getQueryParam, setQueryParam, showFlash } from "./common.js";

export async function initCollaboratorsPage() {
  const form = document.getElementById("collabForm");
  const title = document.getElementById("collabFormTitle");
  const idField = document.getElementById("collabId");
  const nameField = document.getElementById("collabName");
  const teamField = document.getElementById("collabTeam");
  const genderField = document.getElementById("collabGender");
  const weekdayEndField = document.getElementById("collabWeekdayEnd");
  const rotationField = document.getElementById("collabRotationGroup");
  const isActiveField = document.getElementById("collabIsActive");
  const submitBtn = document.getElementById("collabSubmitBtn");
  const cancelBtn = document.getElementById("collabCancelBtn");
  const tableBody = document.getElementById("collaboratorsBody");

  if (
    !form ||
    !title ||
    !idField ||
    !nameField ||
    !teamField ||
    !genderField ||
    !weekdayEndField ||
    !rotationField ||
    !isActiveField ||
    !submitBtn ||
    !cancelBtn ||
    !tableBody
  ) {
    return;
  }

  let teams = [];
  let collaborators = [];

  function renderTeamOptions() {
    teamField.innerHTML =
      "<option value=\"\">Selecione</option>" +
      teams.map((team) => `<option value="${team.id}">${escapeHtml(team.name)}</option>`).join("");
  }

  function renderCollaborators() {
    if (collaborators.length === 0) {
      tableBody.innerHTML = "<tr><td colspan=\"7\">Nenhum colaborador cadastrado.</td></tr>";
      return;
    }

    tableBody.innerHTML = collaborators
      .map((collaborator) => {
        const genderLabel =
          collaborator.gender === "F" ? "Feminino" : collaborator.gender === "M" ? "Masculino" : "Nao informado";
        const rotationLabel = collaborator.rotation_group ? `Equipe ${collaborator.rotation_group}` : "-";
        const statusLabel = Number(collaborator.is_active) === 1 ? "Ativo" : "Inativo";

        return `
          <tr>
            <td>${escapeHtml(collaborator.name)}</td>
            <td>${escapeHtml(collaborator.team_name)}</td>
            <td>${escapeHtml(genderLabel)}</td>
            <td>${escapeHtml(collaborator.weekday_shift_end || "")}</td>
            <td>${escapeHtml(rotationLabel)}</td>
            <td>${escapeHtml(statusLabel)}</td>
            <td>
              <div class="table-actions">
                <button type="button" class="action-btn action-secondary" data-edit-id="${collaborator.id}">Editar</button>
                <button type="button" class="action-btn action-danger" data-delete-id="${collaborator.id}">Excluir</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function resetForm() {
    idField.value = "";
    form.reset();
    genderField.value = "N";
    isActiveField.checked = true;
    title.textContent = "Novo colaborador";
    submitBtn.textContent = "Criar";
    cancelBtn.classList.add("hidden");
    setQueryParam("edit", null);
  }

  function startEditById(editId) {
    const collaborator = collaborators.find((item) => Number(item.id) === Number(editId));
    if (!collaborator) {
      showFlash("Colaborador nao encontrado para edicao.", "error");
      return;
    }

    idField.value = String(collaborator.id);
    nameField.value = collaborator.name || "";
    teamField.value = String(collaborator.team_id || "");
    genderField.value = collaborator.gender || "N";
    weekdayEndField.value = collaborator.weekday_shift_end || "";
    rotationField.value = collaborator.rotation_group || "";
    isActiveField.checked = Number(collaborator.is_active) === 1;
    title.textContent = "Editar colaborador";
    submitBtn.textContent = "Atualizar";
    cancelBtn.classList.remove("hidden");
    setQueryParam("edit", collaborator.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadData() {
    const [teamsResponse, collabsResponse] = await Promise.all([api("/teams"), api("/collaborators")]);
    teams = teamsResponse.data || [];
    collaborators = collabsResponse.data || [];
    renderTeamOptions();
    renderCollaborators();

    const editParam = Number(getQueryParam("edit") || 0);
    if (editParam > 0) {
      startEditById(editParam);
    } else {
      resetForm();
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearFlash();

    const payload = {
      name: nameField.value,
      team_id: Number(teamField.value || 0),
      is_active: isActiveField.checked,
      gender: genderField.value,
      weekday_shift_end: weekdayEndField.value || null,
      rotation_group: rotationField.value || null,
    };

    try {
      if (idField.value) {
        await api(`/collaborators/${idField.value}`, { method: "PUT", body: payload });
        showFlash("Colaborador atualizado com sucesso.", "success");
      } else {
        await api("/collaborators", { method: "POST", body: payload });
        showFlash("Colaborador criado com sucesso.", "success");
      }

      await loadData();
    } catch (error) {
      showFlash(error.message || "Falha ao salvar colaborador.", "error");
    }
  });

  cancelBtn.addEventListener("click", function () {
    resetForm();
  });

  tableBody.addEventListener("click", async function (event) {
    const target = event.target;
    if (!target) {
      return;
    }

    const editId = target.getAttribute("data-edit-id");
    if (editId) {
      startEditById(Number(editId));
      return;
    }

    const deleteId = target.getAttribute("data-delete-id");
    if (!deleteId) {
      return;
    }

    if (!window.confirm("Deseja realmente excluir este colaborador?")) {
      return;
    }

    try {
      const response = await api(`/collaborators/${deleteId}`, { method: "DELETE" });
      const removed = Number(response.data?.removed_shifts || 0);
      if (removed > 0) {
        showFlash(`Colaborador removido. ${removed} escala(s) vinculada(s) removidas.`, "success");
      } else {
        showFlash("Colaborador removido.", "success");
      }
      await loadData();
    } catch (error) {
      showFlash(error.message || "Falha ao excluir colaborador.", "error");
    }
  });

  try {
    await loadData();
  } catch (error) {
    showFlash(error.message || "Falha ao carregar colaboradores.", "error");
  }
}
