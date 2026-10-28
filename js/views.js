import {
  archivoSrc,
  cuenta,
  diaCorto,
  esc,
  fechaLarga,
  formatCuando,
  formatFecha,
  icon,
  iniciales,
  isPreviewable,
  nombreEstado,
  recorte,
  startOfWeek,
  addDays,
  texto,
  waLink,
} from './util.js';

function rolNombre(state) {
  return state.roles?.find((rol) => rol.id === state.user.rol)?.nombre
    || (state.user.rol === 'superadmin' ? 'Administración' : 'Equipo');
}

function ibtn(glyph, label, attrs = '', extra = '') {
  const cls = ['ibtn', extra].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}" aria-label="${esc(label)}" title="${esc(label)}" ${attrs}>${icon(glyph)}</button>`;
}

function ilink(glyph, label, href, extra = '') {
  return `<a class="ibtn" href="${href}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(glyph)}</a>`;
}

function contactBits(client) {
  return [client.dni && `DNI ${client.dni}`, client.telefono, client.email].filter(Boolean);
}

function metaCliente(client) {
  return [client.dni && `DNI ${client.dni}`, client.telefono].filter(Boolean).join(' · ');
}

export function loginView(brand) {
  const studio = brand?.estudioNombre || 'Estudio Jurídico Reverter';
  const titular = brand?.titular || 'María Florencia Reverter';
  return `
    <main class="login">
      <section class="login-card">
        <div class="seal" aria-hidden="true">R</div>
        <p class="kicker">Agenda interna</p>
        <h1>${esc(studio)}</h1>
        <p class="login-sub">${esc(titular)}</p>
        <form data-action="login" class="stack" autocomplete="on">
          <label class="field">Usuario
            <input name="username" autocomplete="username" required autofocus>
          </label>
          <label class="field">Clave
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button class="btn btn-primary" type="submit">Ingresar</button>
          <p class="form-error" id="login-error" hidden></p>
        </form>
        <p class="foot-note">Uso interno del estudio. No compartas el enlace.</p>
      </section>
    </main>`;
}

export function shellView(state) {
  const admin = state.user.rol === 'superadmin';
  const items = [
    ['inicio', 'Inicio', 'home'],
    ['agenda', 'Agenda', 'calendar'],
    ['clientes', 'Clientes', 'users'],
    ['legales', 'Legales', 'scale'],
  ];
  if (admin) {
    items.push(['equipo', 'Equipo', 'users']);
    items.push(['ajustes', 'Ajustes', 'settings']);
  }
  const link = ([id, label, glyph]) => `
    <a href="#/${id}" data-nav="${id}">
      ${icon(glyph)}
      <span>${label}</span>
      ${id === 'legales' ? `<em class="badge" data-badge="faltantes" ${state.navFaltantes ? '' : 'hidden'}>${state.navFaltantes || ''}</em>` : ''}
    </a>`;
  return `
    <div class="shell">
      <aside class="side">
        <div class="brand">
          <span class="brand-kicker">Agenda interna</span>
          <strong>${esc(state.settings.estudioNombre)}</strong>
          <span class="brand-sub">${esc(state.settings.titular)}</span>
        </div>
        <nav class="nav">${items.map(link).join('')}</nav>
      </aside>
      <div class="main-col">
        <header class="topbar">
          <strong id="top-title" class="top-title"></strong>
          <div class="userbox">
            <button type="button" class="userbtn" data-action="toggle-menu" aria-haspopup="true">
              <span class="avatar">${esc(iniciales(state.user.nombre))}</span>
              <span class="user-meta"><strong>${esc(state.user.nombre)}</strong><small>${esc(rolNombre(state))}</small></span>
            </button>
            <div class="usermenu" id="usermenu" hidden>
              ${admin ? '<a href="#/equipo">Equipo</a><a href="#/ajustes">Ajustes</a>' : ''}
              <button type="button" data-action="abrir-clave">Mi clave</button>
              <button type="button" data-action="logout">Salir</button>
            </div>
          </div>
        </header>
        <main class="main" id="main"></main>
      </div>
    </div>
    <nav class="tabbar">${items.slice(0, 4).map(link).join('')}</nav>`;
}

