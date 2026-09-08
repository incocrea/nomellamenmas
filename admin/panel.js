/* ==========================================================================
   NO ME LLAMEN MÁS · panel.js
   El panel privado. No contiene ninguna clave: manda correo y contraseña a la
   función «admin», que los verifica y devuelve una sesión. Esa sesión vive solo
   en memoria y en sessionStorage, así que se pierde al cerrar la pestaña.
   ========================================================================== */
(function () {
  'use strict';

  const API = 'https://aqwjeqqndtuhtsafhzxv.supabase.co/functions/v1/admin';
  const CLAVE_SESION = 'nmm-panel-sesion';
  const POR_PAGINA = 25;

  const $ = (id) => document.getElementById(id);
  const entrada = $('entrada');
  const panel = $('panel');

  let sesion = '';
  let correo = '';
  let pagina = 1;
  let ultimaBusqueda = [];   // lo último que devolvió el servidor, para exportar
  let total = 0;
  let temporizador = null;

  /* ---------- textos legibles ---------------------------------------------- */
  const ETIQUETAS = {
    canal: { llamada: 'llamadas', sms: 'SMS', whatsapp: 'WhatsApp' },
    frecuencia: { una_vez: 'una vez', varias: 'varias veces', casi_diario: 'casi a diario' },
    ultima_vez: { hoy: 'hoy', esta_semana: 'esta semana', este_mes: 'este mes', antes: 'hace más de un mes' },
    franja: { manana: 'mañana', tarde: 'tarde', noche: 'noche', fin_de_semana_o_festivo: 'fines de semana o festivos' },
    sector: {
      telecomunicaciones: 'telefonía, internet o TV', banca: 'bancos, tarjetas o créditos',
      seguros: 'seguros', cobranza: 'cobranza', educacion: 'educación o cursos',
      salud: 'salud o medicina prepagada', comercio: 'ventas y comercio', otro: 'otro',
      no_se_identifico: 'no se identificaron',
    },
    proposito: { ofrecer: 'ofrecer o vender', cobrar: 'cobrar', no_claro: 'no quedó claro' },
    autorizacion: { si: 'sí', no: 'no', no_se: 'no lo sabe', no_recuerdo: 'no lo recuerda' },
    era_cliente: { si: 'sí', no: 'no', no_se: 'no lo sabe' },
    pidio_cese: {
      en_llamada: 'en la llamada', por_escrito: 'por escrito',
      ante_sic_o_rne: 'ante la SIC o el RNE', no: 'no lo pidió',
    },
    continuaron: { si: 'sí', no: 'no', no_seguro: 'no está seguro', no_aplica: 'no aplica' },
  };
  const ESTADOS = {
    recibido: 'Recibido', en_revision: 'En revisión', documentado: 'Documentado',
    incluido: 'Incluido', archivado: 'Archivado',
  };

  const enPalabras = (grupo, valores) => (Array.isArray(valores) && valores.length)
    ? valores.map((v) => (ETIQUETAS[grupo] && ETIQUETAS[grupo][v]) || v).join(', ')
    : '—';

  /* ---------- llamadas al servidor ------------------------------------------ */
  async function pedir(cuerpo) {
    let r;
    try {
      r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ esquema: 1 }, cuerpo)),
        credentials: 'omit',
      });
    } catch (e) {
      throw { tipo: 'red' };
    }
    const texto = await r.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = null; }
    if (r.ok) { return datos || {}; }
    if (r.status === 401 && (datos || {}).error === 'sesion') { throw { tipo: 'sesion' }; }
    if (r.status === 401) { throw { tipo: 'credenciales' }; }
    if (r.status === 429) { throw { tipo: 'limite' }; }
    if (r.status === 503) { throw { tipo: 'mantenimiento' }; }
    throw { tipo: 'servidor' };
  }

  const conSesion = (cuerpo) => pedir(Object.assign({ sesion: sesion }, cuerpo));

  function mensaje(e) {
    switch (e && e.tipo) {
      case 'credenciales': return 'Correo o contraseña incorrectos.';
      case 'limite': return 'Demasiados intentos. Espera un rato antes de volver a probar.';
      case 'sesion': return 'Tu sesión caducó. Vuelve a entrar.';
      case 'mantenimiento': return 'El panel está en mantenimiento o sin configurar.';
      case 'red': return 'No pudimos conectar con el servidor.';
      default: return 'Algo falló en el servidor.';
    }
  }

  /* ---------- entrar y salir -------------------------------------------------- */
  function guardarSesion(t, c) {
    sesion = t; correo = c;
    try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify({ sesion: t, correo: c })); } catch (e) { /* nada */ }
  }

  function olvidarSesion() {
    sesion = ''; correo = '';
    try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) { /* nada */ }
    panel.hidden = true;
    entrada.hidden = false;
    $('e-clave').value = '';
  }

  function abrirPanel() {
    entrada.hidden = true;
    panel.hidden = false;
    $('quien').textContent = correo;
    cargarCifras();
    cargarCasos();
    cargarCorreos();
  }

  $('form-entrar').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = $('e-enviar');
    const error = $('e-error');
    error.hidden = true;
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    try {
      const r = await pedir({
        accion: 'entrar',
        correo: $('e-correo').value.trim().toLowerCase(),
        clave: $('e-clave').value,
      });
      guardarSesion(r.sesion, r.correo);
      $('e-clave').value = '';
      abrirPanel();
    } catch (e) {
      error.textContent = mensaje(e);
      error.hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  });

  $('salir').addEventListener('click', olvidarSesion);

  /* ---------- cifras ---------------------------------------------------------- */
  function tarjeta(nombre, valor, alerta) {
    const div = document.createElement('div');
    div.className = 'tarjeta' + (alerta ? ' tarjeta--alerta' : '');
    const dt = document.createElement('dt');
    dt.textContent = nombre;
    const dd = document.createElement('dd');
    dd.textContent = String(valor);
    div.append(dt, dd);
    return div;
  }

  function barras(contenedor, filas, campoNombre) {
    const max = filas.reduce((m, f) => Math.max(m, f.casos), 0) || 1;
    contenedor.replaceChildren();
    if (!filas.length) {
      const p = document.createElement('p');
      p.className = 'apunte';
      p.textContent = 'Todavía no hay datos.';
      contenedor.appendChild(p);
      return;
    }
    filas.slice(0, 8).forEach((f) => {
      const fila = document.createElement('div');
      fila.className = 'barra-fila';
      const nombre = document.createElement('span');
      nombre.className = 'barra-fila__nombre';
      const bruto = f[campoNombre];
      nombre.textContent = campoNombre === 'sector' ? enPalabras('sector', [bruto]) : bruto;
      nombre.title = nombre.textContent;
      const pista = document.createElement('span');
      pista.className = 'barra-fila__pista';
      const valor = document.createElement('span');
      valor.className = 'barra-fila__valor';
      valor.style.width = Math.round((f.casos / max) * 100) + '%';
      valor.style.display = 'block';
      valor.style.height = '100%';
      pista.appendChild(valor);
      const n = document.createElement('span');
      n.className = 'barra-fila__n';
      n.textContent = String(f.casos);
      fila.append(nombre, pista, n);
      contenedor.appendChild(fila);
    });
  }

  async function cargarCifras() {
    try {
      const c = await conSesion({ accion: 'estadisticas' });
      const caja = $('cifras');
      caja.replaceChildren(
        tarjeta('Casos', c.casos),
        tarjeta('Personas', c.personas),
        tarjeta('Hoy', c.hoy),
        tarjeta('Últimos 7 días', c.semana),
        tarjeta('Siguieron tras pedirlo', c.siguieron_tras_pedirlo),
        tarjeta('Sin autorización', c.sin_autorizacion),
        tarjeta('Suprimidos', c.suprimidos),
        tarjeta('Sospechosos', c.sospechosos, c.sospechosos > 0),
      );
      barras($('por-sector'), c.por_sector || [], 'sector');
      barras($('por-departamento'), c.por_departamento || [], 'departamento');
    } catch (e) {
      if (e && e.tipo === 'sesion') { olvidarSesion(); return; }
      $('p-error').textContent = mensaje(e);
      $('p-error').hidden = false;
    }
  }

  /* ---------- listado ---------------------------------------------------------- */
  function celda(texto, menudo) {
    const td = document.createElement('td');
    td.textContent = texto;
    if (menudo) {
      const s = document.createElement('span');
      s.className = 'menudo';
      s.textContent = menudo;
      td.appendChild(s);
    }
    return td;
  }

  function pintarFilas(casos) {
    const cuerpo = $('filas');
    cuerpo.replaceChildren();
    casos.forEach((c) => {
      const tr = document.createElement('tr');

      const tdCodigo = document.createElement('td');
      tdCodigo.className = 'codigo-celda';
      tdCodigo.textContent = c.codigo;
      if (c.riesgo >= 30) {
        const p = document.createElement('span');
        p.className = 'pastilla pastilla--riesgo';
        p.textContent = 'riesgo ' + c.riesgo;
        tdCodigo.appendChild(p);
      }
      tr.appendChild(tdCodigo);

      const tdFecha = document.createElement('td');
      tdFecha.className = 'num';
      tdFecha.textContent = c.creado_en;
      tr.appendChild(tdFecha);

      tr.appendChild(celda([c.ciudad, c.departamento].filter(Boolean).join(', ') || '—'));
      tr.appendChild(celda(c.empresa || '—', enPalabras('sector', c.sector)));
      tr.appendChild(celda(c.nombre || '(sin nombre)', c.correo || ''));

      const tdEstado = document.createElement('td');
      const past = document.createElement('span');
      past.className = 'pastilla pastilla--' + c.estado;
      past.textContent = ESTADOS[c.estado] || c.estado;
      tdEstado.appendChild(past);
      tr.appendChild(tdEstado);

      const tdVer = document.createElement('td');
      const ver = document.createElement('button');
      ver.type = 'button';
      ver.className = 'boton boton--fantasma';
      ver.textContent = 'Ver';
      ver.addEventListener('click', () => abrirDetalle(c));
      tdVer.appendChild(ver);
      tr.appendChild(tdVer);

      cuerpo.appendChild(tr);
    });
  }

  function filtros() {
    return {
      buscar: $('f-buscar').value.trim(),
      sector: $('f-sector').value,
      estado: $('f-estado').value,
      riesgo_minimo: Number($('f-riesgo').value),
    };
  }

  async function cargarCasos() {
    $('cargando').hidden = false;
    $('p-error').hidden = true;
    try {
      const r = await conSesion(Object.assign({ accion: 'casos', pagina: pagina, por_pagina: POR_PAGINA }, filtros()));
      ultimaBusqueda = r.casos || [];
      total = r.total || 0;
      pintarFilas(ultimaBusqueda);
      $('conteo').textContent = total ? '· ' + total : '';
      $('vacio').hidden = ultimaBusqueda.length > 0;
      const paginas = Math.max(Math.ceil(total / POR_PAGINA), 1);
      $('paginacion').hidden = paginas <= 1;
      $('pagina-info').textContent = 'Página ' + pagina + ' de ' + paginas;
      $('anterior').disabled = pagina <= 1;
      $('siguiente').disabled = pagina >= paginas;
      $('exportar').disabled = ultimaBusqueda.length === 0;
    } catch (e) {
      if (e && e.tipo === 'sesion') { olvidarSesion(); return; }
      $('p-error').textContent = mensaje(e);
      $('p-error').hidden = false;
    } finally {
      $('cargando').hidden = true;
    }
  }

  function recargarConRetraso() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { pagina = 1; cargarCasos(); }, 300);
  }

  $('f-buscar').addEventListener('input', recargarConRetraso);
  ['f-sector', 'f-estado', 'f-riesgo'].forEach((id) => {
    $(id).addEventListener('change', () => { pagina = 1; cargarCasos(); });
  });
  $('anterior').addEventListener('click', () => { if (pagina > 1) { pagina--; cargarCasos(); } });
  $('siguiente').addEventListener('click', () => { pagina++; cargarCasos(); });

  /* ---------- detalle ------------------------------------------------------------ */
  const detalle = $('detalle');
  let casoAbierto = null;

  function filaFicha(dl, termino, valor) {
    const dt = document.createElement('dt');
    dt.textContent = termino;
    const dd = document.createElement('dd');
    dd.textContent = valor || '—';
    dl.append(dt, dd);
  }

  async function abrirDetalle(c) {
    casoAbierto = c;
    $('d-titulo').textContent = 'Caso ' + c.codigo;
    $('d-sub').textContent = 'Recibido el ' + c.creado_en + ' · riesgo ' + c.riesgo +
      (c.duracion_s ? ' · lo llenó en ' + c.duracion_s + ' s' : '');
    $('d-exito').hidden = true;

    const dl = $('d-ficha');
    dl.replaceChildren();
    filaFicha(dl, 'Estado', ESTADOS[c.estado] || c.estado);
    filaFicha(dl, 'Dónde', [c.ciudad, c.departamento].filter(Boolean).join(', '));
    filaFicha(dl, 'Cómo la contactan', enPalabras('canal', c.canal));
    filaFicha(dl, 'Frecuencia', enPalabras('frecuencia', c.frecuencia));
    filaFicha(dl, 'Última vez', enPalabras('ultima_vez', c.ultima_vez));
    filaFicha(dl, 'Horarios', enPalabras('franja', c.franja));
    filaFicha(dl, 'Empresa', c.empresa);
    filaFicha(dl, 'Sector', enPalabras('sector', c.sector));
    filaFicha(dl, 'Qué querían', enPalabras('proposito', c.proposito));
    filaFicha(dl, '¿Había autorizado?', enPalabras('autorizacion', c.autorizacion));
    filaFicha(dl, '¿Era cliente?', enPalabras('era_cliente', c.era_cliente));
    filaFicha(dl, '¿Pidió que pararan?', enPalabras('pidio_cese', c.pidio_cese));
    filaFicha(dl, '¿Continuaron?', enPalabras('continuaron', c.continuaron));
    filaFicha(dl, 'Lo que contó', c.relato);
    filaFicha(dl, 'Nombre', c.nombre);
    filaFicha(dl, 'Correo', c.correo);
    filaFicha(dl, 'Teléfono', c.telefono);
    filaFicha(dl, 'Quiere novedades', c.novedades ? 'sí' : 'no');
    filaFicha(dl, 'Autorizaciones', String(c.consentimientos));

    const acciones = $('d-estados');
    acciones.replaceChildren();
    Object.keys(ESTADOS).forEach((clave) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton boton--fantasma';
      b.textContent = ESTADOS[clave];
      b.disabled = clave === c.estado;
      b.addEventListener('click', () => cambiarEstado(c.codigo, clave));
      acciones.appendChild(b);
    });

    $('d-historial').replaceChildren();
    detalle.showModal();
    $('d-titulo').focus({ preventScroll: true });

    try {
      const h = await conSesion({ accion: 'historial', codigo: c.codigo });
      const ol = $('d-historial');
      ol.replaceChildren();
      (h.eventos || []).forEach((e) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = e.tipo;
        const s = document.createElement('span');
        s.textContent = ' · ' + e.cuando + ' · ' + e.actor +
          (e.detalle && Object.keys(e.detalle).length ? ' · ' + JSON.stringify(e.detalle) : '');
        li.append(b, s);
        ol.appendChild(li);
      });
      if (!(h.eventos || []).length) {
        const li = document.createElement('li');
        li.textContent = 'Sin eventos.';
        ol.appendChild(li);
      }
    } catch (e) {
      if (e && e.tipo === 'sesion') { detalle.close(); olvidarSesion(); }
    }
  }

  async function cambiarEstado(codigo, estado) {
    try {
      const r = await conSesion({ accion: 'cambiar_estado', codigo: codigo, estado: estado });
      if (r && r.ok) {
        $('d-exito').textContent = 'Estado cambiado a ' + (ESTADOS[estado] || estado) + '.';
        $('d-exito').hidden = false;
        if (casoAbierto) { casoAbierto.estado = estado; }
        cargarCasos();
        cargarCifras();
        const acciones = $('d-estados');
        Array.from(acciones.children).forEach((b) => {
          b.disabled = b.textContent === (ESTADOS[estado] || estado);
        });
      }
    } catch (e) {
      if (e && e.tipo === 'sesion') { detalle.close(); olvidarSesion(); }
    }
  }

  $('d-cerrar').addEventListener('click', () => detalle.close());

  /* ---------- correos que no salieron ----------------------------------------------
     El cupo diario de Resend es de 100 correos. Cuando se agota, el caso se
     guarda igual y aquí quedan los que hay que reintentar cuando se reponga. */
  const MOTIVOS = {
    limite: 'Cupo de envíos agotado',
    error: 'Error al enviar',
    sin_configurar: 'Envío sin configurar',
    pendiente: 'Todavía sin intentar',
  };
  let correosPendientes = [];

  function seleccionados() {
    return Array.from(document.querySelectorAll('#correos-filas input:checked')).map((i) => i.value);
  }

  function refrescarBotonReenviar() {
    const n = seleccionados().length;
    $('correos-reenviar').disabled = n === 0;
    $('correos-reenviar').textContent = n ? 'Reintentar (' + n + ')' : 'Reintentar';
  }

  function pintarCorreos(datos) {
    correosPendientes = datos.pendientes || [];
    const seccion = $('seccion-correos');
    seccion.hidden = correosPendientes.length === 0;
    if (!correosPendientes.length) { return; }

    $('correos-conteo').textContent = '· ' + correosPendientes.length;
    const partes = [];
    if (datos.por_limite) { partes.push(datos.por_limite + ' por cupo agotado'); }
    if (datos.por_error) { partes.push(datos.por_error + ' por error'); }
    if (datos.sin_intentar) { partes.push(datos.sin_intentar + ' sin intentar'); }
    $('correos-nota').textContent = partes.join(' · ') +
      '. El reintento manda el mismo correo con los datos actuales del caso.';

    const cuerpo = $('correos-filas');
    cuerpo.replaceChildren();
    correosPendientes.forEach((c) => {
      const tr = document.createElement('tr');

      const tdSel = document.createElement('td');
      const caja = document.createElement('input');
      caja.type = 'checkbox';
      caja.value = c.codigo;
      caja.setAttribute('aria-label', 'Seleccionar ' + c.codigo);
      caja.addEventListener('change', refrescarBotonReenviar);
      tdSel.appendChild(caja);
      tr.appendChild(tdSel);

      const tdCod = document.createElement('td');
      tdCod.className = 'codigo-celda';
      tdCod.textContent = c.codigo;
      tr.appendChild(tdCod);

      const tdFecha = document.createElement('td');
      tdFecha.className = 'num';
      tdFecha.textContent = c.creado_en;
      tr.appendChild(tdFecha);

      tr.appendChild(celda(c.nombre || '(sin nombre)', c.correo || ''));

      const tdMotivo = document.createElement('td');
      const past = document.createElement('span');
      past.className = 'pastilla pastilla--' + (c.estado === 'limite' ? 'en_revision' : 'archivado');
      past.textContent = MOTIVOS[c.estado] || c.estado;
      tdMotivo.appendChild(past);
      if (c.detalle) {
        const d = document.createElement('span');
        d.className = 'motivo';
        d.textContent = c.detalle;
        tdMotivo.appendChild(d);
      }
      tr.appendChild(tdMotivo);

      const tdInt = document.createElement('td');
      tdInt.className = 'num';
      tdInt.textContent = String(c.intentos) + (c.ultimo ? ' · ' + c.ultimo : '');
      tr.appendChild(tdInt);

      cuerpo.appendChild(tr);
    });
    refrescarBotonReenviar();
  }

  async function cargarCorreos() {
    try {
      pintarCorreos(await conSesion({ accion: 'correos' }));
    } catch (e) {
      if (e && e.tipo === 'sesion') { olvidarSesion(); return; }
      $('correos-error').textContent = mensaje(e);
      $('correos-error').hidden = false;
    }
  }

  $('correos-todos').addEventListener('click', () => {
    const cajas = Array.from(document.querySelectorAll('#correos-filas input[type=checkbox]'));
    const marcar = cajas.some((c) => !c.checked);
    cajas.forEach((c) => { c.checked = marcar; });
    refrescarBotonReenviar();
  });

  $('correos-reenviar').addEventListener('click', async () => {
    const codigos = seleccionados();
    if (!codigos.length) { return; }
    const boton = $('correos-reenviar');
    boton.disabled = true;
    boton.textContent = 'Reintentando…';
    $('correos-error').hidden = true;
    $('correos-exito').hidden = true;
    try {
      const r = await conSesion({ accion: 'reenviar', codigos: codigos });
      const enviados = r.enviados || 0;
      let texto = enviados + ' de ' + codigos.length + ' enviados.';
      if (r.detenido_por_limite) {
        texto += ' Nos detuvimos porque el cupo de envíos volvió a agotarse; vuelve a intentarlo mañana.';
      }
      $('correos-exito').textContent = texto;
      $('correos-exito').hidden = false;
      await cargarCorreos();
      cargarCifras();
    } catch (e) {
      if (e && e.tipo === 'sesion') { olvidarSesion(); return; }
      $('correos-error').textContent = mensaje(e);
      $('correos-error').hidden = false;
    } finally {
      boton.disabled = false;
      refrescarBotonReenviar();
    }
  });

  /* ---------- exportar ------------------------------------------------------------ */
  function aCsv(filas) {
    const columnas = ['codigo', 'creado_en', 'estado', 'ciudad', 'departamento', 'canal',
      'frecuencia', 'ultima_vez', 'franja', 'empresa', 'sector', 'proposito', 'autorizacion',
      'era_cliente', 'pidio_cese', 'continuaron', 'relato', 'nombre', 'correo', 'telefono',
      'novedades', 'riesgo', 'origen'];
    const escapar = (v) => {
      const s = Array.isArray(v) ? v.join(' + ') : (v === null || v === undefined ? '' : String(v));
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return '﻿' + [columnas.join(';')]
      .concat(filas.map((f) => columnas.map((c) => escapar(f[c])).join(';')))
      .join('\r\n');
  }

  $('exportar').addEventListener('click', () => {
    if (!ultimaBusqueda.length) { return; }
    if (!window.confirm('Vas a descargar ' + ultimaBusqueda.length + ' casos con datos personales de ciudadanos. ¿Seguro?')) { return; }
    const blob = new Blob([aCsv(ultimaBusqueda)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nmllm-casos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });

  /* ---------- arranque -------------------------------------------------------------- */
  try {
    const guardada = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || 'null');
    if (guardada && guardada.sesion) {
      sesion = guardada.sesion;
      correo = guardada.correo || '';
      abrirPanel();
    }
  } catch (e) { /* sin sesión guardada */ }
})();
