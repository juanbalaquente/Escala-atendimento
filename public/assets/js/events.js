import { api, showFlash, clearFlash, escapeHtml, formatDateBr } from "./common.js";

function getTbody() {
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

// ---------- NOVO: Criar evento ----------
function findCreateFields() {
  // tenta ids comuns; se não achar, tenta inputs pela posição (fallback)
  const type =
    document.querySelector("#newEventType") ||
    document.querySelector("select[name='type']") ||
    document.querySelector("select");

  const date =
    document.querySelector("#newEventDate") ||
    document.querySelector("input[name='event_date']") ||
    document.querySelector("input[type='date']") ||
    document.querySelector("input[placeholder*='dd']");

  const label =
    document.querySelector("#newEventLabel") ||
    document.querySelector("input[name='label']") ||
    document.querySelector("input[placeholder*='Sábado']") ||
    document.querySelector("input[placeholder*='Sabado']");

  // botão "Criar"
  const createBtn =
    document.querySelector("#createEventBtn") ||
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Criar");

  return { type, date, label, createBtn };
}

function toIsoDateFromInput(value) {
  const v = String(value || "").trim();
  // input type=date -> YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // dd/mm/aaaa
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

async function createEvent() {
  const { type, date, label } = findCreateFields();

  const typeVal = String(type?.value || "").trim().toUpperCase();
  const dateVal = toIsoDateFromInput(date?.value);
  const labelVal = String(label?.value || "").trim();

  if (!typeVal || !dateVal || !labelVal) {
    showFlash("Preencha Tipo, Data e Label para criar o evento.", "error");
    return;
  }

  try {
    clearFlash();
    await api("/events", {
      method: "POST",
      body: { type: typeVal, event_date: dateVal, label: labelVal },
    });
    showFlash("Evento criado com sucesso.", "success");
    if (label) label.value = "";
    await loadEvents();
  } catch (err) {
    showFlash(err?.message || "Falha ao criar evento.", "error");
  }
}

function wireCreateEvent() {
  const { createBtn } = findCreateFields();
  if (!createBtn) return;

  createBtn.addEventListener("click", (e) => {
    e.preventDefault();
    createEvent();
  });
}

// ---------- NOVO: Gerar FDS do mês ----------
function findWeekendFields() {
  const monthInput =
    document.querySelector("#weekendsMonth") ||
    document.querySelector("input[name='month']") ||
    document.querySelector("input[placeholder*='YYYY']") ||
    // fallback: o input do bloco "Gerar FDS do mes" costuma ser o primeiro input desse bloco
    Array.from(document.querySelectorAll("input")).find((i) => i.closest("section,div")?.textContent?.includes("Gerar FDS"));

  const btn =
    document.querySelector("#generateWeekendsBtn") ||
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Gerar FDS"));

  return { monthInput, btn };
}

function normalizeMonth(value) {
  const v = String(value || "").trim();

  // já está em YYYY-MM
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;

  // aceita MM/YY (ex: 05/26) -> 2026-05
  const m = v.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (m) return `20${m[2]}-${m[1]}`;

  // aceita MM/YYYY -> YYYY-MM
  const m2 = v.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1]}`;

  return "";
}

async function generateWeekends() {
  const { monthInput } = findWeekendFields();
  const month = normalizeMonth(monthInput?.value);

  if (!month) {
    showFlash("Mês inválido. Use YYYY-MM (ex: 2026-05) ou MM/AA (ex: 05/26).", "error");
    return;
  }

  try {
    clearFlash();
    const res = await api("/events/generate-weekends", { method: "POST", body: { month } });
    showFlash(res?.data?.message || "Finais de semana gerados.", "success");
    await loadEvents();
  } catch (err) {
    showFlash(err?.message || "Falha ao gerar FDS do mês.", "error");
  }
}

function wireGenerateWeekends() {
  const { btn } = findWeekendFields();
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    generateWeekends();
  });
}

// ✅ Export que seu app.js espera
export function initEventsPage() {
  wireDeleteAction();
  wireCreateEvent();
  wireGenerateWeekends();
  loadEvents();
}

// Fallback caso alguém abra events.html direto
document.addEventListener("DOMContentLoaded", () => {
  if (!window.__ESCALA_EVENTS_INIT__) {
    window.__ESCALA_EVENTS_INIT__ = true;
    initEventsPage();
  }
});