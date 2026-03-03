import { api, showFlash, clearFlash, escapeHtml, formatDateBr } from "./common.js";

const TABLE_BODY_SELECTOR = "#eventsTableBody, #events tbody, table tbody";

function $(sel) {
  return document.querySelector(sel);
}



function toIsoDateFromInput(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function toMonthYYYYMM(value) {
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
    showFlash(err?.message || "Falha ao carregar eventos.", "error");
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
    await api("/events", { method: "POST", body: { type, event_date, label } });
    showFlash("Evento criado com sucesso.", "success");
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
    const res = await api("/events/generate-weekends", { method: "POST", body: { month } });
    const msg = res?.data?.message || "Geração concluída.";
    showFlash(msg, "success");
    await loadEvents();
  } catch (err) {
    showFlash(err?.message || "Falha ao gerar finais de semana.", "error");
  }
}

async function deleteEvent(id) {
  if (!id) return;
  if (!confirm("Deseja realmente remover este evento?")) return;

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
  const createBtn = $("#createEventBtn");
  if (createBtn) {
    createBtn.addEventListener("click", (e) => {
      e.preventDefault();
      createEvent();
    });
  }

  const genBtn = $("#generateWeekendsBtn");
  if (genBtn) {
    genBtn.addEventListener("click", (e) => {
      e.preventDefault();
      generateWeekends();
    });
  }

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

// ✅ Export que o app.js espera
export function initEventsPage() {
  wireActions();
  loadEvents();
}

// Se você abrir events.html direto sem app.js, ainda funciona:
document.addEventListener("DOMContentLoaded", () => {
  // evita dupla inicialização caso app.js já chame
  if (!window.__ESCALA_EVENTS_INIT__) {
    window.__ESCALA_EVENTS_INIT__ = true;
    initEventsPage();
  }
});