export function inicioView(state) {
  const dash = state.dashboard;
  const hoyTexto = dash.conteos.turnosHoy
    ? cuenta(dash.conteos.turnosHoy, 'turno para hoy', 'turnos para hoy')
    : 'Hoy no hay turnos cargados.';
  return `
    <div class="wrap">
      <header class="page-head">
        <p class="kicker">${esc(dash.saludo)}</p>
        <h1>${esc(dash.nombreCorto)}</h1>
        <p class="lede">${esc(fechaLarga(dash.hoy))}. ${esc(hoyTexto)} ${esc(cuenta(dash.conteos.clientes, 'cliente en el estudio', 'clientes en el estudio'))}.</p>
      </header>
      <div class="quick">
        ${ibtn('userPlus', 'Nuevo cliente', 'data-action="abrir-modal-cliente"', 'solid')}
        ${ibtn('calPlus', 'Nuevo turno', 'data-action="abrir-modal-turno"', 'solid green')}
      </div>
      <div class="dash">
        <section class="card">
          <div class="section-head"><h2>Turnos de hoy</h2><a href="#/agenda">Agenda</a></div>
          ${dash.turnosHoy.length ? dash.turnosHoy.map((turno) => turnoCard(turno, state)).join('') : '<p class="empty">Nada agendado para hoy.</p>'}
          <div class="section-head" style="margin-top:16px"><h2>Próximos</h2></div>
          ${dash.proximos.length ? dash.proximos.map((turno) => turnoCard(turno, state)).join('') : '<p class="empty">No hay turnos más adelante.</p>'}
        </section>
        <div class="stack">
          <section class="card">
            <div class="section-head"><h2>Faltantes</h2><span>${dash.conteos.faltantes || 0}</span></div>
            ${dash.faltantes.length ? dash.faltantes.map((item) => `
              <a class="person" href="#/legales/${esc(item.area || 'familia')}/${esc(item.id)}">
                <span class="avatar">${esc(iniciales(item.nombre))}</span>
                <span class="person-main">
                  <strong>${esc(item.nombre)}</strong>
                  <small>${esc(item.titulos.join(' · '))}${item.cantidad > item.titulos.length ? '…' : ''}</small>
                </span>
                <em class="badge">${item.cantidad}</em>
              </a>`).join('') : '<p class="empty">No hay papeles pendientes en Familia.</p>'}
          </section>
          <section class="card">
            <div class="section-head"><h2>Pizarra del equipo</h2></div>
            <form data-action="publicar-pizarra" class="quick-add">
              <input name="texto" maxlength="800" required placeholder="Ej.: Mañana la audiencia de Gómez se pasó a las 11">
              <button class="ibtn solid green" type="submit" aria-label="Dejar nota" title="Dejar nota">${icon('send')}</button>
            </form>
            ${dash.pizarra.length ? dash.pizarra.map((nota) => `
              <article class="note">
                <div>
                  <strong>${esc(nota.usuario || 'Equipo')}</strong>
                  <p>${texto(nota.texto)}</p>
                  <small>${esc(formatCuando(nota.createdAt))}</small>
                </div>
                ${nota.userId === state.user.id || state.user.rol === 'superadmin' ? ibtn('trash', 'Borrar', `data-action="borrar-pizarra" data-id="${esc(nota.id)}"`, 'danger') : ''}
              </article>`).join('') : '<p class="empty">Todavía no hay mensajes. Dejá una nota para que la vea el resto.</p>'}
          </section>
        </div>
      </div>
      <section class="card">
        <div class="section-head"><h2>Movimientos</h2></div>
        ${dash.actividad.length ? dash.actividad.map((item) => `
          <article class="act">
            <div>
              <strong>${esc(item.usuario || 'Alguien')}</strong> ${esc(item.detalle)}
              <small>${esc(formatCuando(item.createdAt))}</small>
            </div>
            ${item.clientId ? ilink('file', 'Ficha', `#/clientes/${esc(item.clientId)}`) : ''}
          </article>`).join('') : '<p class="empty">Cuando carguen clientes, turnos o documentos, va a quedar acá.</p>'}
      </section>
    </div>`;
}

function turnoCard(turno, state) {
  const label = state?.turnoEstados?.find((item) => item.id === turno.estado)?.nombre || turno.estado;
  return `
    <article class="turno is-${esc(turno.estado)}">
      <div class="turno-hora">${esc(turno.hora)}<small style="display:block;font-family:var(--sans);font-size:.72rem;color:var(--muted)">${esc(formatFecha(turno.fecha))}</small></div>
      <div class="turno-main">
        <strong><a href="#/clientes/${esc(turno.clientId)}">${esc(turno.clienteNombre)}</a></strong>
        <span>${esc(turno.motivo)}</span>
        <small>${esc([turno.asignadoNombre && `Atiende ${turno.asignadoNombre}`, turno.notas].filter(Boolean).join(' · '))}</small>
      </div>
      <span class="pill pill-${esc(turno.estado)}">${esc(label)}</span>
    </article>`;
}

export function agendaView(state) {
  const fecha = state.agenda.fecha;
  const desde = startOfWeek(fecha);
  const days = Array.from({ length: 7 }, (_, index) => addDays(desde, index));
  const visibles = (state.agenda.turnos || []).filter((turno) => {
    if (turno.fecha !== fecha) return false;
    if (state.agenda.soloMios && turno.asignadoA !== state.user.id) return false;
    return true;
  });
  const marcas = new Set((state.agenda.turnos || []).filter((turno) => turno.estado !== 'cancelado').map((turno) => turno.fecha));
  return `
    <div class="wrap">
      <header class="page-head">
        <p class="kicker">Turnos</p>
        <h1>${esc(fechaLarga(fecha))}</h1>
      </header>
      <div class="week">
        ${ibtn('back', 'Semana anterior', 'data-action="semana" data-dir="-1"')}
        <div class="days">
          ${days.map((day) => `
            <button type="button" class="daybtn ${day === fecha ? 'on' : ''} ${marcas.has(day) ? 'has' : ''}" data-action="cambiar-dia" data-fecha="${day}">
              <small>${esc(diaCorto(day))}</small>
              <strong>${day.slice(8)}</strong>
            </button>`).join('')}
        </div>
        ${ibtn('chevron', 'Semana siguiente', 'data-action="semana" data-dir="1"', 'turn')}
      </div>
      <div class="quick">
        ${ibtn('calPlus', 'Nuevo turno', `data-action="abrir-modal-turno" data-fecha="${esc(fecha)}"`, 'solid green')}
        ${ibtn('calendar', 'Hoy', 'data-action="ir-hoy"')}
        <label class="check"><input type="checkbox" data-change="solo-mios" ${state.agenda.soloMios ? 'checked' : ''}> Solo los míos</label>
      </div>
      <section class="card">
        ${visibles.length ? visibles.map((turno) => `
          <article class="turno is-${esc(turno.estado)}">
            <div class="turno-hora">${esc(turno.hora)}</div>
            <div class="turno-main">
              <strong><a href="#/clientes/${esc(turno.clientId)}">${esc(turno.clienteNombre)}</a></strong>
              <span>${esc(turno.motivo)}</span>
              <small>${esc([turno.asignadoNombre, turno.clienteTelefono, turno.notas].filter(Boolean).join(' · '))}</small>
              <div class="iconacts">
                ${turno.estado === 'pendiente' ? ibtn('check', 'Confirmar', `data-action="estado-turno" data-id="${esc(turno.id)}" data-estado="confirmado"`) : ''}
                ${turno.estado !== 'atendido' && turno.estado !== 'cancelado' ? ibtn('done', 'Atendido', `data-action="estado-turno" data-id="${esc(turno.id)}" data-estado="atendido"`) : ''}
                ${ibtn('edit', 'Editar', `data-action="abrir-modal-turno" data-id="${esc(turno.id)}"`)}
                ${ibtn('trash', 'Borrar', `data-action="borrar-turno" data-id="${esc(turno.id)}"`, 'danger')}
              </div>
            </div>
            <span class="pill pill-${esc(turno.estado)}">${esc(etiquetaTurno(state, turno.estado))}</span>
          </article>`).join('') : '<p class="empty">Este día no tiene turnos.</p>'}
      </section>
    </div>`;
}

