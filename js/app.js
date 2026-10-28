import { installDemo } from './demo.js';
import { abrirImpresion, cerrarImpresion, htmlArchivo, htmlLegajo } from './print.js';
import { api, esc, hoyAR, addDays, setUnauthorized, startOfWeek, toast } from './util.js';
import {
  agendaView,
  ajustesView,
  carpetaForm,
  claveForm,
  clienteForm,
  clientesView,
  clientListHtml,
  confirmHtml,
  equipoView,
  fichaForm,
  forbiddenView,
  inicioView,
  legalesView,
  loginView,
  presentarForm,
  renombrarForm,
  shellView,
  turnoForm,
  usuarioForm,
} from './views.js';

const state = {
  user: null,
  settings: null,
  areas: [],
  roles: [],
  turnoEstados: [],
  equipo: [],
  branding: null,
  navFaltantes: 0,
  dashboard: null,
  clientQuery: '',
  clients: [],
  clientsTruncated: false,
  clientOpen: null,
  clientDetail: null,
  users: [],
  agenda: { fecha: '', desde: '', hasta: '', turnos: null, soloMios: false },
  legales: {
    areaId: null,
    resumen: [],
    query: '',
    lista: [],
    fuera: [],
    work: null,
    carpeta: {},
  },
  pendingPick: null,
  uploading: false,
  keepScroll: 0,
  modalResolve: null,
};

const TITLES = {
  inicio: 'Inicio',
  agenda: 'Agenda',
  clientes: 'Clientes',
  legales: 'Legales',
  equipo: 'Equipo',
  ajustes: 'Ajustes',
};

let renderSeq = 0;
let searchSeq = 0;
let searchTimer;

setUnauthorized(() => {
  const hadUser = Boolean(state.user);
  state.user = null;
  if (hadUser) toast('La sesión se cerró. Volvé a ingresar.', 'error');
  render();
});

function parseRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '') || 'inicio';
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return {
    name: parts[0] || 'inicio',
    id: parts[1] || null,
    extra: parts[2] || null,
    params: Object.fromEntries(new URLSearchParams(query || '')),
  };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function formValues(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === 'string') data[key] = value;
  }
  return data;
}

function applyMe(me) {
  state.user = me.user;
  state.settings = me.settings;
  state.areas = me.areas;
  state.roles = me.roles;
  state.turnoEstados = me.turnoEstados;
  state.equipo = me.equipo;
  state.navFaltantes = me.faltantes || 0;
}

function paintBadge() {
  document.querySelectorAll('[data-badge="faltantes"]').forEach((el) => {
    el.textContent = state.navFaltantes ? String(state.navFaltantes) : '';
    el.hidden = !state.navFaltantes;
  });
}

function highlightNav() {
  const route = parseRoute();
  document.querySelectorAll('[data-nav]').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === route.name);
  });
  const title = document.getElementById('top-title');
  if (title) title.textContent = TITLES[route.name] || 'Agenda';
  const studio = state.settings?.estudioNombre || 'Estudio Reverter';
  document.title = `${TITLES[route.name] || 'Agenda'} · ${studio}`;
}

function closeMenu() {
  const menu = document.getElementById('usermenu');
  if (menu) menu.hidden = true;
}

function render() {
  if (!state.user) {
    document.body.classList.add('is-login');
    document.getElementById('app').innerHTML = loginView(state.branding);
    return;
  }
  document.body.classList.remove('is-login');
  if (!document.getElementById('main')) {
    document.getElementById('app').innerHTML = shellView(state);
  }
  highlightNav();
  renderView();
}

async function renderView({ soft = false } = {}) {
  const seq = ++renderSeq;
  const route = parseRoute();
  const main = document.getElementById('main');
  if (!main) return;
  if (!soft) main.innerHTML = '<p class="loading">Cargando…</p>';
  try {
    const html = await build(route);
    if (seq !== renderSeq || !state.user) return;
    const node = document.getElementById('main');
    if (!node) return;
    node.innerHTML = html;
    if (state.keepScroll) node.scrollTop = state.keepScroll;
    state.keepScroll = 0;
    paintBadge();
  } catch (error) {
    if (seq !== renderSeq || error.status === 401) return;
    const node = document.getElementById('main');
    if (!node) return;
    node.innerHTML = `<div class="wrap"><section class="card"><h2>No se pudo abrir</h2><p class="lede">${esc(error.message)}</p><p><a href="#/inicio">Volver al inicio</a></p></section></div>`;
  }
}

