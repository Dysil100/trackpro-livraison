/* ===========================
   TRACKPRO - Main Application
   =========================== */

// ── State ────────────────────────────────────────────
const API = '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let map = null;
let mapMarkers = {};
let simulationInterval = null;
let socket = null;
let colisPage = 1;
let colisTotal = 0;
let chartDaily = null;
let chartStatut = null;
let chartMonthly = null;
let currentGeneratedOTP = null;
let currentColisIdForOTP = null;
let livEditId = null;

// ── Helpers ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const headers = (extra = {}) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...extra
});

async function apiFetch(path, opts = {}) {
  const r = await fetch(`${API}${path}`, {
    headers: headers(),
    ...opts,
    ...(opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData) ? {
      body: JSON.stringify(opts.body),
      headers: headers()
    } : {})
  });
  if (r.status === 401) { logout(); return null; }
  return r;
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '<i class="fas fa-check-circle"></i>', error: '<i class="fas fa-times-circle"></i>', info: '<i class="fas fa-info-circle"></i>' };
  el.innerHTML = `${icons[type]||icons.info} <span>${msg}</span>`;
  $('toast-container').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3500);
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function statusBadge(s) {
  const labels = {
    enregistre: 'Enregistré', en_transit: 'En transit', en_livraison: 'En livraison',
    livre: 'Livré', echec: 'Échec', retour: 'Retour', perdu: 'Perdu',
    planifiee: 'Planifiée', en_cours: 'En cours', livree: 'Livrée',
    disponible: 'Disponible', inactif: 'Inactif', ouvert: 'Ouvert',
    resolu: 'Résolu', ferme: 'Fermé'
  };
  return `<span class="status-badge status-${s}">${labels[s] || s}</span>`;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Auth ──────────────────────────────────────────────
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('login-error').textContent = '';
  $('login-btn').disabled = true;
  $('login-btn').innerHTML = '<span>Connexion...</span>';
  const email = $('login-email').value;
  const password = $('login-password').value;
  try {
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) { $('login-error').textContent = data.error || 'Erreur'; return; }
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    initApp();
  } catch (err) {
    $('login-error').textContent = 'Erreur de connexion';
  } finally {
    $('login-btn').disabled = false;
    $('login-btn').innerHTML = '<span>Se connecter</span>';
  }
});

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  if (socket) socket.disconnect();
  $('app').classList.add('hidden');
  $('login-page').classList.remove('hidden');
}

$('logout-btn').addEventListener('click', logout);

// ── Init ──────────────────────────────────────────────
function initApp() {
  const stored = localStorage.getItem('user');
  if (!token || !stored) { $('login-page').classList.remove('hidden'); return; }
  currentUser = JSON.parse(stored);
  $('login-page').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('user-name').textContent = currentUser.nom;
  $('user-avatar').textContent = (currentUser.nom || 'U')[0].toUpperCase();
  $('user-role').textContent = currentUser.role === 'admin' ? 'Administrateur' : currentUser.role === 'agent' ? 'Agent' : 'Client';

  // Hide admin-only items for non-admin
  if (currentUser.role !== 'admin') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  // Setup socket
  socket = io();
  socket.on('position_update', data => {
    updateMapMarker(data.livreur_id, data.latitude, data.longitude);
  });

  // Sidebar toggle
  $('sidebar-toggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('collapsed');
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigate(item.dataset.page);
    });
  });

  // Set default report dates
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  $('report-from').value = monthAgo;
  $('report-to').value = today;

  navigate('dashboard');
  loadNotifBadge();
}

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const pageEl = $(`page-${page}`);
  const navEl = $(`nav-${page}`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  // Load page data
  const loaders = {
    dashboard: loadDashboard,
    colis: loadColis,
    livraisons: loadLivraisons,
    livreurs: loadLivreurs,
    map: initMap,
    notifications: loadNotifications,
    incidents: loadIncidents,
    reports: loadReports,
    users: loadUsers,
    tracking: () => {}
  };
  if (loaders[page]) loaders[page]();
}

