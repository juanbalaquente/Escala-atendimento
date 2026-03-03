const storageApiBase =
  typeof window !== "undefined" ? String(localStorage.getItem("escala_api_base") || "").trim() : "";

const runtimeApiBase =
  typeof window !== "undefined" && typeof window.ESCALA_API_BASE === "string"
    ? window.ESCALA_API_BASE.trim()
    : "";

const configuredApiBase = runtimeApiBase || storageApiBase;

// Auto-fallback para ambiente Pages.dev (sem dominio proprio):
// - Se estiver em *.pages.dev e nao houver override, usa o Worker.dev diretamente.
const autoApiBase =
  typeof window !== "undefined" &&
  window.location &&
  window.location.hostname.endsWith(".pages.dev")
    ? "https://escala-api.juangrochowski.workers.dev/api"
    : "";

// Prioridade: runtime > localStorage > auto (pages.dev) > "/api" (mesmo dominio)
export const API_BASE = (configuredApiBase || autoApiBase || "/api").replace(/\/+$/, "");

export function initTheme() {
  const select = document.getElementById("themeSelect");
  if (!select) {
    return;
  }

  function chooseTheme(theme) {
    const normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", normalized);
    document.body.setAttribute("data-theme", normalized);
    localStorage.setItem("escala-theme", normalized);
    select.value = normalized;
  }

  const savedTheme = localStorage.getItem("escala-theme");
  chooseTheme(savedTheme === "dark" ? "dark" : "light");

  select.addEventListener("change", function () {
    chooseTheme(select.value);
  });
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatDateBr(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "";
  }
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

export function getQueryParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

export function setQueryParam(key, value) {
  const params = new URLSearchParams(window.location.search);
  if (value == null || value === "") {
    params.delete(key);
  } else {
    params.set(key, String(value));
  }
  const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
  window.history.replaceState({}, "", next);
}

export function showFlash(message, type = "success") {
  const host = document.getElementById("flashHost");
  if (!host) {
    return;
  }
  host.innerHTML = `<div class="alert ${type === "error" ? "error" : "success"}">${escapeHtml(message)}</div>`;
}

export function clearFlash() {
  const host = document.getElementById("flashHost");
  if (!host) {
    return;
  }
  host.innerHTML = "";
}

export function showValidationResult(lines, isSuccess) {
  const box = document.getElementById("validationResult");
  if (!box) {
    return;
  }

  if (!lines || lines.length === 0) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  box.classList.remove("hidden", "error", "success");
  box.classList.add(isSuccess ? "success" : "error");
  box.innerHTML = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
}

export async function api(path, options) {
  const init = Object.assign({}, options || {});
  init.headers = Object.assign({}, init.headers || {});

  if (init.body && typeof init.body !== "string") {
    init.body = JSON.stringify(init.body);
    init.headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (e) {
    const err = new Error("Falha de rede ao acessar a API. Verifique bloqueadores/extensões.");
    err.cause = e;
    err.data = null;
    err.status = 0;
    throw err;
  }

  let data = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const err = new Error((data && data.error) || `Erro na requisicao (HTTP ${response.status}).`);
    err.data = data;
    err.status = response.status;
    throw err;
  }

  // Garante um retorno consistente para o front
  return data ?? { ok: true, data: null, error: null };
}