async function build(route) {
  if ((route.name === 'equipo' || route.name === 'ajustes') && state.user.rol !== 'superadmin') {
    return forbiddenView();
  }
  if (route.name === 'inicio') {
    state.dashboard = await api('/api/dashboard');
    state.navFaltantes = state.dashboard.conteos.faltantes;
    return inicioView(state);
  }
  if (route.name === 'agenda') {
    state.agenda.fecha = route.params.fecha || state.agenda.fecha || hoyAR();
    const desde = startOfWeek(state.agenda.fecha);
    const hasta = addDays(desde, 6);
    if (state.agenda.desde !== desde || !state.agenda.turnos) {
      const data = await api(`/api/turnos?desde=${desde}&hasta=${hasta}`);
      state.agenda.turnos = data.turnos;
      state.agenda.desde = desde;
      state.agenda.hasta = hasta;
    }
    return agendaView(state);
  }
  if (route.name === 'clientes') {
    const data = await api(`/api/clients?q=${encodeURIComponent(state.clientQuery || '')}&limit=100`);
    state.clients = data.clients;
    state.clientsTruncated = data.clients.length >= 100;
    state.clientOpen = route.id || null;
    if (route.id) {
      state.clientDetail = await api(`/api/clients/${route.id}`);
      if (state.clientDetail?.client && !state.clients.some((client) => client.id === route.id)) {
        state.clients.unshift(state.clientDetail.client);
      }
    } else {
      state.clientDetail = null;
    }
    return clientesView(state);
  }
  if (route.name === 'legales') {
    if (route.id && !state.areas.some((area) => area.id === route.id)) {
      go(`#/clientes/${route.id}`);
      return '<p class="loading">Cargando…</p>';
    }
    state.legales.areaId = route.id;
    state.legales.resumen = (await api('/api/legales/resumen')).areas;
    state.navFaltantes = state.legales.resumen.reduce((sum, area) => sum + (area.faltantes || 0), 0);
    if (!route.id) {
      state.legales.work = null;
      state.legales.lista = [];
      state.legales.fuera = [];
      return legalesView(state);
    }
    const lista = await api(`/api/areas/${route.id}/clientes?q=${encodeURIComponent(state.legales.query || '')}`);
    state.legales.lista = lista.clients;
    state.legales.fuera = lista.fuera || [];
    if (route.extra) {
      state.legales.work = await api(`/api/clients/${route.extra}/areas/${route.id}`);
      fijarCarpeta(state.legales.work);
    } else {
      state.legales.work = null;
    }
    return legalesView(state);
  }
  if (route.name === 'equipo') {
    state.users = (await api('/api/users')).users;
    state.equipo = (await api('/api/equipo')).users;
    return equipoView(state);
  }
  if (route.name === 'ajustes') return ajustesView(state);
  location.hash = '#/inicio';
  return '<p class="loading">Cargando…</p>';
}

function fijarCarpeta(work) {
  if (!work?.enArea) return;
  const current = state.legales.carpeta[work.area.id];
  if (!work.area.carpetas.some((carpeta) => carpeta.id === current)) {
    state.legales.carpeta[work.area.id] = work.area.carpetas[0]?.id || '';
  }
}

function paintLegales() {
  const main = document.getElementById('main');
  if (!main || parseRoute().name !== 'legales') return;
  const y = state.keepScroll || main.scrollTop;
  main.innerHTML = legalesView(state);
  main.scrollTop = y;
  state.keepScroll = 0;
  paintBadge();
}

async function reloadLegales() {
  const route = parseRoute();
  if (route.name !== 'legales') return;
  state.keepScroll = document.getElementById('main')?.scrollTop || 0;
  state.legales.areaId = route.id;
  state.legales.resumen = (await api('/api/legales/resumen')).areas;
  state.navFaltantes = state.legales.resumen.reduce((sum, area) => sum + (area.faltantes || 0), 0);
  if (route.id) {
    const lista = await api(`/api/areas/${route.id}/clientes?q=${encodeURIComponent(state.legales.query || '')}`);
    state.legales.lista = lista.clients;
    state.legales.fuera = lista.fuera || [];
    if (route.extra) {
      state.legales.work = await api(`/api/clients/${route.extra}/areas/${route.id}`);
      fijarCarpeta(state.legales.work);
    } else {
      state.legales.work = null;
    }
  }
  paintLegales();
}

function findItem(itemId) {
  const area = state.legales.work?.area;
  if (!area) return null;
  for (const carpeta of area.carpetas) {
    for (const [bucketId, list] of Object.entries(carpeta.items)) {
      const item = list.find((entry) => entry.id === itemId);
      if (item) {
        return { item, area, carpeta, bucket: area.buckets.find((bucket) => bucket.id === bucketId) };
      }
    }
  }
  return null;
}

function findCarpeta(carpetaId) {
  return state.legales.work?.area?.carpetas.find((item) => item.id === carpetaId) || null;
}

