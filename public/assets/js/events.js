import { api, clearFlash, escapeHtml, formatDateBr, getQueryParam, setQueryParam, showFlash } from "./common.js";

export async function initEventsPage() {
  const form = document.getElementById("eventForm");
  const title = document.getElementById("eventFormTitle");
  const idField = document.getElementById("eventId");
  const typeField = document.getElementById("eventType");
  const dateField = document.getElementById("eventDate");
  const labelField = document.getElementById("eventLabel");
  const submitBtn = document.getElementById("eventSubmitBtn");
  const cancelBtn = document.getElementById("eventCancelBtn");
  const eventsBody = document.getElementById("eventsBody");
  const monthInput = document.getElementById("monthInput");
  const generateBtn = document.getElementById("btnGenerateWeekends");
  const generateResult = document.getElementById("generateResult");

  if (
    !form ||
    !title ||
    !idField ||
    !typeField ||
    !dateField ||
    !labelField ||
    !submitBtn ||
    !cancelBtn ||
    !eventsBody ||
    !monthInput ||
    !generateBtn ||
    !generateResult
  ) {
    return;
  }

  let events = [];
  monthInput.value = new Date().toISOString().slice(0, 7);

  function resetForm() {
    idField.value = "";
    form.reset();
    title.textContent = "Novo evento";
    submitBtn.textContent = "Criar";
    cancelBtn.classList.add("hidden");
    setQueryParam("edit", null);
  }

  function startEdit(eventId) {
    const current = events.find((event) => Number(event.id) === Number(eventId));
    if (!current) {
      showFlash("Evento nao encontrado para edicao.", "error");
      return;
    }

    idField.value = String(current.id);
    typeField.value = current.type || "";
    dateField.value = current.event_date || "";
    labelField.value = current.label || "";
    title.textContent = "Editar evento";
    submitBtn.textContent = "Atualizar";
    cancelBtn.classList.remove("hidden");
    setQueryParam("edit", current.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderEvents() {
    if (events.length === 0) {
      eventsBody.innerHTML = "<tr><td colspan=\"5\">Nenhum evento cadastrado.</td></tr>";
      return;
    }

    eventsBody.innerHTML = events
      .map(
        (event) => `
          <tr>
            <td>${escapeHtml(formatDateBr(event.event_date))}</td>
            <td>${escapeHtml(event.type)}</td>
            <td>${escapeHtml(event.label)}</td>
            <td>${escapeHtml(String(event.shifts_count || 0))}</td>
            <td>
              <div class="table-actions">
                <a class="action-btn action-primary" href="event-edit.html?id=${event.id}">Montar escala</a>
                <a class="action-btn action-ghost" href="event-print.html?id=${event.id}" target="_blank">Print</a>
                <button type="button" class="action-btn action-secondary" data-edit-id="${event.id}">Editar</button>
                <button type="button" class="action-btn action-danger" data-delete-id="${event.id}">Excluir</button>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");
  }

  async function loadData() {
    const response = await api("/events");
    events = response.data || [];
    renderEvents();

    const editParam = Number(getQueryParam("edit") || 0);
    if (editParam > 0) {
      startEdit(editParam);
    } else {
      resetForm();
    }
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearFlash();

    const payload = {
      type: typeField.value,
      event_date: dateField.value,
      label: labelField.value,
    };

    try {
      if (idField.value) {
        await api(`/events/${idField.value}`, { method: "PUT", body: payload });
        showFlash("Evento atualizado com sucesso.", "success");
      } else {
        await api("/events", { method: "POST", body: payload });
        showFlash("Evento criado com sucesso.", "success");
      }
      await loadData();
    } catch (error) {
      showFlash(error.message || "Falha ao salvar evento.", "error");
    }
  });

  cancelBtn.addEventListener("click", function () {
    resetForm();
  });

  eventsBody.addEventListener("click", async function (event) {
    const target = event.target;
    if (!target) {
      return;
    }

    const editId = target.getAttribute("data-edit-id");
    if (editId) {
      startEdit(Number(editId));
      return;
    }

    const deleteId = target.getAttribute("data-delete-id");
    if (!deleteId) {
      return;
    }

    if (!window.confirm("Deseja realmente excluir este evento?")) {
      return;
    }
    try {
      await api(`/events/${deleteId}`, { method: "DELETE" });
      showFlash("Evento removido.", "success");
      await loadData();
    } catch (error) {
      showFlash(error.message || "Falha ao excluir evento.", "error");
    }
  });

  generateBtn.addEventListener("click", async function () {
    const month = monthInput.value;
    if (!month) {
      generateResult.textContent = "Selecione um mes.";
      return;
    }

    generateResult.textContent = "Gerando eventos...";
    try {
      const response = await api("/events/generate-weekends", {
        method: "POST",
        body: { month },
      });
      generateResult.textContent = response.data?.message || "Geracao concluida.";
      await loadData();
    } catch (error) {
      generateResult.textContent = error.message || "Falha ao gerar eventos.";
    }
  });

  try {
    await loadData();
  } catch (error) {
    showFlash(error.message || "Falha ao carregar eventos.", "error");
  }
}