// ── DASHBOARD ─────────────────────────────────────────
async function loadDashboard() {
  const r = await apiFetch('/dashboard');
  if (!r || !r.ok) return;
  const data = await r.json();
  const s = data.stats;
  $('stat-total').textContent = s.total_colis || 0;
  $('stat-attente').textContent = s.en_attente || 0;
  $('stat-cours').textContent = s.en_cours || 0;
  $('stat-livres').textContent = s.livres || 0;
  $('stat-echecs').textContent = s.echecs || 0;
  $('stat-taux').textContent = (s.taux_livraison || 0) + '%';

  // Daily chart
  if (chartDaily) chartDaily.destroy();
  const dailyCtx = $('chart-daily').getContext('2d');
  const labels = data.dailyStats.map(d => new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
  chartDaily = new Chart(dailyCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Total', data: data.dailyStats.map(d => d.total), borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.4 },
        { label: 'Livrés', data: data.dailyStats.map(d => d.livres), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.4 }
      ]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } } } }
  });

  // Statut donut
  if (chartStatut) chartStatut.destroy();
  const statCtx = $('chart-statut').getContext('2d');
  const statColors = { enregistre: '#94a3b8', en_transit: '#f59e0b', en_livraison: '#818cf8', livre: '#10b981', echec: '#ef4444', retour: '#fbbf24', perdu: '#f87171' };
  chartStatut = new Chart(statCtx, {
    type: 'doughnut',
    data: {
      labels: data.byStatut.map(s => s.statut),
      datasets: [{ data: data.byStatut.map(s => s.count), backgroundColor: data.byStatut.map(s => statColors[s.statut] || '#334155'), borderWidth: 0 }]
    },
    options: { responsive: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } } }, cutout: '65%' }
  });

  // Recent colis
  const tbody = $('recent-colis-body');
  tbody.innerHTML = data.recentColis.map(c => `
    <tr>
      <td><code style="color:var(--primary-light)">${c.numero_suivi}</code></td>
      <td>${statusBadge(c.statut)}</td>
      <td>${c.dest_nom||'—'}</td>
      <td>${c.dest_ville||'—'}</td>
      <td>${formatDateShort(c.created_at)}</td>
    </tr>
  `).join('');

  // Retards
  const retards = $('retards-list');
  if (data.retards.length === 0) {
    retards.innerHTML = '<p style="color:var(--success);padding:16px;text-align:center"><i class="fas fa-circle-check"></i> Aucun retard détecté</p>';
  } else {
    retards.innerHTML = data.retards.map(r => `
      <div class="retard-item">
        <td><div class="retard-num">${r.numero_suivi}</div>
        <div>${r.dest_nom||'—'} · ${statusBadge(r.statut)}</div>
        <div style="color:var(--text-muted);font-size:11px;margin-top:4px">Depuis le ${formatDateShort(r.created_at)}</div></div>
    `).join('');
  }
}

