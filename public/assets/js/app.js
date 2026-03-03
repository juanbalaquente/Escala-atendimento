import { initTheme } from "./common.js";
import { initDashboardPage } from "./dashboard.js";
import { initCollaboratorsPage } from "./collaborators.js";
import { initEventsPage } from "./events.js";
import { initEventEditPage } from "./event-edit.js";
import { initEventPrintPage } from "./event-print.js";

document.addEventListener("DOMContentLoaded", async function () {
  initTheme();

  const page = document.body.dataset.page;
  if (page === "dashboard") {
    await initDashboardPage();
    return;
  }
  if (page === "collaborators") {
    await initCollaboratorsPage();
    return;
  }
  if (page === "events") {
    await initEventsPage();
    return;
  }
  if (page === "event-edit") {
    await initEventEditPage();
    return;
  }
  if (page === "event-print") {
    await initEventPrintPage();
  }
});