function etiquetaTurno(state, value) {
  return state.turnoEstados?.find((item) => item.id === value)?.nombre || value;
}

export function searchResultsHtml(clients) {
  if (!clients.length) return '<p class="empty-inline">No hay clientes con ese dato.</p>';
  return `<div class="results">${clients.map((client) => `
    <button type="button" class="result" data-action="seleccionar-cliente" data-id="${esc(client.id)}">
      <span class="avatar">${esc(iniciales(client.nombre))}</span>
      <span><strong>${esc(client.nombre)}</strong><small>${esc(contactBits(client).join(' · ') || 'Sin DNI ni teléfono')}</small></span>
    </button>`).join('')}</div>`;
}

export function clientListHtml(state) {
  const clients = state.clients || [];
  if (!clients.length) return '<p class="empty">No hay clientes.</p>';
  const open = state.clientOpen;
  const visible = open ? clients.filter((client) => client.id === open) : clients;
  if (!visible.length) return '<p class="empty">No hay clientes.</p>';
  return `
    ${open ? `<div class="list-back">${ibtn('back', 'Ver la lista', `data-action="toggle-cliente" data-id="${esc(open)}"`)}</div>` : ''}
    <table class="sheet people">
      <tbody>
        ${visible.map((client) => `
          <tr class="clickrow ${open === client.id ? 'is-on' : ''}" data-action="toggle-cliente" data-id="${esc(client.id)}" role="button" tabindex="0">
            <td>
              <span class="who"><strong>${esc(client.nombre)}</strong></span>
              <small>${esc(metaCliente(client) || 'Sin DNI ni teléfono')}</small>
            </td>
          </tr>
          ${open === client.id ? `<tr class="detail-row"><td>${clienteExpand(state, client)}</td></tr>` : ''}`).join('')}
      </tbody>
    </table>
    ${!open && state.clientsTruncated ? '<p class="empty">Hay más. Afiná la búsqueda.</p>' : ''}`;
}

function clienteExpand(state, client) {
  const detail = state.clientDetail?.client?.id === client.id ? state.clientDetail : null;
  const areas = client.areas || [];
  const datos = [client.email, client.domicilio].filter(Boolean);
  const turno = detail?.turnos?.[0];
  const wa = waLink(client.telefono);
  return `
    <div class="expand">
      <p>${esc(datos.join(' · ') || 'Sin email ni domicilio')}</p>
      ${client.notas ? `<p>${texto(client.notas)}</p>` : ''}
      ${turno ? `<p>Próximo turno: ${esc(formatFecha(turno.fecha))} ${esc(turno.hora)} · ${esc(turno.motivo)}</p>` : ''}
      <div class="area-links">
        ${areas.length
          ? areas.map((area) => `<a href="#/legales/${esc(area.id)}/${esc(client.id)}">${esc(area.nombre)}</a>`).join('')
          : '<span class="muted">Sin área. En Legales, abrí el área y sumalo.</span>'}
      </div>
      <div class="iconacts">
        ${wa ? ilink('whatsapp', 'WhatsApp', esc(wa), 'target="_blank" rel="noopener"') : ''}
        ${ibtn('edit', 'Editar', `data-action="abrir-modal-cliente" data-id="${esc(client.id)}"`)}
        ${ibtn('calendar', 'Turno', `data-action="abrir-modal-turno" data-client="${esc(client.id)}"`)}
        ${areas.length ? ibtn('printer', 'Imprimir PDF', `data-action="imprimir-cliente" data-id="${esc(client.id)}"`) : ''}
        ${state.user.rol === 'superadmin' ? ibtn('trash', 'Eliminar', `data-action="borrar-cliente" data-id="${esc(client.id)}"`, 'danger') : ''}
      </div>
      <div class="comentarios">
        ${(detail?.comentarios || []).map((item) => commentHtml(item, state)).join('')}
        <form data-action="publicar-comentario" data-client="${esc(client.id)}" class="quick-add">
          <input name="texto" maxlength="800" required placeholder="Nota para el equipo">
          <button class="ibtn" type="submit" aria-label="Dejar" title="Dejar">${icon('send')}</button>
        </form>
      </div>
    </div>`;
}

export function clientesView(state) {
  return `
    <div class="wrap">
      <header class="page-head">
        <h1>Clientes</h1>
      </header>
      <div class="search-line">
        <label class="search">
          ${icon('search')}
          <input id="clientes-q" data-input="buscar-clientes" value="${esc(state.clientQuery || '')}" placeholder="Nombre, DNI o teléfono" autocomplete="off">
        </label>
        ${ibtn('userPlus', 'Nuevo cliente', 'data-action="abrir-modal-cliente"', 'solid')}
      </div>
      <div id="client-list">${clientListHtml(state)}</div>
    </div>`;
}

