// Remplace par l'URL de ton projet Supabase (Project Settings > API > Project URL).
// Aucune clé n'est nécessaire côté navigateur : les fonctions gèrent elles-mêmes l'accès.
const SUPABASE_URL = "https://snvkycfbzuejrrtzcdqm.supabase.co";

const $ = (selector) => document.querySelector(selector);
const endpoint = (name) => `${SUPABASE_URL}/functions/v1/${name}`;
let adminPassword = "";
let photoData = "";

const configured = () => !SUPABASE_URL.includes("VOTRE_PROJECT_REF");

async function api(name, body = {}, password = "") {
  if (!configured()) throw new Error("Le site n’est pas encore configuré : renseigne l’URL Supabase dans app.js.");
  const headers = { "Content-Type": "application/json" };
  if (password) headers["x-admin-password"] = password;
  let response;
  try {
    response = await fetch(endpoint(name), { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new Error("Impossible de contacter le serveur. Vérifie ta connexion et réessaie.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue. Réessaie plus tard.");
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function showMessage(selector, message, error = false, html = false) {
  const el = $(selector);
  el.hidden = false;
  el.classList.remove("hidden", "error", "recipient-card");
  if (error) el.classList.add("error");
  if (html) el.innerHTML = message; else el.textContent = message;
  return el;
}
const busy = (button, state) => { button.disabled = state; };
const formatCode = (code) => (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code);

/* ---------- Ciel : étoiles et neige ---------- */
function buildSky() {
  const sky = $("#sky");
  if (!sky) return;
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 70; i++) {
    const star = document.createElement("i");
    star.className = "star";
    star.style.cssText = `left:${rnd(0, 100)}%;top:${rnd(0, 55)}%;--s:${rnd(1, 2.6).toFixed(1)}px;--d:${rnd(2, 6).toFixed(1)}s`;
    sky.appendChild(star);
  }
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < 40; i++) {
    const flake = document.createElement("i");
    flake.className = "flake";
    flake.style.cssText = `left:${rnd(0, 100)}%;--s:${rnd(2, 5).toFixed(1)}px;--d:${rnd(9, 20).toFixed(1)}s;--delay:-${rnd(0, 20).toFixed(1)}s;--x:${rnd(-60, 60).toFixed(0)}px`;
    sky.appendChild(flake);
  }
}
buildSky();

/* ---------- Photo : lecture, redimensionnement, compression ---------- */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}
async function compressImage(file, maxSide = 900) {
  if (!file.type.startsWith("image/")) throw new Error("Ce fichier n’est pas une image.");
  let source;
  try { source = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { source = await loadImage(file); }
  const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.75, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 1_300_000) return url;
  }
  throw new Error("Photo trop lourde.");
}
function resetPhoto() {
  photoData = "";
  $("#photo-input").value = "";
  $("#photo-preview").classList.add("hidden");
  $("#photo-placeholder").classList.remove("hidden");
  $("#photo-title").textContent = "Choisir ou prendre une photo";
}
$("#photo-input").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  photoData = "";
  if (!file) { resetPhoto(); return; }
  try {
    photoData = await compressImage(file);
    $("#photo-preview").src = photoData;
    $("#photo-preview").classList.remove("hidden");
    $("#photo-placeholder").classList.add("hidden");
    $("#photo-title").textContent = "Changer de photo";
    $("#signup-result").classList.add("hidden");
  } catch {
    resetPhoto();
    showMessage("#signup-result", "Impossible de lire cette photo. Essaie un fichier JPG ou PNG.", true);
  }
});

/* ---------- Inscription ---------- */
$("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector("button[type=submit]");
  const values = Object.fromEntries(new FormData(form));
  if (!values.first_name?.trim() || !values.last_name?.trim() || !values.phone?.trim()) {
    return showMessage("#signup-result", "Complète tous les champs.", true);
  }
  if (!photoData) return showMessage("#signup-result", "Ajoute une photo où l’on te reconnaît bien.", true);
  busy(button, true);
  try {
    const result = await api("register", {
      first_name: values.first_name.trim(),
      last_name: values.last_name.trim(),
      phone: values.phone.trim(),
      photo: photoData
    });
    const code = formatCode(result.code);
    showMessage("#signup-result",
      `<strong>Inscription confirmée !</strong><span class="secret-code">${escapeHtml(code)}</span>` +
      `Note ce code maintenant ou fais une capture d’écran : il ne sera plus affiché.<br>` +
      `<button type="button" class="copy-code" data-copy="${escapeHtml(code)}">Copier le code</button>`, false, true);
    form.reset();
    resetPhoto();
  } catch (err) {
    showMessage("#signup-result", err.message, true);
  } finally {
    busy(button, false);
  }
});
$("#signup-result").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-copy]");
  if (!btn) return;
  try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "Code copié"; }
  catch { btn.textContent = "Copie impossible : note-le à la main"; }
});

