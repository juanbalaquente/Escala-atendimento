import { api, showFlash, clearFlash, escapeHtml, formatDateBr } from "./common.js";

function isEventsPage() {
  const path = (window.location.pathname || "").toLowerCase();
  return path.endsWith("/events") || path.endsWith("/events.html");
}

function getTbody() {
  return document.querySelector("table tbody");
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

      const editHref = `event-edit.html?id=${encodeURIComponent(id)}`;
      const printHref = `event-print.html?id=${encodeURIComponent(id)}`;

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
    renderEvents(res?.data ?? []);
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

function normalizeMonth(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v; // YYYY-MM

  // MM/YY -> 20YY-MM
  const m = v.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (m) return `20${m[2]}-${m[1]}`;

  // MM/YYYY -> YYYY-MM
  const m2 = v.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1]}`;

  return "";
}

function toIsoDateFromInput(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

/**
 * Procura o card "Novo evento" e retorna { typeSelect, dateInput, labelInput, createButton }
 */
function findNewEventForm() {
  const cards = Array.from(document.querySelectorAll("section, div, article"));
  const card = cards.find((el) => (el.textContent || "").toLowerCase().includes("novo evento"));
  if (!card) return null;

  const selects = card.querySelectorAll("select");
  const inputs = card.querySelectorAll("input");
  const buttons = Array.from(card.querySelectorAll("button"));

  const typeSelect = selects[0] || null;
  const dateInput = Array.from(inputs).find((i) => i.type === "date") || inputs[0] || null;
  const labelInput = inputs.length >= 2 ? inputs[1] : null;

  const createButton = buttons.find((b) => (b.textContent || "").trim().toLowerCase() === "criar") || null;

  return { typeSelect, dateInput, labelInput, createButton };
}

/**
 * Procura o card "Gerar FDS do mes" e retorna { monthInput, button }
 */
function findGenerateMonthForm() {
  const cards = Array.from(document.querySelectorAll("section, div, article"));
  const card = cards.find((el) => (el.textContent || "").toLowerCase().includes("gerar fds do mes"));
  if (!card) return null;

  const monthInput = card.querySelector("input") || null;
  const button =
    Array.from(card.querySelectorAll("button")).find((b) => (b.textContent || "").toLowerCase().includes("gerar fds")) ||
    null;

  return { monthInput, button };
}

function wireActions() {
  // Delete na tabela
  const tbody = getTbody();
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest("button[data-action='delete']");
      if (!btn) return;
      deleteEvent(btn.getAttribute("data-id"));
    });
  }

  // Criar evento
  const newEvent = findNewEventForm();
  if (newEvent?.createButton) {
    newEvent.createButton.addEventListener("click", async (e) => {
      e.preventDefault();

      const type = String(newEvent.typeSelect?.value || "").trim().toUpperCase();
      const event_date = toIsoDateFromInput(newEvent.dateInput?.value);
      const label = String(newEvent.labelInput?.value || "").trim();

      if (!type || !event_date || !label) {
        showFlash("Preencha Tipo, Data e Label para criar o evento.", "error");
        return;
      }

      try {
        clearFlash();
        await api("/events", { method: "POST", body: { type, event_date, label } });
        showFlash("Evento criado com sucesso.", "success");
        if (newEvent.labelInput) newEvent.labelInput.value = "";
        await loadEvents();
      } catch (err) {
        showFlash(err?.message || "Falha ao criar evento.", "error");
      }
    });
  }

  // Gerar FDS do mês
  const gen = findGenerateMonthForm();
  if (gen?.button) {
    gen.button.addEventListener("click", async (e) => {
      e.preventDefault();

      const month = normalizeMonth(gen.monthInput?.value);
      if (!month) {
        showFlash("Mês inválido. Use YYYY-MM (ex: 2026-05) ou MM/AA (ex: 05/26).", "error");
        return;
      }

      try {
        clearFlash();
        const res = await api("/events/generate-weekends", { method: "POST", body: { month } });
        showFlash(res?.data?.message || "FDS gerados.", "success");
        await loadEvents();
      } catch (err) {
        showFlash(err?.message || "Falha ao gerar FDS do mês.", "error");
      }
    });
  }
}

export function initEventsPage() {
  if (!isEventsPage()) return;
  wireActions();
  loadEvents();
}

document.addEventListener("DOMContentLoaded", () => initEventsPage());
