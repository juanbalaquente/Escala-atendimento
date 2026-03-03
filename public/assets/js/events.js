import { api, showFlash, clearFlash, escapeHtml, formatDateBr } from "./common.js";

/**
 * AJUSTE SE NECESSÁRIO:
 * Se sua tabela de eventos tiver outro seletor (id/class), troque aqui.
 * Exemplo: "#events tbody" ou "#eventsTbody"
 */
const TABLE_BODY_SELECTOR = "#eventsTableBody";

/** Helpers */
function $(sel) {
  return document.querySelector(sel);
}

function setTableMessage(htmlRow) {
  const tbody = $(TABLE_BODY_SELECTOR);
  if (!tbody) return;
  tbody.innerHTML = htmlRow;
}

function toIsoDateFromInput(value) {
  // Aceita "YYYY-MM-DD" (input type=date) ou "DD/MM/YYYY"
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function toMonthYYYYMM(value) {
  // Aceita "YYYY-MM"
  const v = String(value || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;
  return "";
}

function renderEvents(events) {
  const tbody = $(TABLE_BODY_SELECTOR);
  if (!tbody) return;

  if (!Array.isArray(events) || events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Nenhum evento encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = events
    .map((ev) => {
      const id = ev.id ?? "";
      const date = ev.event_date ? formatDateBr(ev.event_date) : "";
      const type = ev.type ?? "";
      const label = ev.label ?? "";
      const shiftsCount = ev.shifts_count ?? 0;

      // Ações: Editar/Imprimir (se você tiver rotas/páginas)
      const editHref = `event-edit.html?event_id=${encodeURIComponent(id)}`;
      const printHref = `event-print.html?event_id=${encodeURIComponent(id)}`;

      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(String(shiftsCount))}</td>
        <td class="actions">
          <a class="btn btn-sm" href="${escapeHtml(editHref)}">Editar</a>
          <a class="btn btn-sm" href="${escapeHtml(printHref)}">Imprimir</a>
          <button class="btn btn-sm danger" data-action="delete" data-id="${escapeHtml(String(id))}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");
}

async function loadEvents() {
  setTableMessage(`<tr><td colspan="5">Carregando...</td></tr>`);

  try {
    clearFlash();
    const res = await api("/events", { method: "GET" });
    const events = res && res.data ? res.data : [];
    renderEvents(events);
  } catch (err) {
    const msg = err?.message || "Falha ao carregar eventos.";
    showFlash(msg, "error");
    setTableMessage(`<tr><td colspan="5">Erro ao carregar.</td></tr>`);
  }
}

async function createEvent() {
  const typeEl = $("#newEventType");
  const dateEl = $("#newEventDate");
  const labelEl = $("#newEventLabel");

  const type = String(typeEl?.value || "").trim();
  const event_date = toIsoDateFromInput(dateEl?.value);
  const label = String(labelEl?.value || "").trim();

  if (!type || !event_date || !label) {
    showFlash("Preencha Tipo, Data e Label.", "error");
    return;
  }

  try {
    clearFlash();
    await api("/events", {
      method: "POST",
      body: { type, event_date, label },
    });
    showFlash("Evento criado com sucesso.", "success");

    // limpa campos
    if (labelEl) labelEl.value = "";
    await loadEvents();
  } catch (err) {
    showFlash(err?.message || "Falha ao criar evento.", "error");
  }
}

async function generateWeekends() {
  const monthEl = $("#weekendsMonth");
  const month = toMonthYYYYMM(monthEl?.value);

  if (!month) {
    showFlash("Mês inválido. Use YYYY-MM.", "error");
    return;
  }

  try {
    clearFlash();
    const res = await api("/events/generate-weekends", {
      method: "POST",
      body: { month },
    });
    showFlash((res && res.data && res.data.message) ? res.data.message : "Geração concluída.", "success");
    await loadEvents();
  } catch (err) {
    showFlash(err?.message || "Falha ao gerar finais de semana.", "error");
  }
}

async function deleteEvent(id) {
  if (!id) return;
  const ok = confirm("Deseja realmente remover este evento?");
  if (!ok) return;

  try {
    clearFlash();
    await api(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    showFlash("Evento removido.", "success");
    await loadEvents();
  } catch (err) {
    showFlash(err?.message || "Falha ao remover evento.", "error");
  }
}

function wireActions() {
  // Botão Criar
  const createBtn = $("#createEventBtn");
  if (createBtn) {
    createBtn.addEventListener("click", (e) => {
      e.preventDefault();
      createEvent();
    });
  }

  // Botão Gerar FDS do mês
  const genBtn = $("#generateWeekendsBtn");
  if (genBtn) {
    genBtn.addEventListener("click", (e) => {
      e.preventDefault();
      generateWeekends();
    });
  }

  // Delegação para excluir
  const tbody = $(TABLE_BODY_SELECTOR);
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const btn = target.closest("button[data-action='delete']");
      if (!btn) return;

      const id = btn.getAttribute("data-id");
      deleteEvent(id);
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  wireActions();
  loadEvents();
});