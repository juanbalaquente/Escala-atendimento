import { api, showFlash, clearFlash, escapeHtml, formatDateBr } from "./common.js";

/**
 * Só roda na página de eventos.
 * - pathname pode ser "/events" ou "/events.html" dependendo do seu setup.
 */
function isEventsPage() {
  const path = (window.location.pathname || "").toLowerCase();
  if (path.endsWith("/events") || path.endsWith("/events.html")) return true;

  // fallback: checa se existe o bloco "Novo evento" + botão "Gerar FDS do mes"
  const hasNewEvent = !!document.querySelector("h2, h3, h4")?.textContent?.toLowerCase().includes("novo evento");
  const hasGenerateBtn = Array.from(document.querySelectorAll("button")).some((b) =>
    (b.textContent || "").toLowerCase().includes("gerar fds")
  );
  return hasNewEvent || hasGenerateBtn;
}

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

function normalizeMonth(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v; // YYYY-MM

  // aceita MM/YY (05/26 -> 2026-05)
  const m = v.match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
  if (m) return `20${m[2]}-${m[1]}`;

  // aceita MM/YYYY
  const m2 = v.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  if (m2) return `${m2[2]}-${m2[1]}`;

  return "";
}

function toIsoDateFromInput(value) {
  const v = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; // input type=date

  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return "";
}

function wireActions() {
  // IDs esperados SOMENTE na página de eventos:
  const typeEl = document.querySelector("#newEventType");
  const dateEl = document.querySelector("#newEventDate");
  const labelEl = document.querySelector("#newEventLabel");
  const createBtn = document.querySelector("#createEventBtn");

  const monthEl = document.querySelector("#weekendsMonth");
  const genBtn = document.querySelector("#generateWeekendsBtn");

  // se não achar os elementos, não faz bind (não interfere em outras páginas)
  if (createBtn && typeEl && dateEl && labelEl) {
    createBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const type = String(typeEl.value || "").trim().toUpperCase();
      const event_date = toIsoDateFromInput(dateEl.value);
      const label = String(labelEl.value || "").trim();

      if (!type || !event_date || !label) {
        showFlash("Preencha Tipo, Data e Label para criar o evento.", "error");
        return;
      }

      try {
        clearFlash();
        await api("/events", { method: "POST", body: { type, event_date, label } });
        showFlash("Evento criado com sucesso.", "success");
        labelEl.value = "";
        await loadEvents();
      } catch (err) {
        showFlash(err?.message || "Falha ao criar evento.", "error");
      }
    });
  }

  if (genBtn && monthEl) {
    genBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const month = normalizeMonth(monthEl.value);

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
}

// Export que seu app.js chama
export function initEventsPage() {
  if (!isEventsPage()) return;
  wireActions();
  loadEvents();
}

// fallback se abrir events.html direto
document.addEventListener("DOMContentLoaded", () => {
  initEventsPage();
});