// ── COLIS ─────────────────────────────────────────────
async function loadColis(page = 1) {
  colisPage = page;
  const search = $('colis-search').value;
  const statut = $('colis-statut-filter').value;
  let url = `/colis?page=${page}&limit=15`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  if (statut) url += `&statut=${statut}`;
  const r = await apiFetch(url);
  if (!r || !r.ok) return;
  const data = await r.json();
  colisTotal = data.total;
  const tbody = $('colis-tbody');
  tbody.innerHTML = data.colis.map(c => `
    <tr>
      <td><code style="color:var(--primary-light);cursor:pointer" onclick="showColisDetail('${c.id}')">${c.numero_suivi}</code></td>
      <td>${c.type_colis}</td>
      <td>${c.exp_nom||'—'}</td>
      <td>${c.dest_nom||'—'} <br><small style="color:var(--text-muted)">${c.dest_ville||''}</small></td>
      <td>${statusBadge(c.statut)}</td>
      <td>${c.type_livraison === 'express' ? '<span class="status-badge" style="background:rgba(245,158,11,0.15);color:#f59e0b">Express</span>' : 'Standard'}</td>
      <td style="font-size:12px">${formatDateShort(c.created_at)}</td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-ghost" title="Voir détail" onclick="showColisDetail('${c.id}')"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-ghost" title="Modifier statut" onclick="openStatutModal('${c.id}','${c.statut}')"><i class="fas fa-pen"></i></button>
          ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" title="Supprimer" onclick="deleteColis('${c.id}')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:40px">Aucun colis trouvé</td></tr>';

  // Pagination
  const totalPages = Math.ceil(colisTotal / 15);
  const pag = $('colis-pagination');
  if (totalPages <= 1) { pag.innerHTML = ''; return; }
  let pagHtml = `<span class="pagination-info">${colisTotal} colis</span>`;
  for (let i = 1; i <= totalPages; i++) {
    pagHtml += `<button ${i === page ? 'class="active"' : ''} onclick="loadColis(${i})">${i}</button>`;
  }
  pag.innerHTML = pagHtml;
}

function openColisModal() {
  document.getElementById('colis-form').reset();
  $('colis-modal-title').textContent = 'Nouveau Colis';
  showModal('modal-colis');
}

async function saveColis() {
  const body = {
    type_colis: $('f-type-colis').value,
    type_livraison: $('f-type-livraison').value,
    poids: parseFloat($('f-poids').value) || null,
    valeur_declaree: parseFloat($('f-valeur').value) || null,
    description: $('f-description').value || null,
    notes: $('f-notes').value || null,
    expediteur: {
      nom: $('f-exp-nom').value, telephone: $('f-exp-tel').value,
      email: $('f-exp-email').value, adresse: $('f-exp-adresse').value,
      ville: $('f-exp-ville').value
    },
    destinataire: {
      nom: $('f-dest-nom').value, telephone: $('f-dest-tel').value,
      email: $('f-dest-email').value, adresse: $('f-dest-adresse').value,
      ville: $('f-dest-ville').value
    }
  };
  if (!body.expediteur.nom || !body.expediteur.telephone || !body.destinataire.nom || !body.destinataire.telephone || !body.expediteur.adresse || !body.destinataire.adresse) {
    return toast('Veuillez remplir tous les champs obligatoires', 'error');
  }
  const r = await apiFetch('/colis', { method: 'POST', body });
  if (!r) return;
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast(`Colis créé — N° de suivi: ${data.colis.numero_suivi}`, 'success');
  closeAllModals();
  loadColis();
}

async function showColisDetail(id) {
  const r = await apiFetch(`/colis/${id}`);
  if (!r || !r.ok) return;
  const { colis: c, historique } = await r.json();
  $('detail-title').textContent = `Colis #${c.numero_suivi}`;
  $('colis-detail-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-section">
        <h4>📦 Informations</h4>
        <div class="detail-row"><label>Numéro</label><span style="color:var(--primary-light);font-family:monospace">${c.numero_suivi}</span></div>
        <div class="detail-row"><label>Type</label><span>${c.type_colis}</span></div>
        <div class="detail-row"><label>Livraison</label><span>${c.type_livraison === 'express' ? '⚡ Express' : '📦 Standard'}</span></div>
        <div class="detail-row"><label>Poids</label><span>${c.poids ? c.poids + ' kg' : '—'}</span></div>
        <div class="detail-row"><label>Statut</label><span>${statusBadge(c.statut)}</span></div>
        <div class="detail-row"><label>Créé le</label><span>${formatDate(c.created_at)}</span></div>
      </div>
      <div class="detail-section">
        <h4>📤 Expéditeur</h4>
        <div class="detail-row"><label>Nom</label><span>${c.exp_nom||'—'}</span></div>
        <div class="detail-row"><label>Téléphone</label><span>${c.exp_tel||'—'}</span></div>
        <div class="detail-row"><label>Adresse</label><span>${c.exp_adresse||'—'}</span></div>
      </div>
      <div class="detail-section">
        <h4>📥 Destinataire</h4>
        <div class="detail-row"><label>Nom</label><span>${c.dest_nom||'—'}</span></div>
        <div class="detail-row"><label>Téléphone</label><span>${c.dest_tel||'—'}</span></div>
        <div class="detail-row"><label>Email</label><span>${c.dest_email||'—'}</span></div>
        <div class="detail-row"><label>Adresse</label><span>${c.dest_adresse||'—'}</span></div>
        <div class="detail-row"><label>Ville</label><span>${c.dest_ville||'—'}</span></div>
      </div>
      <div class="detail-section">
        <h4>📋 Description</h4>
        <p style="font-size:13px;color:var(--text-muted)">${c.description||'Aucune description'}</p>
        ${c.notes ? `<p style="margin-top:8px;font-size:13px"><strong>Notes:</strong> ${c.notes}</p>` : ''}
      </div>
    </div>
    <div style="margin-top:20px">
      <h4 style="margin-bottom:12px">📍 Historique de suivi</h4>
      <div class="timeline">
        ${historique.map((h, i) => `
          <div class="timeline-item">
            <div class="timeline-dot ${i === 0 ? 'active' : 'done'}"></div>
            <div class="timeline-content">
              <div class="timeline-status">${statusBadge(h.statut)}</div>
              <div class="timeline-desc">${h.description || ''}</div>
              ${h.localisation ? `<div class="timeline-desc">📍 ${h.localisation}</div>` : ''}
              <div class="timeline-time">🕐 ${formatDate(h.created_at)}${h.agent_nom ? ` · Par ${h.agent_nom}` : ''}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn btn-primary" onclick="openStatutModal('${c.id}','${c.statut}');closeAllModals()">✏️ Modifier statut</button>
    </div>
  `;
  showModal('modal-colis-detail');
}

function openStatutModal(id, currentStatut) {
  $('statut-colis-id').value = id;
  $('f-new-statut').value = currentStatut;
  $('f-statut-desc').value = '';
  $('f-statut-loc').value = '';
  showModal('modal-statut');
}

async function updateStatut() {
  const id = $('statut-colis-id').value;
  const statut = $('f-new-statut').value;
  const description = $('f-statut-desc').value;
  const localisation = $('f-statut-loc').value;
  const r = await apiFetch(`/colis/${id}/statut`, {
    method: 'PUT', body: { statut, description, localisation }
  });
  if (!r) return;
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast('Statut mis à jour', 'success');
  closeAllModals();
  loadColis(colisPage);
}

async function deleteColis(id) {
  if (!confirm('Supprimer ce colis ?')) return;
  const r = await apiFetch(`/colis/${id}`, { method: 'DELETE' });
  if (r && r.ok) { toast('Colis supprimé', 'success'); loadColis(colisPage); }
  else toast('Erreur lors de la suppression', 'error');
}

// ── LIVRAISONS ────────────────────────────────────────
async function loadLivraisons() {
  const statut = $('liv-statut-filter').value;
  let url = '/livraisons?limit=50';
  if (statut) url += `&statut=${statut}`;
  const r = await apiFetch(url);
  if (!r || !r.ok) return;
  const data = await r.json();
  $('livraisons-tbody').innerHTML = data.map(lv => `
    <tr>
      <td><code style="color:var(--primary-light)">${lv.numero_suivi}</code></td>
      <td>${lv.livreur_nom ? `<div>${lv.livreur_nom}</div><small style="color:var(--text-muted)">${lv.livreur_tel||''}</small>` : '<span style="color:var(--text-muted)">Non affecté</span>'}</td>
      <td>${lv.dest_nom||'—'}<br><small style="color:var(--text-muted)">${lv.dest_ville||''}</small></td>
      <td>${statusBadge(lv.statut)}</td>
      <td style="font-size:12px">${lv.date_planifiee ? formatDate(lv.date_planifiee) : '—'}</td>
      <td>
        <div class="action-btns">
          ${lv.statut === 'planifiee' ? `<button class="btn btn-sm btn-primary" onclick="updateLivraisonStatut('${lv.id}','en_cours')"><i class="fas fa-play"></i> Démarrer</button>` : ''}
          ${lv.statut === 'en_cours' ? `
            <button class="btn btn-sm btn-success" onclick="openValidationModal('${lv.id}')"><i class="fas fa-check"></i> Valider</button>
            <button class="btn btn-sm btn-danger" onclick="updateLivraisonStatut('${lv.id}','echec')"><i class="fas fa-times"></i> Échec</button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px">Aucune livraison</td></tr>';
}

async function updateLivraisonStatut(id, statut) {
  const r = await apiFetch(`/livraisons/${id}`, { method: 'PUT', body: { statut } });
  if (r && r.ok) { toast('Livraison mise à jour', 'success'); loadLivraisons(); }
  else toast('Erreur', 'error');
}

async function openLivraisonModal() {
  // Load available colis (not yet in delivery)
  const rc = await apiFetch('/colis?statut=enregistre&limit=100');
  const colisData = rc && rc.ok ? (await rc.json()).colis : [];
  const rl = await apiFetch('/livreurs');
  const livreursData = rl && rl.ok ? await rl.json() : [];
  $('f-liv-colis').innerHTML = colisData.map(c => `<option value="${c.id}">${c.numero_suivi} — ${c.dest_nom||''}</option>`).join('') || '<option value="">Aucun colis disponible</option>';
  $('f-liv-livreur').innerHTML = '<option value="">— Non affecté —</option>' + livreursData.filter(l => l.statut === 'disponible').map(l => `<option value="${l.id}">${l.nom} (${l.vehicule||''})</option>`).join('');
  const now = new Date(); now.setHours(now.getHours() + 1);
  $('f-liv-date').value = now.toISOString().slice(0,16);
  showModal('modal-livraison');
}

async function saveLivraison() {
  const body = {
    colis_id: $('f-liv-colis').value,
    livreur_id: $('f-liv-livreur').value || null,
    date_planifiee: $('f-liv-date').value || null,
    adresse_livraison: $('f-liv-adresse').value || null,
    notes: $('f-liv-notes').value || null
  };
  if (!body.colis_id) return toast('Veuillez sélectionner un colis', 'error');
  const r = await apiFetch('/livraisons', { method: 'POST', body });
  if (!r) return;
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast('Livraison créée', 'success');
  closeAllModals();
  loadLivraisons();
}

// ── VALIDATION ────────────────────────────────────────
function openValidationModal(livraisonId) {
  $('f-valid-livraison-id').value = livraisonId;
  $('f-valid-nom').value = '';
  $('f-valid-signature').value = '';
  $('f-valid-otp').value = '';
  $('otp-hint').textContent = '';
  currentColisIdForOTP = livraisonId;
  currentGeneratedOTP = null;
  showModal('modal-validation');
}

async function generateOTP() {
  const livraisonId = $('f-valid-livraison-id').value;
  // We need colis_id; look it up from livraison
  const r = await apiFetch(`/livraisons/${livraisonId}`);
  if (!r || !r.ok) return;
  const data = await r.json();
  const colisId = data.livraison?.colis_id || livraisonId;
  const ro = await apiFetch(`/validation/otp/generate/${colisId}`, { method: 'POST' });
  if (!ro || !ro.ok) return toast('Erreur génération OTP', 'error');
  const otpData = await ro.json();
  currentGeneratedOTP = otpData.otp;
  $('otp-hint').innerHTML = `<strong style="color:var(--warning)">OTP simulé: ${currentGeneratedOTP}</strong> (En production: envoyé par SMS)`;
  toast(`OTP généré: ${currentGeneratedOTP}`, 'info');
}

async function submitValidation() {
  const livraisonId = $('f-valid-livraison-id').value;
  if (!livraisonId) return toast('Erreur: ID livraison manquant', 'error');
  const nomRec = $('f-valid-nom').value;
  const sig = $('f-valid-signature').value;
  if (!sig && !$('f-valid-sig-img').files[0]) return toast('Signature requise (texte ou image)', 'error');

  const fd = new FormData();
  fd.append('nom_receptionnaire', nomRec);
  fd.append('signature_text', sig);
  if ($('f-valid-otp').value) fd.append('otp_code', $('f-valid-otp').value);
  if ($('f-valid-photo').files[0]) fd.append('photo_preuve', $('f-valid-photo').files[0]);
  if ($('f-valid-sig-img').files[0]) fd.append('signature_image', $('f-valid-sig-img').files[0]);

  const r = await fetch(`${API}/validation/${livraisonId}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
  });
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast('✅ Livraison validée avec succès!', 'success');
  closeAllModals();
  loadLivraisons();
  loadNotifBadge();
}

// ── LIVREURS ──────────────────────────────────────────
async function loadLivreurs() {
  const r = await apiFetch('/livreurs');
  if (!r || !r.ok) return;
  const data = await r.json();
  $('livreurs-grid').innerHTML = data.map(l => `
    <div class="livreur-card">
      <div class="livreur-header">
        <div class="livreur-avatar">${l.nom[0].toUpperCase()}</div>
        <div>
          <div class="livreur-name">${l.nom}</div>
          <div class="livreur-tel">📞 ${l.telephone}</div>
        </div>
        <div style="margin-left:auto">${statusBadge(l.statut)}</div>
      </div>
      <div class="livreur-meta">
        ${l.email ? `<span>✉️ ${l.email}</span>` : ''}
        ${l.vehicule ? `<span>🚗 ${l.vehicule}</span>` : ''}
      </div>
      <div class="livreur-stats">
        <span>📦 ${l.livraisons_en_cours||0} en cours</span>
        <span>✅ ${l.livraisons_terminees||0} terminées</span>
      </div>
      <div class="livreur-actions">
        <button class="btn btn-sm btn-ghost" onclick="editLivreur(${JSON.stringify(l).replace(/"/g,'&quot;')})">✏️ Modifier</button>
        ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteLivreur('${l.id}')">🗑️</button>` : ''}
      </div>
    </div>
  `).join('') || '<p style="color:var(--text-muted);text-align:center">Aucun livreur</p>';
}

function openLivreurModal() {
  $('livreur-modal-title').textContent = 'Nouveau Livreur';
  $('f-livreur-id').value = '';
  $('f-livreur-nom').value = '';
  $('f-livreur-tel').value = '';
  $('f-livreur-email').value = '';
  $('f-livreur-vehicule').value = '';
  $('f-livreur-statut').value = 'disponible';
  showModal('modal-livreur');
}

function editLivreur(l) {
  $('livreur-modal-title').textContent = 'Modifier Livreur';
  $('f-livreur-id').value = l.id;
  $('f-livreur-nom').value = l.nom;
  $('f-livreur-tel').value = l.telephone;
  $('f-livreur-email').value = l.email || '';
  $('f-livreur-vehicule').value = l.vehicule || '';
  $('f-livreur-statut').value = l.statut;
  showModal('modal-livreur');
}

async function saveLivreur() {
  const id = $('f-livreur-id').value;
  const body = {
    nom: $('f-livreur-nom').value, telephone: $('f-livreur-tel').value,
    email: $('f-livreur-email').value, vehicule: $('f-livreur-vehicule').value,
    statut: $('f-livreur-statut').value
  };
  if (!body.nom || !body.telephone) return toast('Nom et téléphone requis', 'error');
  const r = await apiFetch(id ? `/livreurs/${id}` : '/livreurs', { method: id ? 'PUT' : 'POST', body });
  if (!r) return;
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast(id ? 'Livreur modifié' : 'Livreur créé', 'success');
  closeAllModals();
  loadLivreurs();
}

async function deleteLivreur(id) {
  if (!confirm('Supprimer ce livreur ?')) return;
  const r = await apiFetch(`/livreurs/${id}`, { method: 'DELETE' });
  if (r && r.ok) { toast('Livreur supprimé', 'success'); loadLivreurs(); }
  else toast('Erreur', 'error');
}

// ── MAP ───────────────────────────────────────────────
async function initMap() {
  if (!map) {
    map = L.map('map').setView([48.8566, 2.3522], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }).addTo(map);
  }
  await loadLivreursOnMap();
}

async function loadLivreursOnMap() {
  const r = await apiFetch('/livreurs');
  if (!r || !r.ok) return;
  const livreurs = await r.json();
  // Clear old markers
  Object.values(mapMarkers).forEach(m => m.remove());
  mapMarkers = {};
  const listEl = $('livreurs-map-list');
  listEl.innerHTML = '';

  livreurs.forEach(l => {
    if (!l.latitude || !l.longitude) return;
    const color = l.statut === 'en_livraison' ? '#818cf8' : l.statut === 'disponible' ? '#10b981' : '#64748b';
    const markerIcon = L.divIcon({
      html: `<div style="background:${color};width:36px;height:36px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:14px">${l.nom[0]}</div>`,
      className: '', iconSize: [36, 36], iconAnchor: [18, 18]
    });
    const marker = L.marker([l.latitude, l.longitude], { icon: markerIcon })
      .addTo(map)
      .bindPopup(`<b>${l.nom}</b><br>📞 ${l.telephone}<br>${statusBadge(l.statut)}<br>🚗 ${l.vehicule||'—'}`);
    mapMarkers[l.id] = marker;

    // List item
    const item = document.createElement('div');
    item.className = 'map-livreur-item';
    item.innerHTML = `<div class="map-livreur-name">${l.nom} ${statusBadge(l.statut)}</div><div class="map-livreur-coords">📍 ${parseFloat(l.latitude).toFixed(4)}, ${parseFloat(l.longitude).toFixed(4)}</div>`;
    item.onclick = () => map.setView([l.latitude, l.longitude], 15);
    listEl.appendChild(item);
  });
}

function updateMapMarker(livreurId, lat, lng) {
  if (mapMarkers[livreurId]) {
    mapMarkers[livreurId].setLatLng([lat, lng]);
  }
}

function simulatePositions() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
    toast('Simulation arrêtée', 'info');
    return;
  }
  toast('Simulation de déplacement démarrée...', 'info');
  simulationInterval = setInterval(async () => {
    const r = await apiFetch('/livreurs');
    if (!r || !r.ok) return;
    const livreurs = await r.json();
    for (const l of livreurs.filter(lv => lv.statut === 'en_livraison' || lv.statut === 'disponible')) {
      const newLat = (parseFloat(l.latitude) + (Math.random() - 0.5) * 0.002).toFixed(6);
      const newLng = (parseFloat(l.longitude) + (Math.random() - 0.5) * 0.002).toFixed(6);
      await apiFetch(`/livreurs/${l.id}/position`, {
        method: 'PUT', body: { latitude: newLat, longitude: newLng }
      });
      updateMapMarker(l.id, newLat, newLng);
    }
  }, 2000);
}

// ── TRACKING PUBLIC ───────────────────────────────────
async function searchTracking() {
  const numero = $('tracking-input').value.trim();
  if (!numero) return toast('Entrez un numéro de suivi', 'error');
  const resultEl = $('tracking-result');
  resultEl.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted)">🔍 Recherche en cours...</p>';
  resultEl.classList.remove('hidden');

  const r = await apiFetch(`/colis/track/${encodeURIComponent(numero)}`);
  if (!r) return;
  const data = await r.json();
  if (!r.ok) {
    resultEl.innerHTML = `<div class="tracking-info-card"><p style="color:var(--danger);text-align:center">❌ ${data.error || 'Colis introuvable'}</p></div>`;
    return;
  }
  const c = data.colis;
  resultEl.innerHTML = `
    <div class="tracking-info-card">
      <div class="tracking-number">${c.numero_suivi}</div>
      <div>${statusBadge(c.statut)}</div>
      <div class="tracking-meta">
        <div class="tracking-meta-item"><label>Type de colis</label><span>${c.type_colis}</span></div>
        <div class="tracking-meta-item"><label>Livraison</label><span>${c.type_livraison === 'express' ? '⚡ Express' : '📦 Standard'}</span></div>
        <div class="tracking-meta-item"><label>Expéditeur</label><span>${c.exp_nom} (${c.exp_ville||'—'})</span></div>
        <div class="tracking-meta-item"><label>Destinataire</label><span>${c.dest_nom}</span></div>
        <div class="tracking-meta-item"><label>Adresse livraison</label><span>${c.dest_adresse}</span></div>
        <div class="tracking-meta-item"><label>Enregistré le</label><span>${formatDate(c.created_at)}</span></div>
      </div>
    </div>
    <div class="tracking-info-card">
      <h3 style="margin-bottom:16px">📍 Suivi du colis</h3>
      <div class="timeline">
        ${data.historique.map((h, i) => `
          <div class="timeline-item">
            <div class="timeline-dot ${i === 0 ? 'active' : 'done'}"></div>
            <div class="timeline-content">
              <div class="timeline-status">${statusBadge(h.statut)}</div>
              ${h.description ? `<div class="timeline-desc">${h.description}</div>` : ''}
              ${h.localisation ? `<div class="timeline-desc">📍 ${h.localisation}</div>` : ''}
              <div class="timeline-time">🕐 ${formatDate(h.created_at)}</div>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-muted)">Aucun historique</p>'}
      </div>
    </div>
  `;

  // Also join socket room for real-time updates
  if (socket) socket.emit('track_colis', numero);
}

// ── NOTIFICATIONS ─────────────────────────────────────
async function loadNotifications() {
  const r = await apiFetch('/users/notifications');
  if (!r || !r.ok) return;
  const data = await r.json();
  const icons2 = { colis_expedie: '<i class="fas fa-box-open"></i>', statut_en_transit: '<i class="fas fa-truck-moving"></i>', statut_en_livraison: '<i class="fas fa-truck"></i>', statut_livre: '<i class="fas fa-circle-check"></i>', otp: '<i class="fas fa-key"></i>' };
  $('notifications-list').innerHTML = data.map(n => `
    <div class="notif-item notif-${n.type}">
      <div class="notif-icon">${icons2[n.type] || '<i class="fas fa-bell"></i>'}</div>
      <div class="notif-body">
        <div class="notif-type">${n.type?.replace(/_/g,' ') || 'Notification'}</div>
        <div class="notif-msg">${n.message}</div>
        ${n.numero_suivi ? `<div class="notif-num">📦 ${n.numero_suivi}</div>` : ''}
        <div class="notif-time">${formatDate(n.created_at)}</div>
      </div>
    </div>
  `).join('') || '<p style="color:var(--text-muted);text-align:center;padding:40px">Aucune notification</p>';
}

async function loadNotifBadge() {
  const r = await apiFetch('/users/notifications');
  if (!r || !r.ok) return;
  const data = await r.json();
  const badge = $('notif-badge');
  const count = Math.min(data.length, 99);
  badge.textContent = count > 0 ? count : '';
}

// ── INCIDENTS ─────────────────────────────────────────
async function loadIncidents() {
  const r = await apiFetch('/incidents?limit=50');
  if (!r || !r.ok) return;
  const data = await r.json();
  const typeLabels = { perdu: 'Perdu', echec_livraison: 'Échec livraison', retour: 'Retour', endommage: 'Endommagé', autre: 'Autre' };
  $('incidents-tbody').innerHTML = data.map(inc => `
    <tr>
      <td><code style="color:var(--primary-light)">${inc.numero_suivi||'—'}</code></td>
      <td>${typeLabels[inc.type]||inc.type}</td>
      <td style="max-width:200px;white-space:normal">${inc.description}</td>
      <td>${statusBadge(inc.statut)}</td>
      <td style="font-size:12px">${formatDateShort(inc.created_at)}</td>
      <td>
        <div class="action-btns">
          ${inc.statut !== 'resolu' ? `<button class="btn btn-sm btn-success" onclick="resolveIncident('${inc.id}')"><i class="fas fa-check"></i> Résoudre</button>` : ''}
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:40px">Aucun incident</td></tr>';
}

async function openIncidentModal() {
  const rc = await apiFetch('/colis?limit=200');
  const colisData = rc && rc.ok ? (await rc.json()).colis : [];
  $('f-inc-colis').innerHTML = colisData.map(c => `<option value="${c.id}">${c.numero_suivi} — ${c.dest_nom||''}</option>`).join('') || '<option>Aucun colis</option>';
  $('f-inc-desc').value = '';
  showModal('modal-incident');
}

async function saveIncident() {
  const body = {
    colis_id: $('f-inc-colis').value,
    type: $('f-inc-type').value,
    description: $('f-inc-desc').value
  };
  if (!body.description) return toast('Description requise', 'error');
  const r = await apiFetch('/incidents', { method: 'POST', body });
  if (!r) return;
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast('Incident signalé', 'success');
  closeAllModals();
  loadIncidents();
}

async function resolveIncident(id) {
  const r = await apiFetch(`/incidents/${id}`, { method: 'PUT', body: { statut: 'resolu' } });
  if (r && r.ok) { toast('Incident résolu', 'success'); loadIncidents(); }
}

// ── REPORTS ───────────────────────────────────────────
async function loadReports() {
  const from = $('report-from').value;
  const to = $('report-to').value;
  const [rStats, rLivreurs] = await Promise.all([
    apiFetch('/reports/stats'),
    apiFetch(`/reports/livreurs?from=${from}&to=${to}`)
  ]);
  // Monthly chart
  if (rStats && rStats.ok) {
    const monthly = await rStats.json();
    if (chartMonthly) chartMonthly.destroy();
    const ctx = $('chart-monthly').getContext('2d');
    chartMonthly = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthly.map(m => m.mois),
        datasets: [
          { label: 'Total', data: monthly.map(m => m.total), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 6 },
          { label: 'Livrés', data: monthly.map(m => m.livres), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 6 },
          { label: 'Échecs', data: monthly.map(m => m.echecs), backgroundColor: 'rgba(239,68,68,0.7)', borderRadius: 6 }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } } } }
    });
  }
  // Livreur perf table
  if (rLivreurs && rLivreurs.ok) {
    const livData = await rLivreurs.json();
    $('livreurs-perf-tbody').innerHTML = livData.data.map(l => `
      <tr>
        <td><strong>${l.nom}</strong><br><small style="color:var(--text-muted)">${l.vehicule||''}</small></td>
        <td>${l.total_livraisons}</td>
        <td style="color:var(--success)">${l.livrees}</td>
        <td style="color:var(--danger)">${l.echecs}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;background:var(--dark3);border-radius:20px;height:6px">
              <div style="background:var(--success);height:100%;border-radius:20px;width:${l.taux_reussite||0}%"></div>
            </div>
            <span>${parseFloat(l.taux_reussite||0).toFixed(1)}%</span>
          </div>
        </td>
        <td>${l.temps_moyen_h ? parseFloat(l.temps_moyen_h).toFixed(1) + 'h' : '—'}</td>
      </tr>
    `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Aucune donnée</td></tr>';
  }
}

async function exportCSV() {
  const from = $('report-from').value;
  const to = $('report-to').value;
  window.location.href = `/api/reports/livraisons?format=csv&from=${from}&to=${to}`;
}

// ── USERS ─────────────────────────────────────────────
async function loadUsers() {
  const r = await apiFetch('/users');
  if (!r || !r.ok) return;
  const data = await r.json();
  $('users-tbody').innerHTML = data.map(u => `
    <tr>
      <td><strong>${u.nom}</strong></td>
      <td>${u.email}</td>
      <td>${u.role === 'admin' ? '🔑 Admin' : u.role === 'agent' ? '👤 Agent' : '👥 Client'}</td>
      <td>${u.telephone||'—'}</td>
      <td>${u.actif ? '<span style="color:var(--success)">✅ Actif</span>' : '<span style="color:var(--danger)">❌ Inactif</span>'}</td>
      <td>
        <div class="action-btns">
          ${u.id !== currentUser.id ? `<button class="btn btn-sm btn-danger" onclick="deactivateUser('${u.id}')">Désactiver</button>` : '<span style="color:var(--text-muted);font-size:12px">Vous</span>'}
        </div>
      </td>
    </tr>
  `).join('');
}

function openUserModal() { showModal('modal-user'); }

async function saveUser() {
  const body = {
    nom: $('f-user-nom').value, email: $('f-user-email').value,
    password: $('f-user-password').value, role: $('f-user-role').value,
    telephone: $('f-user-tel').value
  };
  if (!body.nom || !body.email || !body.password) return toast('Champs obligatoires manquants', 'error');
  const r = await apiFetch('/auth/register', { method: 'POST', body });
  if (!r) return;
  const data = await r.json();
  if (!r.ok) return toast(data.error || 'Erreur', 'error');
  toast('Utilisateur créé', 'success');
  closeAllModals();
  loadUsers();
}

async function deactivateUser(id) {
  if (!confirm('Désactiver cet utilisateur ?')) return;
  const r = await apiFetch(`/users/${id}`, { method: 'DELETE' });
  if (r && r.ok) { toast('Utilisateur désactivé', 'success'); loadUsers(); }
}

// ── MODAL HELPERS ─────────────────────────────────────
function showModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  $('modal-overlay').classList.remove('hidden');
  $(id).style.display = 'flex';
}

function closeModal(e) {
  if (e.target === $('modal-overlay')) closeAllModals();
}

function closeAllModals() {
  $('modal-overlay').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllModals();
});

// ── INIT ──────────────────────────────────────────────
if (token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    } else {
      initApp();
    }
  } catch { localStorage.removeItem('token'); }
}
