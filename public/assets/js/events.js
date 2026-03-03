import { api, showFlash, clearFlash, escapeHtml, formatDateBr } from "./common.js";

// Pega o <tbody> da tabela de eventos (há 1 na página, conforme seu teste)
function getTbody() {
  // Se no futuro você quiser um id específico, coloque primeiro aqui:
  return document.querySelector("#eventsTableBody") || document.querySelector("table tbody");
}

function setTableMessage(htmlRow) {
  const tbody = getTbody();
  if (!tbody) return;
  tbody.innerHTML = htmlRow;
}

function renderEvents(events) {
  const tbody = getTbody();
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
    const events = res?.data ?? [];
    renderEvents(events);
  } catch (err) {
    showFlash(err?.message || "Falha ao carregar eventos.", "error");
    setTableMessage(`<tr><td colspan="5">Erro ao carregar.</td></tr>`);
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

function wireDeleteAction() {
  const tbody = getTbody();
  if (!tbody) return;

  tbody.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;

    const btn = target.closest("button[data-action='delete']");
    if (!btn) return;

    const id = btn.getAttribute("data-id");
    deleteEvent(id);
  });
}

// ✅ Export que seu app.js espera
export function initEventsPage() {
  wireDeleteAction();
  loadEvents();
}

// Fallback caso alguém abra events.html direto
document.addEventListener("DOMContentLoaded", () => {
  if (!window.__ESCALA_EVENTS_INIT__) {
    window.__ESCALA_EVENTS_INIT__ = true;
    initEventsPage();
  }
});