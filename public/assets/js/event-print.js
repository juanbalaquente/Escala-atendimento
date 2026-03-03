import { api, escapeHtml, formatDateBr, getQueryParam, showFlash } from "./common.js";

export async function initEventPrintPage() {
  const eventId = Number(getQueryParam("id") || getQueryParam("event_id") || 0);
  const eventHeader = document.getElementById("printEventHeader");
  const teamsContainer = document.getElementById("printTeamsContainer");
  const backToEdit = document.getElementById("backToEdit");

  if (!eventHeader || !teamsContainer || !backToEdit) {
    return;
  }

  if (eventId <= 0) {
    showFlash("Evento invalido.", "error");
    return;
  }

  backToEdit.href = `event-edit.html?id=${eventId}`;

  try {
    const response = await api(`/events/${eventId}/shifts`);
    const data = response.data || {};
    const event = data.event;
    const teams = data.teams || [];
    const rows = data.rows || [];

    if (!event) {
      showFlash("Evento nao encontrado.", "error");
      return;
    }

    eventHeader.textContent = `${formatDateBr(event.event_date)} - ${event.label} (${event.type})`;

    const teamById = {};
    teams.forEach((team) => {
      teamById[Number(team.id)] = team.name;
    });

    const grouped = {};
    rows.forEach((row) => {
      const teamName = teamById[Number(row.team_id)] || "Equipe";
      if (!grouped[teamName]) {
        grouped[teamName] = [];
      }
      grouped[teamName].push(row);
    });

    const teamNames = Object.keys(grouped);
    if (teamNames.length === 0) {
      teamsContainer.innerHTML = "<p>Nenhuma linha de escala cadastrada para este evento.</p>";
      return;
    }

    teamsContainer.innerHTML = teamNames
      .map(
        (teamName) => `
          <article class="team-block">
            <h3>${escapeHtml(teamName)}</h3>
            <table>
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Turno</th>
                  <th>Pausa 10 1</th>
                  <th>Pausa 20</th>
                  <th>Pausa 10 2</th>
                </tr>
              </thead>
              <tbody>
                ${grouped[teamName]
                  .map(
                    (item) => `
                      <tr>
                        <td>${escapeHtml(item.collaborator_name)}</td>
                        <td>${escapeHtml(item.shift_start)} - ${escapeHtml(item.shift_end)}</td>
                        <td>${escapeHtml(item.break_10_1)}</td>
                        <td>${escapeHtml(item.break_20)}</td>
                        <td>${escapeHtml(item.break_10_2)}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </article>
        `,
      )
      .join("");
  } catch (error) {
    showFlash(error.message || "Falha ao carregar tela de impressao.", "error");
  }
}
