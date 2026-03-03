import { api, escapeHtml, formatDateBr, showFlash } from "./common.js";

export async function initDashboardPage() {
  const cardCollaborators = document.getElementById("cardCollaborators");
  const cardActive = document.getElementById("cardActive");
  const cardEvents = document.getElementById("cardEvents");
  const cardShifts = document.getElementById("cardShifts");
  const nextEventsBody = document.getElementById("nextEventsBody");

  if (!cardCollaborators || !cardActive || !cardEvents || !cardShifts || !nextEventsBody) {
    return;
  }

  try {
    const response = await api("/dashboard");
    const data = response.data || {};

    cardCollaborators.textContent = String(data.collaborators || 0);
    cardActive.textContent = String(data.activeCollaborators || 0);
    cardEvents.textContent = String(data.events || 0);
    cardShifts.textContent = String(data.shifts || 0);

    const nextEvents = Array.isArray(data.nextEvents) ? data.nextEvents : [];
    if (nextEvents.length === 0) {
      nextEventsBody.innerHTML = "<tr><td colspan=\"4\">Sem eventos futuros.</td></tr>";
      return;
    }

    nextEventsBody.innerHTML = nextEvents
      .map(
        (event) => `
          <tr>
            <td>${escapeHtml(formatDateBr(event.event_date))}</td>
            <td>${escapeHtml(event.type)}</td>
            <td>${escapeHtml(event.label)}</td>
            <td>
              <div class="table-actions">
                <a class="action-btn action-primary" href="event-edit.html?id=${event.id}">Montar</a>
                <a class="action-btn action-ghost" href="event-print.html?id=${event.id}" target="_blank">Print</a>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");
  } catch (error) {
    nextEventsBody.innerHTML = "<tr><td colspan=\"4\">Falha ao carregar dashboard.</td></tr>";
    showFlash(error.message || "Falha ao carregar dashboard.", "error");
  }
}
