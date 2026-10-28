import { archivoSrc, esc, formatFecha, hoyAR, icon, isPreviewable, nombreEstado, texto } from './util.js';

export function abrirImpresion(inner) {
  const root = document.getElementById('print-root');
  root.hidden = false;
  root.innerHTML = `
    <div class="print-bar">
      <button type="button" class="ibtn solid" data-action="lanzar-impresion" aria-label="Imprimir o guardar PDF" title="Imprimir o guardar PDF">${icon('printer')}</button>
      <button type="button" class="ibtn" data-action="cerrar-impresion" aria-label="Cerrar" title="Cerrar">${icon('close')}</button>
    </div>
    <article class="print-sheet">${inner}</article>`;
  root.scrollTop = 0;
}

export function cerrarImpresion() {
  const root = document.getElementById('print-root');
  if (!root) return;
  root.hidden = true;
  root.innerHTML = '';
}

export function htmlLegajo(settings, data) {
  return hoja(settings, cuerpoLegajo(data.client, data.areas || []));
}

export function htmlArchivo(settings, client, areaNombre, item) {
  const figura = item.tieneArchivo && isPreviewable(item.archivoMime)
    ? `<figure class="print-fig"><img src="${archivoSrc(item)}" alt="${esc(item.titulo)}"><figcaption>${esc(item.titulo)}</figcaption></figure>`
    : `<p>${esc(item.titulo)}</p><p>${esc(item.archivoNombre || 'Archivo')}</p>`;
  return hoja(settings, `
    <p class="print-kicker">${esc(areaNombre || 'Documento')}</p>
    <h1>${esc(client?.nombre || '')}</h1>
    <p>${esc(datosCliente(client))}</p>
    ${figura}
  `);
}

function hoja(settings, body) {
  return `
    <table class="print-table">
      <thead><tr><td>${membrete(settings || {})}</td></tr></thead>
      <tfoot><tr><td>${pie(settings || {})}</td></tr></tfoot>
      <tbody><tr><td>${body}</td></tr></tbody>
    </table>`;
}

function membrete(settings) {
  const idLine = [settings.matricula && `Mat. ${settings.matricula}`, settings.colegio].filter(Boolean).join(' · ');
  const place = [settings.direccion, settings.localidad].filter(Boolean).join(' · ');
  const contact = [settings.telefono, settings.email, settings.cuit && `CUIT ${settings.cuit}`].filter(Boolean).join(' · ');
  return `
    <header class="print-head">
      <strong>${esc(settings.estudioNombre || 'Estudio Jurídico Reverter')}</strong>
      ${settings.titular ? `<span>${esc(settings.titular)}</span>` : ''}
      ${idLine ? `<span>${esc(idLine)}</span>` : ''}
      ${place ? `<span>${esc(place)}</span>` : ''}
      ${contact ? `<span>${esc(contact)}</span>` : ''}
    </header>`;
}

function pie(settings) {
  const bits = [settings.estudioNombre, settings.direccion, settings.localidad, settings.telefono, settings.email].filter(Boolean);
  return `
    <footer class="print-foot">
      <span>${esc(bits.join(' · ') || 'Estudio Jurídico Reverter')}</span>
      ${settings.pie ? `<span>${esc(settings.pie)}</span>` : ''}
      <span>Uso interno · ${esc(formatFecha(hoyAR()))}</span>
    </footer>`;
}

function datosCliente(client) {
  if (!client) return '';
  return [client.dni && `DNI ${client.dni}`, client.telefono, client.email, client.domicilio].filter(Boolean).join(' · ');
}

function cuerpoLegajo(client, areas) {
  const bloques = (areas || []).map((area) => `
    <section class="print-area">
      <h2>${esc(area.nombre)}</h2>
      ${(area.carpetas || []).map((carpeta) => carpetaHtml(area, carpeta)).join('') || '<p>Sin piezas.</p>'}
    </section>`).join('');
  return `
    <p class="print-kicker">Legajo</p>
    <h1>${esc(client?.nombre || '')}</h1>
    <p>${esc(datosCliente(client))}</p>
    ${client?.notas ? `<p>${texto(client.notas)}</p>` : ''}
    ${bloques || '<p>Sin áreas.</p>'}
  `;
}

function carpetaHtml(area, carpeta) {
  const titulo = carpeta.titulo && carpeta.titulo !== 'General' ? `<h3>${esc(carpeta.titulo)}</h3>` : '';
  const nota = carpeta.notas ? `<p>${esc(carpeta.notas)}</p>` : '';
  const buckets = (area.buckets || []).map((bucket) => bucketPrint(bucket, carpeta.items?.[bucket.id] || [])).join('');
  return `${titulo}${nota}${buckets}`;
}

function bucketPrint(bucket, items) {
  if (!items.length) return '';
  if (bucket.tipo === 'archivo') {
    const fotos = items.filter((item) => item.tieneArchivo && isPreviewable(item.archivoMime));
    const otros = items.filter((item) => !fotos.includes(item));
    return `
      <h3>${esc(bucket.nombre)}</h3>
      ${otros.length ? `<table class="print-grid"><tbody>${otros.map((item) => `<tr><td>${esc(item.titulo)}</td><td>${esc(item.archivoNombre || '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${fotos.map((item) => `<figure class="print-fig"><img src="${archivoSrc(item)}" alt=""><figcaption>${esc(item.titulo)}</figcaption></figure>`).join('')}
    `;
  }
  if (bucket.tipo === 'faltante') {
    return `<h3>${esc(bucket.nombre)}</h3><ul>${items.map((item) => `<li>${esc(item.titulo)}</li>`).join('')}</ul>`;
  }
  return `
    <h3>${esc(bucket.nombre)}</h3>
    <table class="print-grid">
      <thead><tr><th>Detalle</th><th>Estado</th><th>Fecha</th></tr></thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${esc(item.titulo)}${item.cuerpo ? `<br>${texto(item.cuerpo)}` : ''}</td>
            <td>${esc(nombreEstado(bucket.estados, item.estado))}</td>
            <td>${item.fecha ? esc(formatFecha(item.fecha)) : ''}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