export function clienteView(state) {
  const { client, turnos, comentarios, resumen } = state.clientDetail;
  const wa = waLink(client.telefono);
  return `
    <div class="wrap">
      <header class="page-head">
        <p class="kicker"><a href="#/clientes">Clientes</a></p>
        <h1>${esc(client.nombre)}</h1>
        <p class="lede">${esc(contactBits(client).join(' · ') || 'Sin datos de contacto')}</p>
      </header>
      <div class="quick">
        <a class="btn btn-primary" href="#/legales/${esc(client.id)}">Abrir legajo</a>
        <button type="button" class="btn btn-green" data-action="abrir-modal-turno" data-client="${esc(client.id)}">Nuevo turno</button>
        ${wa ? `<a class="btn btn-quiet" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <button type="button" class="btn btn-quiet" data-action="abrir-modal-cliente" data-id="${esc(client.id)}">Editar</button>
        ${state.user.rol === 'superadmin' ? `<button type="button" class="btn btn-quiet" data-action="borrar-cliente" data-id="${esc(client.id)}">Eliminar</button>` : ''}
      </div>
      <div class="dash">
        <section class="card">
          <h2>Ficha</h2>
          <p style="margin-top:8px">${client.domicilio ? esc(client.domicilio) : '<span class="muted">Sin domicilio</span>'}</p>
          ${client.notas ? `<p class="nota-fija">${texto(client.notas)}</p>` : '<p class="empty">Sin nota interna.</p>'}
          <div class="section-head" style="margin-top:18px"><h2>Legajo</h2></div>
          <div class="resumen-list">
            ${resumen.map((area) => `
              <a href="#/legales/${esc(client.id)}">
                <span>${esc(area.nombre)}</span>
                <small>${area.total ? esc(cuenta(area.total, 'pieza', 'piezas')) : 'Sin movimientos'}${area.faltantes ? ` · ${area.faltantes} faltante${area.faltantes === 1 ? '' : 's'}` : ''}</small>
              </a>`).join('')}
          </div>
          <div class="section-head" style="margin-top:18px"><h2>Próximos turnos</h2></div>
          ${turnos.length ? turnos.map((turno) => turnoCard(turno, state)).join('') : '<p class="empty">No tiene turnos por delante.</p>'}
        </section>
        <section class="card">
          <div class="section-head"><h2>Mensajes del equipo</h2></div>
          <div class="comentarios" id="comentarios">
            ${comentarios.length ? comentarios.map((item) => commentHtml(item, state)).join('') : '<p class="empty" id="comentarios-vacio">Acá pueden dejarse pedidos: “falta el DNI”, “llamó la hija”, “traer el poder”.</p>'}
          </div>
          <form data-action="publicar-comentario" data-client="${esc(client.id)}" class="stack">
            <textarea name="texto" maxlength="800" required placeholder="Escribí para el equipo"></textarea>
            <button class="btn btn-green" type="submit">Publicar</button>
          </form>
        </section>
      </div>
    </div>`;
}

function commentHtml(item, state) {
  const canDelete = item.userId === state.user.id || state.user.rol === 'superadmin';
  return `
    <article class="bubble">
      <strong>${esc(item.usuario || 'Equipo')}</strong>
      <small> · ${esc(formatCuando(item.createdAt))}</small>
      <p>${texto(item.texto)}</p>
      ${canDelete ? ibtn('trash', 'Borrar', `data-action="borrar-comentario" data-id="${esc(item.id)}"`, 'danger') : ''}
    </article>`;
}

function deudaBadge(cantidad) {
  if (!cantidad) return '';
  const titulo = cuenta(cantidad, 'papel faltante', 'papeles faltantes');
  return `<em class="badge" title="${esc(titulo)}">${cantidad}</em>`;
}

export function legalesView(state) {
  const openId = state.legales.areaId;
  const faltan = (state.legales.resumen || []).reduce((sum, area) => sum + (area.faltantes || 0), 0);
  return `
    <div class="wrap">
      <header class="page-head">
        <h1>Legales ${deudaBadge(faltan)}</h1>
      </header>
      ${(state.areas || []).map((area, index) => areaShell(state, area, index, area.id === openId)).join('')}
    </div>`;
}

function areaShell(state, area, index, open) {
  const info = (state.legales.resumen || []).find((item) => item.id === area.id) || {};
  const sub = [
    area.buckets.map((bucket) => bucket.nombre).join(' · '),
    info.clientes ? cuenta(info.clientes, 'cliente', 'clientes') : '',
  ].filter(Boolean).join(' · ');
  return `
    <article class="area ${open ? 'is-open' : ''}">
      <button type="button" class="area-head" data-action="toggle-area" data-area="${esc(area.id)}" aria-expanded="${open}">
        <span class="idx">${String(index + 1).padStart(2, '0')}</span>
        <span class="area-label">
          <strong>${esc(area.nombre)}</strong>
          <small>${esc(sub)}</small>
        </span>
        ${deudaBadge(info.faltantes || 0)}
        ${icon('chevron')}
      </button>
      ${open ? `<div class="area-body">${areaWorkspace(state, area)}</div>` : ''}
    </article>`;
}

function areaWorkspace(state, area) {
  const query = state.legales.query || '';
  const lista = state.legales.lista || [];
  const fuera = state.legales.fuera || [];
  const selected = state.legales.work?.area?.id === area.id ? state.legales.work.client?.id : '';
  let rows = [...lista].sort((a, b) => (b.faltantes || 0) - (a.faltantes || 0) || a.nombre.localeCompare(b.nombre, 'es'));
  if (selected) {
    rows = rows.filter((client) => client.id === selected);
    if (!rows.length && state.legales.work?.client?.id === selected) rows = [state.legales.work.client];
  }
  const mostrarDeuda = !selected && rows.some((client) => client.faltantes);
  const fila = (client) => `
    <tr class="clickrow ${selected === client.id ? 'is-on' : ''}" data-action="abrir-en-area" data-area="${esc(area.id)}" data-id="${esc(client.id)}" role="button" tabindex="0">
      <td>
        <span class="who"><strong>${esc(client.nombre)}</strong>${deudaBadge(client.faltantes || 0)}</span>
        <small>${esc(metaCliente(client) || 'Sin DNI ni teléfono')}</small>
      </td>
    </tr>`;
  return `
    <label class="search">
      ${icon('search')}
      <input id="area-q" data-input="buscar-en-area" data-area="${esc(area.id)}" value="${esc(query)}" placeholder="Buscar en ${esc(area.nombre)}" autocomplete="off">
    </label>
    <div class="row-actions" style="margin:8px 0">
      ${ibtn('userPlus', `Nuevo en ${area.nombre}`, `data-action="abrir-modal-cliente" data-area="${esc(area.id)}"`, 'solid')}
    </div>
    ${selected ? `<div class="list-back">${ibtn('back', 'Ver la lista', `data-action="abrir-en-area" data-area="${esc(area.id)}" data-id="${esc(selected)}"`)}</div>` : ''}
    ${rows.length ? `
      <table class="sheet people">
        <tbody>
          ${mostrarDeuda ? '<tr class="sheet-note"><td>Adeudan papeles</td></tr>' : ''}
          ${rows.filter((client) => !mostrarDeuda || client.faltantes).map(fila).join('')}
          ${mostrarDeuda ? rows.filter((client) => !client.faltantes).map(fila).join('') : ''}
        </tbody>
      </table>` : `<p class="empty">${query.trim() ? 'Nadie de esta área con ese dato.' : 'Todavía no hay clientes en esta área.'}</p>`}
    ${!selected && fuera.length ? `
      <p class="muted">En el estudio, sin esta área</p>
      <div class="lines">
        ${fuera.map((client) => `
          <article class="docline">
            <div class="docmain"><div><strong>${esc(client.nombre)}</strong>${client.dni ? `<small>DNI ${esc(client.dni)}</small>` : ''}</div></div>
            ${ibtn('plus', 'Sumar', `data-action="sumar-area" data-id="${esc(client.id)}" data-area="${esc(area.id)}"`)}
          </article>`).join('')}
      </div>` : ''}
    ${state.legales.work?.area?.id === area.id ? workPanel(state, state.legales.work) : ''}`;
}

function workPanel(state, data) {
  const { client, area } = data;
  if (!data.enArea) {
    return `
      <div class="work">
        <p><strong>${esc(client.nombre)}</strong> no está en ${esc(area.nombre)}.</p>
        ${ibtn('plus', `Sumar a ${area.nombre}`, `data-action="sumar-area" data-id="${esc(client.id)}" data-area="${esc(area.id)}"`, 'solid')}
      </div>`;
  }
  const carpeta = area.carpetas.find((item) => item.id === state.legales.carpeta[area.id]) || area.carpetas[0];
  const bits = [client.dni && `DNI ${client.dni}`, client.telefono, client.email, client.domicilio].filter(Boolean);
  return `
    <div class="work">
      <div class="work-head">
        <div>
          <strong>${esc(client.nombre)}</strong>
          <small>${esc(bits.join(' · ') || 'Sin datos de contacto')}</small>
        </div>
        <div class="iconacts">
          ${ibtn('printer', 'Imprimir PDF', `data-action="imprimir-area" data-id="${esc(client.id)}" data-area="${esc(area.id)}"`)}
          ${ibtn('edit', 'Editar', `data-action="abrir-modal-cliente" data-id="${esc(client.id)}"`)}
          ${ibtn('calendar', 'Turno', `data-action="abrir-modal-turno" data-client="${esc(client.id)}"`)}
          ${ibtn('minus', 'Quitar del área', `data-action="quitar-area" data-id="${esc(client.id)}" data-area="${esc(area.id)}"`, 'danger')}
        </div>
      </div>
      ${client.notas ? `<p class="nota-fija">${texto(recorte(client.notas, 240))}</p>` : ''}
      ${carpeta ? `${carpetaTools(area, carpeta)}${bucketsHtml(area, carpeta)}` : ''}
    </div>`;
}

function carpetaTools(area, carpeta) {
  const many = area.carpetas.length > 1;
  return `
    <div class="carpeta-tools">
      <input data-change="guardar-nota-carpeta" data-carpeta="${esc(carpeta.id)}" value="${esc(carpeta.notas)}" placeholder="Nota del expediente" maxlength="500">
      <div class="iconacts">
        ${many ? `<select data-change="cambiar-carpeta" data-area="${esc(area.id)}" aria-label="Carpeta">${area.carpetas.map((item) => `<option value="${esc(item.id)}" ${item.id === carpeta.id ? 'selected' : ''}>${esc(item.titulo)}</option>`).join('')}</select>` : ''}
        ${ibtn('folder', 'Otra carpeta', `data-action="nueva-carpeta" data-area="${esc(area.id)}"`)}
        ${many ? `${ibtn('edit', 'Renombrar', `data-action="renombrar-carpeta" data-id="${esc(carpeta.id)}" data-titulo="${esc(carpeta.titulo)}"`)}
          ${ibtn('trash', 'Eliminar carpeta', `data-action="borrar-carpeta" data-id="${esc(carpeta.id)}"`, 'danger')}` : ''}
      </div>
    </div>`;
}

function bucketsHtml(area, carpeta) {
  return `<div class="buckets buckets-${area.buckets.length}">${area.buckets.map((bucket) => bucketHtml(area, carpeta, bucket)).join('')}</div>`;
}

function bucketHtml(area, carpeta, bucket) {
  const items = carpeta.items[bucket.id] || [];
  let body = '';
  if (bucket.tipo === 'archivo') body = archivoBucket(area, carpeta, bucket, items);
  else if (bucket.tipo === 'faltante') body = faltanteBucket(carpeta, items);
  else body = fichaBucket(area, carpeta, bucket, items);
  return `
    <section class="bucket">
      <div class="bucket-head"><h3>${esc(bucket.nombre)}</h3><small>${items.length}</small></div>
      ${body}
    </section>`;
}

function archivoBucket(area, carpeta, bucket, items) {
  const presentados = new Set((carpeta.items.presentado || []).map((item) => item.origenItemId).filter(Boolean));
  return `
    <div class="iconacts">
      ${ibtn('camera', 'Foto', `data-action="sacar-foto" data-carpeta="${esc(carpeta.id)}" data-bucket="${esc(bucket.id)}"`, 'solid green')}
      ${ibtn('file', 'Archivo', `data-action="subir-archivo" data-carpeta="${esc(carpeta.id)}" data-bucket="${esc(bucket.id)}"`)}
    </div>
    ${items.length ? `<div class="lines">${items.map((item) => docRow(area, item, presentados)).join('')}</div>` : '<p class="empty">Sin documentos.</p>'}`;
}

function docRow(area, item, presentados) {
  const preview = item.tieneArchivo && isPreviewable(item.archivoMime);
  const thumb = preview
    ? `<button type="button" class="thumb-btn" data-action="ver-archivo" data-id="${esc(item.id)}" aria-label="Ver"><img class="thumb-mini" src="${archivoSrc(item)}" alt=""></button>`
    : (item.tieneArchivo ? `<span class="filemark">${icon('file')}</span>` : '');
  const pasar = area.id === 'familia' && item.bucket === 'documentos' && !presentados.has(item.id)
    ? ibtn('present', 'A presentado', `data-action="presentar-documento" data-id="${esc(item.id)}"`)
    : '';
  return `
    <article class="docline">
      <div class="docmain">${thumb}<div><strong>${esc(item.titulo)}</strong><small>${esc(formatCuando(item.createdAt))}</small></div></div>
      <div class="iconacts">
        ${preview ? ibtn('printer', 'PDF', `data-action="imprimir-archivo" data-id="${esc(item.id)}"`) : ''}
        ${item.tieneArchivo ? ilink('download', 'Bajar', archivoSrc(item, true), 'download') : ''}
        ${ibtn('edit', 'Nombre', `data-action="renombrar-item" data-id="${esc(item.id)}"`)}
        ${pasar}
        ${ibtn('trash', 'Borrar', `data-action="borrar-item" data-id="${esc(item.id)}"`, 'danger')}
      </div>
    </article>`;
}

function faltanteBucket(carpeta, items) {
  return `
    <form data-action="agregar-faltantes" data-carpeta="${esc(carpeta.id)}" class="stack">
      <textarea name="texto" required placeholder="Un faltante por línea"></textarea>
      <button class="ibtn solid" type="submit" aria-label="Agregar" title="Agregar">${icon('plus')}</button>
    </form>
    ${items.length ? `<div class="lines">${items.map((item) => `
      <article class="docline">
        <button type="button" class="docmain tap" data-action="capturar-faltante" data-id="${esc(item.id)}">
          ${icon('camera')}<strong>${esc(item.titulo)}</strong>
        </button>
        <div class="iconacts">
          ${ibtn('file', 'Archivo', `data-action="archivo-faltante" data-id="${esc(item.id)}"`)}
          ${ibtn('trash', 'Quitar', `data-action="borrar-item" data-id="${esc(item.id)}"`, 'danger')}
        </div>
      </article>`).join('')}</div>` : '<p class="empty">Sin faltantes.</p>'}`;
}

function fichaBucket(area, carpeta, bucket, items) {
  const placeholder = bucket.etiquetas?.tituloPh || bucket.etiquetas?.titulo || 'Título';
  return `
    <form data-action="agregar-rapido" data-carpeta="${esc(carpeta.id)}" data-bucket="${esc(bucket.id)}" data-area="${esc(area.id)}" class="quick-add">
      <input name="titulo" required maxlength="200" placeholder="${esc(placeholder)}">
      <button class="ibtn solid" type="submit" aria-label="Agregar" title="Agregar">${icon('plus')}</button>
      ${ibtn('more', 'Más datos', `data-action="abrir-ficha" data-carpeta="${esc(carpeta.id)}" data-area="${esc(area.id)}" data-bucket="${esc(bucket.id)}"`)}
    </form>
    ${items.length ? `<div class="lines">${items.map((item) => fichaRow(bucket, item)).join('')}</div>` : '<p class="empty">Sin registros.</p>'}`;
}

function fichaRow(bucket, item) {
  const estado = nombreEstado(bucket.estados, item.estado);
  const meta = [estado, item.fecha ? formatFecha(item.fecha) : ''].filter(Boolean).join(' · ');
  return `
    <article class="docline">
      <div class="docmain">
        <div>
          <strong>${esc(item.titulo)}</strong>
          ${meta ? `<small>${esc(meta)}</small>` : ''}
          ${item.cuerpo ? `<small>${esc(recorte(item.cuerpo, 80))}</small>` : ''}
          ${item.tieneArchivo ? `<small><a href="${archivoSrc(item)}" target="_blank" rel="noopener">${esc(item.archivoNombre || 'Adjunto')}</a></small>` : ''}
        </div>
      </div>
      <div class="iconacts">
        ${item.tieneArchivo && isPreviewable(item.archivoMime) ? ibtn('printer', 'PDF', `data-action="imprimir-archivo" data-id="${esc(item.id)}"`) : ''}
        ${ibtn('edit', 'Editar', `data-action="editar-item" data-id="${esc(item.id)}"`)}
        ${ibtn('trash', 'Borrar', `data-action="borrar-item" data-id="${esc(item.id)}"`, 'danger')}
      </div>
    </article>`;
}

function modalShell(title, body, footer, action) {
  return `
    <form class="modal" data-action="${action}" role="dialog" aria-modal="true" autocomplete="off">
      <header class="modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="iconbtn" data-action="cerrar-modal" aria-label="Cerrar">${icon('close')}</button>
      </header>
      <div class="modal-body stack">${body}</div>
      <footer class="modal-foot">${footer}</footer>
    </form>`;
}

const foot = (label) => `
  <button type="button" class="btn btn-quiet" data-action="cerrar-modal">Cancelar</button>
  <button class="btn btn-primary" type="submit">${label}</button>`;

export function clienteForm(client, options = {}) {
  const current = client || {};
  const areaId = options.areaId || '';
  return modalShell(client ? 'Editar cliente' : 'Nuevo cliente', `
    <input type="hidden" name="id" value="${esc(current.id || '')}">
    ${areaId ? `<input type="hidden" name="area" value="${esc(areaId)}">` : ''}
    <label class="field">Nombre y apellido
      <input name="nombre" required maxlength="160" value="${esc(current.nombre || options.nombre || '')}">
    </label>
    <label class="field">DNI
      <input name="dni" maxlength="32" value="${esc(current.dni || '')}" inputmode="numeric">
    </label>
    <label class="field">Teléfono
      <input name="telefono" maxlength="40" value="${esc(current.telefono || '')}">
    </label>
    <label class="field">Email
      <input name="email" type="email" maxlength="160" value="${esc(current.email || '')}">
    </label>
    <label class="field">Domicilio
      <input name="domicilio" maxlength="200" value="${esc(current.domicilio || '')}">
    </label>
    <label class="field">Nota interna
      <textarea name="notas" maxlength="4000" placeholder="Algo que el equipo tiene que tener presente">${esc(current.notas || '')}</textarea>
    </label>
  `, foot('Guardar'), 'guardar-cliente');
}

export function turnoForm(state, turno, lockedClient) {
  const current = turno || {};
  const clientField = lockedClient ? `
    <input type="hidden" name="clientId" value="${esc(lockedClient.id)}">
    <p><strong>${esc(lockedClient.nombre)}</strong></p>` : `
    <label class="field">Cliente
      <input id="turno-q" data-input="buscar-turno-cliente" placeholder="Nombre o DNI" autocomplete="off" value="${esc(current.clienteNombre || '')}">
      <input type="hidden" name="clientId" value="${esc(current.clientId || '')}">
    </label>
    <div id="turno-results"></div>`;
  const options = (state.turnoEstados || []).map((item) => `<option value="${esc(item.id)}" ${item.id === (current.estado || 'pendiente') ? 'selected' : ''}>${esc(item.nombre)}</option>`).join('');
  const people = (state.equipo || []).map((user) => `<option value="${esc(user.id)}" ${(current.asignadoA || state.user.id) === user.id ? 'selected' : ''}>${esc(user.nombre)}</option>`).join('');
  return modalShell(turno ? 'Editar turno' : 'Nuevo turno', `
    <input type="hidden" name="id" value="${esc(current.id || '')}">
    ${clientField}
    <label class="field">Fecha
      <input name="fecha" type="date" required value="${esc(current.fecha || state.agenda.fecha || '')}">
    </label>
    <label class="field">Hora
      <input name="hora" type="time" required value="${esc(current.hora || '09:00')}">
    </label>
    <label class="field">Motivo
      <input name="motivo" required maxlength="200" value="${esc(current.motivo || '')}" placeholder="Consulta, firma, audiencia, retiro de documentos">
    </label>
    <label class="field">Quién atiende
      <select name="asignadoA"><option value="">Sin asignar</option>${people}</select>
    </label>
    <label class="field">Estado
      <select name="estado">${options}</select>
    </label>
    <label class="field">Notas
      <textarea name="notas" maxlength="2000">${esc(current.notas || '')}</textarea>
    </label>
  `, foot('Guardar'), 'guardar-turno');
}

export function fichaForm(bucket, carpetaId, item) {
  const labels = bucket.etiquetas || {};
  const current = item || {};
  const estados = (bucket.estados || []).map((estado) => `<option value="${esc(estado.id)}" ${estado.id === (current.estado || bucket.estados[0]?.id) ? 'selected' : ''}>${esc(estado.nombre)}</option>`).join('');
  return modalShell(item ? `Editar ${bucket.nombre}` : (labels.nuevo || bucket.nombre), `
    <input type="hidden" name="id" value="${esc(current.id || '')}">
    <input type="hidden" name="carpetaId" value="${esc(carpetaId || '')}">
    <input type="hidden" name="bucket" value="${esc(bucket.id)}">
    <label class="field">${esc(labels.titulo || 'Título')}
      <input name="titulo" required maxlength="200" value="${esc(current.titulo || '')}">
    </label>
    <label class="field">${esc(labels.fecha || 'Fecha')}
      <input name="fecha" type="date" value="${esc(current.fecha || '')}">
    </label>
    ${estados ? `<label class="field">Estado<select name="estado">${estados}</select></label>` : ''}
    <label class="field">${esc(labels.cuerpo || 'Detalle')}
      <textarea name="cuerpo" maxlength="5000">${esc(current.cuerpo || '')}</textarea>
    </label>
    <label class="field">Adjuntar archivo
      <input name="archivo" type="file" accept="image/*,application/pdf,.doc,.docx">
    </label>
    ${ibtn('camera', 'Sacar foto', 'data-action="ficha-camara"')}
    <input id="ficha-cam" class="picker" type="file" accept="image/*" capture="environment">
    ${current.archivoNombre ? `<small>Archivo actual: ${esc(current.archivoNombre)}</small>` : ''}
  `, foot('Guardar'), 'guardar-ficha');
}

export function presentarForm(item) {
  return modalShell('Pasar a presentado', `
    <input type="hidden" name="id" value="${esc(item.id)}">
    <p><strong>${esc(item.titulo)}</strong> queda en Documentos y también se anota en Presentado.</p>
    <label class="field">Fecha
      <input name="fecha" type="date" required value="${esc(item.fecha || '')}">
    </label>
    <label class="field">Dónde y observaciones
      <textarea name="cuerpo" maxlength="5000" placeholder="Juzgado, mesa, número de escrito"></textarea>
    </label>
    <label class="field">Estado
      <select name="estado">
        <option value="presentado">Presentado</option>
        <option value="observado">Observado</option>
        <option value="a_subsanar">A subsanar</option>
      </select>
    </label>
  `, foot('Registrar'), 'guardar-presentado');
}

export function usuarioForm(user, roles) {
  const current = user || {};
  const options = (roles || []).map((rol) => `<option value="${esc(rol.id)}" ${rol.id === (current.rol || 'operador') ? 'selected' : ''}>${esc(rol.nombre)}</option>`).join('');
  return modalShell(user ? 'Editar cuenta' : 'Nueva cuenta', `
    <input type="hidden" name="id" value="${esc(current.id || '')}">
    <label class="field">Nombre
      <input name="nombre" required maxlength="120" value="${esc(current.nombre || '')}">
    </label>
    ${user ? `<p>Usuario: <strong>${esc(current.username)}</strong></p>` : `
      <label class="field">Usuario
        <input name="username" required maxlength="40" autocapitalize="none" autocomplete="off">
      </label>`}
    <label class="field">${user ? 'Nueva clave (opcional)' : 'Clave inicial'}
      <input name="password" type="password" minlength="6" maxlength="200" autocomplete="new-password" ${user ? '' : 'required'} placeholder="${user ? 'Vacío: no cambia' : 'Mínimo 6 caracteres'}">
    </label>
    <label class="field">Rol
      <select name="rol">${options}</select>
    </label>
    ${user ? `<label class="check"><input type="checkbox" name="activo" ${current.activo ? 'checked' : ''}> Cuenta activa</label>` : '<p class="muted">El equipo carga clientes, documentos, fotos y turnos. La administración además crea usuarios y cambia los ajustes.</p>'}
  `, foot(user ? 'Guardar' : 'Crear cuenta'), 'guardar-usuario');
}

export function claveForm() {
  return modalShell('Mi clave', `
    <label class="field">Clave actual
      <input name="actual" type="password" required autocomplete="current-password">
    </label>
    <label class="field">Clave nueva
      <input name="nueva" type="password" required minlength="6" autocomplete="new-password">
    </label>
  `, foot('Cambiar'), 'guardar-clave');
}

export function carpetaForm(areaNombre, areaId) {
  return modalShell(`Otra carpeta en ${areaNombre}`, `
    <input type="hidden" name="area" value="${esc(areaId)}">
    <label class="field">Nombre
      <input name="titulo" required maxlength="120" placeholder="Ej.: Divorcio 2024">
    </label>
    <p class="muted">Sirve cuando la misma persona tiene dos expedientes en la misma área.</p>
  `, foot('Crear'), 'guardar-carpeta');
}

export function renombrarForm(item) {
  return modalShell('Renombrar', `
    <input type="hidden" name="id" value="${esc(item.id)}">
    <label class="field">Título
      <input name="titulo" required maxlength="200" value="${esc(item.titulo || '')}">
    </label>
  `, foot('Guardar'), 'renombrar-item');
}

export function equipoView(state) {
  return `
    <div class="wrap">
      <header class="page-head">
        <p class="kicker">Administración</p>
        <h1>Equipo</h1>
        <p class="lede">Creá las cuentas de quienes cargan la agenda. María Florencia queda como administración: puede cambiar ajustes y dar de alta usuarios.</p>
      </header>
      <div class="quick">
        ${ibtn('userPlus', 'Nueva cuenta', 'data-action="abrir-modal-usuario"', 'solid')}
      </div>
      <section class="card" style="overflow:auto">
        <table class="users">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${state.users.map((user) => `
              <tr>
                <td>${esc(user.nombre)}</td>
                <td>${esc(user.username)}</td>
                <td>${esc(state.roles.find((rol) => rol.id === user.rol)?.nombre || user.rol)}</td>
                <td>${user.activo ? 'Activa' : 'Pausada'}</td>
                <td class="iconacts">
                  ${ibtn('edit', 'Editar', `data-action="abrir-modal-usuario" data-id="${esc(user.id)}"`)}
                  ${user.id !== state.user.id ? ibtn('trash', 'Eliminar', `data-action="borrar-usuario" data-id="${esc(user.id)}"`, 'danger') : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </section>
    </div>`;
}

export function ajustesView(state) {
  const settings = state.settings;
  return `
    <div class="wrap">
      <header class="page-head">
        <p class="kicker">Administración</p>
        <h1>Ajustes</h1>
        <p class="lede">Estos datos salen en el encabezado y el pie de los PDF.</p>
      </header>
      <form class="card stack" data-action="guardar-ajustes" autocomplete="off">
        <label class="field">Nombre del estudio
          <input name="estudioNombre" required maxlength="120" value="${esc(settings.estudioNombre)}">
        </label>
        <label class="field">Titular
          <input name="titular" required maxlength="120" value="${esc(settings.titular)}">
        </label>
        <label class="field">Matrícula
          <input name="matricula" maxlength="60" value="${esc(settings.matricula || '')}" placeholder="Número, tomo y folio">
        </label>
        <label class="field">Colegio
          <input name="colegio" maxlength="120" value="${esc(settings.colegio || '')}" placeholder="Colegio de Abogados de …">
        </label>
        <label class="field">Teléfono del estudio
          <input name="telefono" maxlength="40" value="${esc(settings.telefono)}">
        </label>
        <label class="field">Email
          <input name="email" type="email" maxlength="160" value="${esc(settings.email || '')}">
        </label>
        <label class="field">CUIT
          <input name="cuit" maxlength="20" value="${esc(settings.cuit || '')}">
        </label>
        <label class="field">Dirección
          <input name="direccion" maxlength="200" value="${esc(settings.direccion)}" placeholder="Calle, número, piso, oficina">
        </label>
        <label class="field">Localidad
          <input name="localidad" maxlength="80" value="${esc(settings.localidad)}">
        </label>
        <label class="field">Pie de página
          <input name="pie" maxlength="240" value="${esc(settings.pie || '')}" placeholder="Texto extra al pie del PDF">
        </label>
        <div class="row-actions">
          <button class="btn btn-primary" type="submit">Guardar ajustes</button>
          ${ibtn('key', 'Cambiar mi clave', 'data-action="abrir-clave"')}
        </div>
      </form>
    </div>`;
}

export function confirmHtml({ title, text, confirm, danger }) {
  return `
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="iconbtn" data-action="confirmar-no" aria-label="Cerrar">${icon('close')}</button>
      </header>
      <div class="modal-body"><p>${esc(text)}</p></div>
      <footer class="modal-foot">
        <button type="button" class="btn btn-quiet" data-action="confirmar-no">Volver</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirmar-si">${esc(confirm)}</button>
      </footer>
    </div>`;
}

export function forbiddenView() {
  return `<div class="wrap"><div class="card"><h2>No tenés permiso para esta sección.</h2><p class="lede">Si necesitás una cuenta nueva, pedile a la administración.</p></div></div>`;
}