function findTurno(turnoId) {
  const lists = [
    state.agenda.turnos,
    state.dashboard?.turnosHoy,
    state.dashboard?.proximos,
    state.clientDetail?.turnos,
  ];
  for (const list of lists) {
    const found = list?.find((turno) => turno.id === turnoId);
    if (found) return found;
  }
  return null;
}

function clientFromState(clientId) {
  if (state.clientDetail?.client?.id === clientId) return state.clientDetail.client;
  if (state.legales.work?.client?.id === clientId) return state.legales.work.client;
  return (state.clients || []).find((client) => client.id === clientId)
    || (state.legales.lista || []).find((client) => client.id === clientId)
    || null;
}

function bucketMeta(areaId, bucketId) {
  return state.areas.find((item) => item.id === areaId)?.buckets.find((bucket) => bucket.id === bucketId) || null;
}

function openModal(inner, resolve) {
  if (state.modalResolve) {
    const previous = state.modalResolve;
    state.modalResolve = null;
    previous(false);
  }
  state.modalResolve = resolve || null;
  document.getElementById('modal-root').innerHTML = `<div class="modal-back">${inner}</div>`;
  const field = document.querySelector('#modal-root input:not([type="hidden"]):not([type="file"]), #modal-root textarea, #modal-root select');
  field?.focus();
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function finishModal(value) {
  const resolve = state.modalResolve;
  state.modalResolve = null;
  closeModal();
  resolve?.(value);
}

function ask(options) {
  return new Promise((resolve) => {
    openModal(confirmHtml(options), resolve);
  });
}

function rememberScroll() {
  state.keepScroll = document.getElementById('main')?.scrollTop || 0;
}

async function prepareFile(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || /heic|heif/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) return file;
    const base = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

function tituloDesdeArchivo(file) {
  const name = (file.name || '').replace(/\.[^.]+$/, '');
  if (!name || /^(image|img|photo|foto|captura|scan|documento)$/i.test(name) || /^img[_-]?\d+$/i.test(name)) {
    const stamp = new Intl.DateTimeFormat('es-AR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date());
    return `Foto ${stamp}`;
  }
  return name.slice(0, 140);
}

function armPick(kind, meta, camera) {
  if (state.uploading) {
    toast('Esperá a que termine la carga.', 'error');
    return;
  }
  state.pendingPick = { kind, ...meta };
  const input = document.getElementById(camera ? 'pick-camera' : 'pick-file');
  input.value = '';
  input.click();
}

async function onPicked(camera) {
  const input = document.getElementById(camera ? 'pick-camera' : 'pick-file');
  const file = input.files?.[0];
  input.value = '';
  const pending = state.pendingPick;
  state.pendingPick = null;
  if (!file || !pending) return;
  state.uploading = true;
  toast('Subiendo…');
  try {
    const prepared = await prepareFile(file);
    if (prepared.size > 20 * 1024 * 1024) throw new Error('El archivo supera los 20 MB.');
    const body = new FormData();
    body.append('archivo', prepared);
    if (pending.kind === 'faltante') {
      await api(`/api/items/${pending.itemId}/completar`, { method: 'POST', body });
      toast('Pasó a Documentos.');
    } else {
      body.append('bucket', pending.bucket);
      body.append('titulo', tituloDesdeArchivo(file));
      await api(`/api/carpetas/${pending.carpetaId}/archivos`, { method: 'POST', body });
      toast('Documento cargado.');
    }
    state.agenda.turnos = null;
    await reloadLegales();
  } catch (error) {
    if (error.status !== 401) toast(error.message, 'error');
  } finally {
    state.uploading = false;
  }
}

const clickActions = {
  'toggle-menu'(el) {
    const menu = document.getElementById('usermenu');
    if (menu) menu.hidden = !menu.hidden;
    el.setAttribute('aria-expanded', menu && !menu.hidden ? 'true' : 'false');
  },
  async logout() {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    state.legales.work = null;
    document.getElementById('app').innerHTML = '';
    go('#/inicio');
  },
  async 'abrir-modal-cliente'(el) {
    const clientId = el.dataset.id;
    let client = null;
    if (clientId) client = clientFromState(clientId) || (await api(`/api/clients/${clientId}`)).client;
    const suggested = !client && el.dataset.area && state.legales.query && !/^\d[\d.\s-]*$/.test(state.legales.query.trim())
      ? state.legales.query.trim()
      : '';
    openModal(clienteForm(client, { areaId: client ? '' : (el.dataset.area || ''), nombre: suggested }));
  },
  async 'borrar-cliente'(el) {
    const ok = await ask({
      title: 'Eliminar cliente',
      text: 'Se borran la ficha, los turnos y todos los documentos de este cliente.',
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await api(`/api/clients/${el.dataset.id}`, { method: 'DELETE' });
    toast('Cliente eliminado.');
    state.clients = [];
    go('#/clientes');
  },
  async 'abrir-modal-turno'(el) {
    const turno = el.dataset.id ? findTurno(el.dataset.id) : null;
    let locked = null;
    const clientId = el.dataset.client || (!turno && parseRoute().name === 'legales' ? parseRoute().extra : '');
    if (!turno && clientId) locked = clientFromState(clientId) || (await api(`/api/clients/${clientId}`)).client;
    if (!turno && el.dataset.fecha) state.agenda.fecha = el.dataset.fecha;
    openModal(turnoForm(state, turno, locked));
  },
  async 'estado-turno'(el) {
    await api(`/api/turnos/${el.dataset.id}`, { method: 'PATCH', body: { estado: el.dataset.estado } });
    state.agenda.turnos = null;
    toast('Turno actualizado.');
    await renderView({ soft: true });
  },
  async 'borrar-turno'(el) {
    const ok = await ask({ title: 'Borrar turno', text: 'El horario se saca de la agenda.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    await api(`/api/turnos/${el.dataset.id}`, { method: 'DELETE' });
    state.agenda.turnos = null;
    toast('Turno borrado.');
    await renderView({ soft: true });
  },
  'toggle-cliente'(el) {
    const id = el.dataset.id;
    if (parseRoute().id === id && parseRoute().name === 'clientes') go('#/clientes');
    else go(`#/clientes/${id}`);
  },
  'toggle-area'(el) {
    const area = el.dataset.area;
    state.legales.query = '';
    state.legales.lista = [];
    state.legales.fuera = [];
    state.legales.work = null;
    if (parseRoute().id === area) go('#/legales');
    else go(`#/legales/${area}`);
  },
  'abrir-en-area'(el) {
    const route = parseRoute();
    if (route.id === el.dataset.area && route.extra === el.dataset.id) go(`#/legales/${el.dataset.area}`);
    else go(`#/legales/${el.dataset.area}/${el.dataset.id}`);
  },
  async 'sumar-area'(el) {
    await api(`/api/clients/${el.dataset.id}/areas/${el.dataset.area}`, { method: 'POST' });
    toast('Sumado al área.');
    const hash = `#/legales/${el.dataset.area}/${el.dataset.id}`;
    if (location.hash === hash) await renderView({ soft: true });
    else go(hash);
  },
  async 'quitar-area'(el) {
    const ok = await ask({
      title: 'Quitar del área',
      text: 'Se borran los documentos de esta área. El cliente sigue en las otras.',
      confirm: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    await api(`/api/clients/${el.dataset.id}/areas/${el.dataset.area}`, { method: 'DELETE' });
    toast('Quedó fuera del área.');
    go(`#/legales/${el.dataset.area}`);
  },
  async 'imprimir-area'(el) {
    const work = state.legales.work?.client?.id === el.dataset.id && state.legales.work.area?.id === el.dataset.area
      ? state.legales.work
      : await api(`/api/clients/${el.dataset.id}/areas/${el.dataset.area}`);
    if (!work?.enArea) {
      toast('Este cliente no tiene legajo en el área.', 'error');
      return;
    }
    abrirImpresion(htmlLegajo(state.settings, { client: work.client, areas: [work.area] }));
  },
  async 'imprimir-cliente'(el) {
    const data = await api(`/api/clients/${el.dataset.id}/legales`);
    if (!data.areas?.length) {
      toast('Este cliente todavía no está en un área.', 'error');
      return;
    }
    abrirImpresion(htmlLegajo(state.settings, data));
  },
  'imprimir-archivo'(el) {
    const found = findItem(el.dataset.id);
    if (!found || !state.legales.work) return;
    abrirImpresion(htmlArchivo(state.settings, state.legales.work.client, found.area.nombre, found.item));
  },
  'lanzar-impresion'() {
    window.print();
  },
  'cerrar-impresion'() {
    cerrarImpresion();
  },
  'nueva-carpeta'(el) {
    const area = state.areas.find((item) => item.id === el.dataset.area)
      || (state.legales.work?.area?.id === el.dataset.area ? state.legales.work.area : null);
    openModal(carpetaForm(area?.nombre || 'esta área', el.dataset.area));
  },
  'renombrar-carpeta'(el) {
    openModal(`
      <form class="modal" data-action="guardar-renombre-carpeta" role="dialog" autocomplete="off">
        <header class="modal-head"><h2>Renombrar carpeta</h2>
          <button type="button" class="iconbtn" data-action="cerrar-modal" aria-label="Cerrar">×</button>
        </header>
        <div class="modal-body stack">
          <input type="hidden" name="id" value="${esc(el.dataset.id)}">
          <label class="field">Nombre<input name="titulo" required maxlength="120" value="${esc(el.dataset.titulo || '')}"></label>
        </div>
        <footer class="modal-foot">
          <button type="button" class="btn btn-quiet" data-action="cerrar-modal">Cancelar</button>
          <button class="btn btn-primary" type="submit">Guardar</button>
        </footer>
      </form>`);
  },
  async 'borrar-carpeta'(el) {
    const ok = await ask({
      title: 'Eliminar carpeta',
      text: 'Se borran los documentos y las notas de esta carpeta. Las otras carpetas del área quedan.',
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await api(`/api/carpetas/${el.dataset.id}`, { method: 'DELETE' });
    toast('Carpeta eliminada.');
    await reloadLegales();
  },
  'capturar-faltante'(el) {
    armPick('faltante', { itemId: el.dataset.id }, true);
  },
  'archivo-faltante'(el) {
    armPick('faltante', { itemId: el.dataset.id }, false);
  },
  'sacar-foto'(el) {
    armPick('documento', { carpetaId: el.dataset.carpeta, bucket: el.dataset.bucket }, true);
  },
  'subir-archivo'(el) {
    armPick('documento', { carpetaId: el.dataset.carpeta, bucket: el.dataset.bucket }, false);
  },
  'abrir-ficha'(el) {
    const bucket = bucketMeta(el.dataset.area, el.dataset.bucket);
    if (!bucket) return;
    openModal(fichaForm(bucket, el.dataset.carpeta, null));
  },
  'editar-item'(el) {
    const found = findItem(el.dataset.id);
    if (!found?.bucket) return;
    if (found.bucket.tipo === 'archivo' || found.bucket.tipo === 'faltante') {
      openModal(renombrarForm(found.item));
      return;
    }
    openModal(fichaForm(found.bucket, found.carpeta.id, found.item));
  },
  'renombrar-item'(el) {
    const found = findItem(el.dataset.id);
    if (found) openModal(renombrarForm(found.item));
  },
  async 'borrar-item'(el) {
    const found = findItem(el.dataset.id);
    const ok = await ask({
      title: 'Quitar',
      text: found ? `Se quita «${found.item.titulo}».` : 'Se quita este elemento.',
      confirm: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    await api(`/api/items/${el.dataset.id}`, { method: 'DELETE' });
    toast('Listo.');
    await reloadLegales();
  },
  'presentar-documento'(el) {
    const found = findItem(el.dataset.id);
    if (!found) return;
    openModal(presentarForm({ ...found.item, fecha: hoyAR() }));
  },
  'ver-archivo'(el) {
    const found = findItem(el.dataset.id);
    if (!found?.item.tieneArchivo) return;
    const src = `/api/archivos/${encodeURIComponent(found.item.id)}?v=${encodeURIComponent(found.item.updatedAt || '')}`;
    document.getElementById('lightbox-root').innerHTML = `
      <div class="lightbox">
        <figure>
          <img src="${src}" alt="${esc(found.item.titulo)}">
          <figcaption>${esc(found.item.titulo)} · <button type="button" class="btn btn-quiet btn-small" data-action="cerrar-luz">Cerrar</button></figcaption>
        </figure>
      </div>`;
  },
  'cerrar-luz'() {
    document.getElementById('lightbox-root').innerHTML = '';
  },
  'abrir-modal-usuario'(el) {
    const user = el.dataset.id ? state.users.find((item) => item.id === el.dataset.id) : null;
    openModal(usuarioForm(user, state.roles));
  },
  async 'borrar-usuario'(el) {
    const user = state.users.find((item) => item.id === el.dataset.id);
    const ok = await ask({
      title: 'Eliminar cuenta',
      text: user ? `Se elimina la cuenta de ${user.nombre}. Lo que ya cargó queda en la agenda.` : 'Se elimina la cuenta.',
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    await api(`/api/users/${el.dataset.id}`, { method: 'DELETE' });
    toast('Cuenta eliminada.');
    await renderView({ soft: true });
  },
  'abrir-clave'() {
    openModal(claveForm());
  },
  'cambiar-dia'(el) {
    go(`#/agenda?fecha=${el.dataset.fecha}`);
  },
  semana(el) {
    const fecha = addDays(state.agenda.fecha || hoyAR(), Number(el.dataset.dir) * 7);
    go(`#/agenda?fecha=${fecha}`);
  },
  'ir-hoy'() {
    go(`#/agenda?fecha=${hoyAR()}`);
  },
  'confirmar-si'() {
    finishModal(true);
  },
  'confirmar-no'() {
    finishModal(false);
  },
  'cerrar-modal'() {
    finishModal(false);
  },
  'ficha-camara'() {
    document.getElementById('ficha-cam')?.click();
  },
  async 'borrar-pizarra'(el) {
    await api(`/api/pizarra/${el.dataset.id}`, { method: 'DELETE' });
    await renderView({ soft: true });
  },
  async 'borrar-comentario'(el) {
    await api(`/api/comentarios/${el.dataset.id}`, { method: 'DELETE' });
    await renderView({ soft: true });
  },
  'elegir-turno-cliente'(el) {
    const form = document.querySelector('#modal-root form');
    if (!form) return;
    form.querySelector('[name="clientId"]').value = el.dataset.id;
    const box = form.querySelector('#turno-q');
    if (box) box.value = el.dataset.nombre;
    const results = document.getElementById('turno-results');
    if (results) results.innerHTML = '';
  },
};

const submitActions = {
  async login(form) {
    const data = formValues(form);
    await api('/api/login', {
      method: 'POST',
      body: { username: data.username, password: data.password },
      allow401: true,
    });
    applyMe(await api('/api/me'));
    document.getElementById('app').innerHTML = '';
    if (!location.hash || location.hash === '#/') location.hash = '#/inicio';
    else render();
  },
  async 'guardar-cliente'(form) {
    const data = formValues(form);
    const body = {
      nombre: data.nombre,
      dni: data.dni,
      telefono: data.telefono,
      email: data.email,
      domicilio: data.domicilio,
      notas: data.notas,
    };
    const route = parseRoute();
    if (data.id) {
      await api(`/api/clients/${data.id}`, { method: 'PATCH', body });
      finishModal(true);
      toast('Ficha actualizada.');
      await renderView({ soft: true });
      return;
    }
    const created = await api('/api/clients', { method: 'POST', body });
    finishModal(true);
    if (data.area) {
      await api(`/api/clients/${created.client.id}/areas/${data.area}`, { method: 'POST' });
      toast('Cliente cargado en el área.');
      go(`#/legales/${data.area}/${created.client.id}`);
      return;
    }
    toast('Cliente cargado.');
    if (route.name === 'clientes' && !route.id) await renderView({ soft: true });
    else go(`#/clientes/${created.client.id}`);
  },
  async 'guardar-turno'(form) {
    const data = formValues(form);
    if (!data.clientId) throw new Error('Elegí un cliente de la lista.');
    const body = {
      clientId: data.clientId,
      fecha: data.fecha,
      hora: data.hora,
      motivo: data.motivo,
      notas: data.notas,
      estado: data.estado,
      asignadoA: data.asignadoA,
    };
    if (data.id) await api(`/api/turnos/${data.id}`, { method: 'PATCH', body });
    else await api('/api/turnos', { method: 'POST', body });
    state.agenda.turnos = null;
    finishModal(true);
    toast(data.id ? 'Turno actualizado.' : 'Turno agendado.');
    const route = parseRoute();
    if (route.name === 'agenda') await renderView({ soft: true });
    else if (data.fecha) go(`#/agenda?fecha=${data.fecha}`);
    else await renderView({ soft: true });
  },
  async 'agregar-faltantes'(form) {
    await api(`/api/carpetas/${form.dataset.carpeta}/items`, {
      method: 'POST',
      body: { bucket: 'faltante', texto: formValues(form).texto },
    });
    toast('Faltantes anotados.');
    await reloadLegales();
  },
  async 'agregar-rapido'(form) {
    const bucket = bucketMeta(form.dataset.area, form.dataset.bucket);
    await api(`/api/carpetas/${form.dataset.carpeta}/items`, {
      method: 'POST',
      body: {
        bucket: form.dataset.bucket,
        titulo: formValues(form).titulo,
        fecha: bucket?.tipo === 'presentado' ? hoyAR() : '',
        estado: bucket?.estados?.[0]?.id || '',
      },
    });
    toast('Listo.');
    await reloadLegales();
  },
  async 'guardar-ficha'(form) {
    const data = formValues(form);
    const file = form.archivo?.files?.[0];
    const body = {
      bucket: data.bucket,
      titulo: data.titulo,
      cuerpo: data.cuerpo,
      fecha: data.fecha,
      estado: data.estado,
    };
    let itemId = data.id;
    if (itemId) await api(`/api/items/${itemId}`, { method: 'PATCH', body });
    else itemId = (await api(`/api/carpetas/${data.carpetaId}/items`, { method: 'POST', body })).id;
    if (file && file.size) {
      const prepared = await prepareFile(file);
      const payload = new FormData();
      payload.append('archivo', prepared);
      await api(`/api/items/${itemId}/archivo`, { method: 'POST', body: payload });
    }
    finishModal(true);
    toast('Guardado.');
    await reloadLegales();
  },
  async 'guardar-presentado'(form) {
    const data = formValues(form);
    await api(`/api/items/${data.id}/presentar`, {
      method: 'POST',
      body: { fecha: data.fecha, cuerpo: data.cuerpo, estado: data.estado },
    });
    finishModal(true);
    toast('Quedó en Presentado.');
    await reloadLegales();
  },
  async 'guardar-usuario'(form) {
    const data = formValues(form);
    const body = { nombre: data.nombre, rol: data.rol, password: data.password };
    if (data.id) body.activo = Boolean(form.activo?.checked);
    const saved = data.id
      ? await api(`/api/users/${data.id}`, { method: 'PATCH', body })
      : await api('/api/users', { method: 'POST', body: { ...body, username: data.username } });
    if (saved.user?.id === state.user.id) {
      state.user = { ...state.user, ...saved.user };
      document.getElementById('app').innerHTML = '';
    }
    finishModal(true);
    toast(data.id ? 'Cuenta actualizada.' : 'Cuenta creada.');
    await renderView({ soft: true });
  },
  async 'guardar-ajustes'(form) {
    const saved = await api('/api/settings', { method: 'PATCH', body: formValues(form) });
    state.settings = saved.settings;
    document.getElementById('app').innerHTML = '';
    toast('Ajustes guardados.');
    render();
  },
  async 'guardar-clave'(form) {
    const data = formValues(form);
    await api('/api/cuenta/clave', { method: 'POST', body: { actual: data.actual, nueva: data.nueva } });
    finishModal(true);
    toast('Clave actualizada.');
  },
  async 'guardar-carpeta'(form) {
    const data = formValues(form);
    const clientId = parseRoute().extra;
    const created = await api(`/api/clients/${clientId}/carpetas`, {
      method: 'POST',
      body: { area: data.area, titulo: data.titulo },
    });
    state.legales.carpeta[data.area] = created.id;
    finishModal(true);
    toast('Carpeta creada.');
    await reloadLegales();
  },
  async 'renombrar-item'(form) {
    const data = formValues(form);
    await api(`/api/items/${data.id}`, { method: 'PATCH', body: { titulo: data.titulo } });
    finishModal(true);
    toast('Nombre actualizado.');
    await reloadLegales();
  },
  async 'guardar-renombre-carpeta'(form) {
    const data = formValues(form);
    await api(`/api/carpetas/${data.id}`, { method: 'PATCH', body: { titulo: data.titulo } });
    finishModal(true);
    await reloadLegales();
  },
  async 'publicar-pizarra'(form) {
    await api('/api/pizarra', { method: 'POST', body: { texto: formValues(form).texto } });
    form.reset();
    await renderView({ soft: true });
  },
  async 'publicar-comentario'(form) {
    await api(`/api/clients/${form.dataset.client}/comentarios`, {
      method: 'POST',
      body: { texto: formValues(form).texto },
    });
    await renderView({ soft: true });
  },
};

const inputActions = {
  'buscar-en-area'(input) {
    state.legales.query = input.value;
    const area = input.dataset.area;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => buscarEnArea(area, input.value), 180);
  },
  'buscar-clientes'(input) {
    state.clientQuery = input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => buscarClientes(input.value), 180);
  },
  'buscar-turno-cliente'(input) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => buscarTurnoCliente(input.value), 180);
  },
};

const changeActions = {
  async 'guardar-nota-carpeta'(input) {
    await api(`/api/carpetas/${input.dataset.carpeta}`, { method: 'PATCH', body: { notas: input.value } });
    const carpeta = findCarpeta(input.dataset.carpeta);
    if (carpeta) carpeta.notas = input.value;
    toast('Nota guardada.');
  },
  'cambiar-carpeta'(input) {
    state.legales.carpeta[input.dataset.area] = input.value;
    rememberScroll();
    paintLegales();
  },
  'solo-mios'(input) {
    state.agenda.soloMios = input.checked;
    localStorage.setItem('agenda-mios', input.checked ? '1' : '0');
    rememberScroll();
    const main = document.getElementById('main');
    if (main) {
      main.innerHTML = agendaView(state);
      main.scrollTop = state.keepScroll;
      state.keepScroll = 0;
    }
  },
};

async function buscarEnArea(area, query) {
  const seq = ++searchSeq;
  const data = await api(`/api/areas/${area}/clientes?q=${encodeURIComponent(query)}`);
  if (seq !== searchSeq || parseRoute().id !== area) return;
  state.legales.lista = data.clients;
  state.legales.fuera = data.fuera || [];
  if (parseRoute().extra) {
    state.legales.work = null;
    history.replaceState(null, '', `#/legales/${area}`);
  }
  const main = document.getElementById('main');
  const y = main?.scrollTop || 0;
  const pos = document.getElementById('area-q')?.selectionStart ?? query.length;
  paintLegales();
  const again = document.getElementById('area-q');
  if (again) {
    again.focus();
    try { again.setSelectionRange(pos, pos); } catch { /* el navegador no siempre deja mover el cursor */ }
  }
  if (main) main.scrollTop = y;
}

async function buscarClientes(query) {
  const seq = ++searchSeq;
  const data = await api(`/api/clients?q=${encodeURIComponent(query)}&limit=100`);
  if (seq !== searchSeq) return;
  if (parseRoute().name === 'clientes' && parseRoute().id) {
    state.clientOpen = null;
    state.clientDetail = null;
    history.replaceState(null, '', '#/clientes');
  }
  state.clients = data.clients;
  state.clientsTruncated = data.clients.length >= 100;
  const box = document.getElementById('client-list');
  if (box) box.innerHTML = clientListHtml(state);
}

async function buscarTurnoCliente(query) {
  const box = document.getElementById('turno-results');
  if (!box) return;
  if (!query.trim()) {
    box.innerHTML = '';
    return;
  }
  const data = await api(`/api/clients?q=${encodeURIComponent(query)}&limit=6`);
  box.innerHTML = data.clients.length ? `<div class="results">${data.clients.map((client) => `
    <button type="button" class="result" data-action="elegir-turno-cliente" data-id="${esc(client.id)}" data-nombre="${esc(client.nombre)}">
      <span><strong>${esc(client.nombre)}</strong><small>${esc(client.dni ? `DNI ${client.dni}` : 'Sin DNI')}</small></span>
    </button>`).join('')}</div>` : '<p class="empty-inline">No hay clientes con ese dato.</p>';
}

document.addEventListener('click', async (event) => {
  if (event.target.closest('#usermenu')) closeMenu();
  if (!event.target.closest('.userbox')) closeMenu();
  const el = event.target.closest('[data-action]');
  if (!el || !clickActions[el.dataset.action]) return;
  try {
    await clickActions[el.dataset.action](el, event);
  } catch (error) {
    if (error.status !== 401) toast(error.message || 'No se pudo completar.', 'error');
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target;
  const action = form?.dataset?.action;
  if (!action || !submitActions[action]) return;
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try {
    await submitActions[action](form);
  } catch (error) {
    if (action === 'login') {
      const box = document.getElementById('login-error');
      if (box) {
        box.hidden = false;
        box.textContent = error.message;
      }
      return;
    }
    if (error.status !== 401) toast(error.message || 'No se pudo completar.', 'error');
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
});

document.addEventListener('input', (event) => {
  const action = event.target?.dataset?.input;
  if (action && inputActions[action]) inputActions[action](event.target);
});

document.addEventListener('change', async (event) => {
  if (event.target?.id === 'ficha-cam') {
    const file = event.target.files?.[0];
    const target = document.querySelector('#modal-root input[name="archivo"]');
    if (file && target) {
      const prepared = await prepareFile(file);
      const transfer = new DataTransfer();
      transfer.items.add(prepared);
      target.files = transfer.files;
    }
    return;
  }
  const action = event.target?.dataset?.change;
  if (!action || !changeActions[action]) return;
  try {
    await changeActions[action](event.target);
  } catch (error) {
    if (error.status !== 401) toast(error.message || 'No se pudo completar.', 'error');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const printRoot = document.getElementById('print-root');
    if (printRoot && !printRoot.hidden) {
      cerrarImpresion();
      return;
    }
    if (document.getElementById('lightbox-root')?.innerHTML) {
      document.getElementById('lightbox-root').innerHTML = '';
      return;
    }
    if (document.getElementById('modal-root')?.innerHTML) finishModal(false);
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target?.getAttribute('role') === 'button') {
    event.preventDefault();
    event.target.click();
  }
});

document.getElementById('modal-root').addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-back')) finishModal(false);
});

document.getElementById('lightbox-root').addEventListener('click', (event) => {
  if (event.target.classList.contains('lightbox')) event.currentTarget.innerHTML = '';
});

document.getElementById('pick-camera').addEventListener('change', () => onPicked(true));
document.getElementById('pick-file').addEventListener('change', () => onPicked(false));

async function boot() {
  state.agenda.soloMios = localStorage.getItem('agenda-mios') === '1';
  state.agenda.fecha = hoyAR();
  try {
    state.branding = await api('/api/branding');
  } catch {
    state.branding = null;
  }
  try {
    const me = await api('/api/me');
    if (me.user) applyMe(me);
  } catch (error) {
    state.user = null;
    if (error.status !== 401) toast(error.message, 'error');
  }
  window.addEventListener('hashchange', () => render());
  if (state.user && (!location.hash || location.hash === '#/')) location.hash = '#/inicio';
  else render();
}

installDemo().then(boot).catch((error) => {
  const root = document.getElementById('app');
  if (root) root.textContent = error?.message || 'No se pudo abrir la demostración.';
});