/* ---------- Révélation du destinataire ---------- */
$("#lookup-form [name=code]").addEventListener("input", (event) => {
  event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
});
$("#lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector("button[type=submit]");
  const code = new FormData(form).get("code");
  busy(button, true);
  try {
    const { recipient } = await api("lookup-recipient", { code });
    const photo = recipient.photo_url
      ? `<img class="recipient-photo" src="${escapeHtml(recipient.photo_url)}" alt="Photo de ${escapeHtml(recipient.first_name)}">`
      : "";
    const el = showMessage("#lookup-result",
      `<span>Tu offres un cadeau à</span>${photo}` +
      `<span class="recipient-name">${escapeHtml(recipient.first_name)} ${escapeHtml(recipient.last_name)}</span>` +
      `<span>Garde la surprise jusqu’au jour J !</span>`, false, true);
    el.classList.add("recipient-card");
  } catch (err) {
    showMessage("#lookup-result", err.message, true);
  } finally {
    busy(button, false);
  }
});

/* ---------- Administration ---------- */
function participantItem(p, drawn) {
  const photo = p.photo_url
    ? `<img src="${escapeHtml(p.photo_url)}" alt="" loading="lazy">`
    : `<span class="no-photo">?</span>`;
  return `<li class="participant" data-id="${escapeHtml(p.id)}">${photo}` +
    `<div class="p-info"><strong>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</strong>` +
    `<span>${escapeHtml(p.phone)}</span></div>` +
    `<div class="p-actions"><button type="button" class="mini" data-action="reset-code">Nouveau code</button>` +
    (drawn ? "" : `<button type="button" class="mini danger" data-action="delete">Supprimer</button>`) +
    `</div></li>`;
}
function renderResults(results = []) {
  const container = $("#admin-results");
  if (!results.length) { container.classList.add("hidden"); return; }
  const rows = results.map((r) =>
    `<tr><td>${escapeHtml(r.giver.first_name)} ${escapeHtml(r.giver.last_name)}</td>` +
    `<td>${escapeHtml(r.giver.phone)}</td>` +
    `<td>${escapeHtml(r.recipient.first_name)} ${escapeHtml(r.recipient.last_name)}</td></tr>`).join("");
  container.innerHTML = `<h3>Associations</h3><table><thead><tr><th>Participant</th><th>Téléphone</th><th>Offre à</th></tr></thead><tbody>${rows}</tbody></table>`;
  container.classList.remove("hidden");
}
function renderAdmin(data) {
  const panel = $("#admin-panel");
  panel.hidden = false;
  panel.classList.remove("hidden");
  $("#participant-count").textContent = data.participant_count;
  $("#draw-status").textContent = data.drawn ? "Effectué" : "En attente";
  $("#draw-button").disabled = data.drawn || data.participant_count < 2;
  const list = $("#participant-list");
  if (list) {
    list.innerHTML = data.participants.length
      ? data.participants.map((p) => participantItem(p, data.drawn)).join("")
      : `<li class="muted">Aucune inscription pour le moment.</li>`;
  }
  renderResults(data.results);
}
async function adminCall(body) {
  const data = await api("admin", body, adminPassword);
  renderAdmin(data);
  return data;
}

$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector("button[type=submit]");
  adminPassword = new FormData(form).get("password");
  busy(button, true);
  try {
    await adminCall({ action: "overview" });
    form.classList.add("hidden");
    $("#admin-message").classList.add("hidden");
  } catch (err) {
    adminPassword = "";
    showMessage("#admin-message", err.message, true);
  } finally {
    busy(button, false);
  }
});

$("#draw-button").addEventListener("click", async () => {
  if (!confirm("Confirmer le tirage définitif ? Il ne pourra pas être relancé depuis le site.")) return;
  const button = $("#draw-button");
  busy(button, true);
  try {
    const data = await adminCall({ action: "draw" });
    showMessage("#admin-message", `Tirage effectué : ${data.participant_count} participants associés.`);
  } catch (err) {
    showMessage("#admin-message", err.message, true);
    busy(button, false);
  }
});

$("#refresh-results").addEventListener("click", async () => {
  const button = $("#refresh-results");
  busy(button, true);
  try { await adminCall({ action: "overview" }); $("#admin-message").classList.add("hidden"); }
  catch (err) { showMessage("#admin-message", err.message, true); }
  finally { busy(button, false); }
});

$("#participant-list")?.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const item = btn.closest("[data-id]");
  const id = item.dataset.id;
  const name = item.querySelector("strong").textContent;
  busy(btn, true);
  try {
    if (btn.dataset.action === "delete") {
      if (!confirm(`Supprimer ${name} ? Son inscription et sa photo seront effacées.`)) return;
      await adminCall({ action: "delete", id });
      showMessage("#admin-message", `${name} a été supprimé(e).`);
    } else {
      if (!confirm(`Générer un nouveau code pour ${name} ? L’ancien code ne fonctionnera plus.`)) return;
      const data = await adminCall({ action: "reset-code", id });
      showMessage("#admin-message", `Nouveau code pour ${escapeHtml(name)} :<span class="secret-code">${escapeHtml(formatCode(data.code))}</span>Transmets-le lui en privé.`, false, true);
    }
  } catch (err) {
    showMessage("#admin-message", err.message, true);
  } finally {
    busy(btn, false);
  }
});

$("#admin-logout").addEventListener("click", () => {
  adminPassword = "";
  const panel = $("#admin-panel");
  panel.hidden = true;
  panel.classList.add("hidden");
  $("#admin-results").classList.add("hidden");
  if ($("#participant-list")) $("#participant-list").innerHTML = "";
  $("#admin-message").classList.add("hidden");
  $("#admin-login-form").classList.remove("hidden");
  $("#admin-login-form").reset();
});