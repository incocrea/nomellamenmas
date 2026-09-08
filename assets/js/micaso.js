/* ==========================================================================
   NO ME LLAMEN MÁS · micaso.js
   El modal «Mi caso»: la persona entra con su código y su correo, ve el
   resumen de lo que registró, corrige sus datos de contacto o elimina todo.
   Habla con la función «mi-caso»; nunca toca la base directamente.
   ========================================================================== */
(function () {
  'use strict';

  const NMM = window.NMM = window.NMM || {};
  const dialogo = document.getElementById('modal-mi-caso');
  if (!dialogo) { return; }

  const $ = (id) => document.getElementById(id);
  const panelEntrar = $('mc-entrar');
  const panelResumen = $('mc-resumen');
  const panelBorrado = $('mc-borrado');
  const confirmar = $('mc-confirmar-borrar');
  const botonAccion = $('mc-accion');
  const pie = $('mc-pie');
  const error = $('mc-error');
  const exito = $('mc-exito');
  const vivo = $('mc-vivo');
  const subtitulo = $('mc-subtitulo');

  const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const CODIGO_RE = /^NMM-[A-Z2-9]{6}$/;

  let caso = null;       // lo último que devolvió el servidor
  let ocupado = false;
  let token = '';        // enlace firmado del correo, si vino por ahí

  /* ---------- textos legibles ---------------------------------------------
     Las etiquetas de cada respuesta viven en el formulario de registro, que
     está en esta misma página. Leerlas de ahí evita mantener dos listas. */
  function etiqueta(grupo, valor) {
    const input = document.querySelector('#formulario-caso input[name="' + grupo + '"][value="' + valor + '"]');
    if (!input) { return valor; }
    const textos = input.closest('.opcion');
    return textos ? textos.querySelector('span:last-child').textContent.trim() : valor;
  }

  function listaLegible(grupo, valores) {
    if (!Array.isArray(valores) || !valores.length) { return '—'; }
    return valores.map((v) => etiqueta(grupo, v)).join(' · ');
  }

  function fechaLegible(iso) {
    if (!iso) { return '—'; }
    const [f, h] = String(iso).split('T');
    const [a, m, d] = f.split('-');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${Number(d)} de ${meses[Number(m) - 1]} de ${a}, ${h}`;
  }

  const ESTADOS = {
    recibido: 'Recibido',
    en_revision: 'En revisión',
    documentado: 'Documentado',
    incluido: 'Incluido en el análisis',
    archivado: 'Archivado'
  };

  function fila(dl, termino, valor) {
    const dt = document.createElement('dt');
    dt.textContent = termino;
    const dd = document.createElement('dd');
    dd.textContent = valor;      // nunca innerHTML: el texto viene del servidor
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function pintarResumen(d) {
    const c = d.caso;
    const dl = $('mc-datos');
    dl.replaceChildren();
    fila(dl, 'Código', c.codigo);
    fila(dl, 'Registrado el', fechaLegible(c.creado_en));
    fila(dl, 'Estado', ESTADOS[c.estado] || c.estado);
    fila(dl, 'Cómo te contactan', listaLegible('canal', c.canal));
    fila(dl, 'Con qué frecuencia', listaLegible('frecuencia', c.frecuencia));
    fila(dl, 'Última vez', listaLegible('ultima_vez', c.ultima_vez));
    fila(dl, 'Horarios', listaLegible('franja', c.franja));
    fila(dl, 'Tipo de empresa', listaLegible('sector', c.sector));
    if (c.empresa) { fila(dl, 'Empresa', c.empresa); }
    fila(dl, 'Qué querían', listaLegible('proposito', c.proposito));
    fila(dl, '¿Habías autorizado?', listaLegible('autorizacion', c.autorizacion));
    fila(dl, '¿Eras cliente?', listaLegible('era_cliente', c.era_cliente));
    fila(dl, '¿Pediste que pararan?', listaLegible('pidio_cese', c.pidio_cese));
    fila(dl, '¿Continuaron?', listaLegible('continuaron', c.continuaron));
    const cons = (d.consentimientos || []).length;
    fila(dl, 'Autorizaciones guardadas', cons + (cons === 1 ? ' registro' : ' registros'));

    $('mc-nombre').value = d.contacto.nombre || '';
    $('mc-telefono').value = d.contacto.telefono || '';
    $('mc-ubicacion').value = [c.ciudad, c.departamento].filter(Boolean).join(', ');
    $('mc-relato').value = c.relato || '';
    $('mc-novedades').checked = Boolean(d.contacto.novedades);
    actualizarContador();
  }

  function actualizarContador() {
    const t = $('mc-relato');
    const c = $('mc-contador');
    if (t && c) { c.textContent = t.value.length + '/500'; }
  }

  /* ---------- estados del modal -------------------------------------------- */
  function mostrar(vista) {
    panelEntrar.hidden = vista !== 'entrar';
    panelResumen.hidden = vista !== 'resumen';
    panelBorrado.hidden = vista !== 'borrado';
    confirmar.hidden = true;
    // Con enlace válido no hay nada que escribir, ni botón de consultar
    pie.hidden = vista === 'borrado' || (vista === 'entrar' && Boolean(token));
    panelEntrar.hidden = panelEntrar.hidden || Boolean(token);
    error.hidden = true;
    exito.hidden = true;

    if (vista === 'entrar') {
      botonAccion.textContent = 'Consultar mi caso';
      subtitulo.textContent = 'Consúltalo, actualízalo o elimínalo';
    } else if (vista === 'resumen') {
      botonAccion.textContent = 'Guardar cambios';
      subtitulo.textContent = caso ? 'Caso ' + caso.caso.codigo : '';
    }
    // Cambiar de vista manda sobre el rótulo que ocupar() tenía guardado
    delete botonAccion.dataset.previo;
    dialogo.dataset.confirmarCierre = vista === 'resumen' ? '1' : '0';
    dialogo.querySelector('.modal__cuerpo').scrollTop = 0;
  }

  function limpiarErrores() {
    dialogo.querySelectorAll('.tiene-error').forEach((c) => c.classList.remove('tiene-error'));
    error.hidden = true;
  }

  function marcar(campo, mensaje) {
    const c = dialogo.querySelector('[data-campo="' + campo + '"]');
    if (!c) { return; }
    c.classList.add('tiene-error');
    const e = c.querySelector('.error');
    if (e) { e.textContent = mensaje; }
  }

  function fallar(mensaje) {
    error.textContent = mensaje;
    error.hidden = false;
    vivo.textContent = mensaje;
  }

  function ocupar(si, etiquetaBoton) {
    ocupado = si;
    botonAccion.disabled = si;
    if (si) {
      botonAccion.dataset.previo = botonAccion.textContent;
      botonAccion.textContent = etiquetaBoton || 'Un momento…';
    } else if (botonAccion.dataset.previo) {
      botonAccion.textContent = botonAccion.dataset.previo;
    }
  }

  function mensajeError(e) {
    switch (e && e.tipo) {
      case 'no_encontrado': return 'No encontramos ningún caso con ese código y ese correo. Revisa que estén tal cual te los dimos.';
      case 'limite': return 'Demasiados intentos seguidos. Espera un rato y vuelve a intentarlo.';
      case 'mantenimiento': return 'Estamos en mantenimiento. Vuelve en unos minutos.';
      case 'validacion': return 'Revisa los datos marcados.';
      default: return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    }
  }

  /* ---------- acciones ------------------------------------------------------ */
  /* Con el enlace del correo basta el token: la función ya verificó la firma.
     Si no, hacen falta el código y el correo. */
  function credenciales() {
    if (token) { return { token: token }; }
    return {
      codigo: $('mc-codigo').value.trim().toUpperCase(),
      correo: $('mc-correo').value.trim().toLowerCase()
    };
  }

  function consultar(automatica) {
    limpiarErrores();
    if (!token) {
      const cr = credenciales();
      let mal = false;
      if (!CODIGO_RE.test(cr.codigo)) { marcar('mc-codigo', 'El código tiene la forma NMM-XXXXXX, como te lo dimos.'); mal = true; }
      if (!CORREO_RE.test(cr.correo)) { marcar('mc-correo', 'Revisa el formato del correo.'); mal = true; }
      if (mal) { return; }
    }

    ocupar(true, 'Consultando…');
    if (automatica) { $('mc-cargando').hidden = false; }
    NMM.api.miCaso('consultar', credenciales()).then((d) => {
      caso = d;
      pintarResumen(d);
      mostrar('resumen');
      vivo.textContent = 'Encontramos tu caso ' + d.caso.codigo;
    }).catch((e) => {
      if (e && e.tipo === 'enlace_invalido') {
        token = '';            // el enlace ya no sirve: que entre a mano
        mostrar('entrar');
        fallar('Ese enlace caducó o no es válido. Entra con tu código y tu correo, aquí abajo.');
        return;
      }
      if (automatica) { token = ''; mostrar('entrar'); }
      fallar(mensajeError(e));
    }).then(() => {
      ocupar(false);
      $('mc-cargando').hidden = true;
    });
  }

  function guardar() {
    limpiarErrores();
    const ubicacion = $('mc-ubicacion').value.trim();
    const i = ubicacion.lastIndexOf(',');
    const telefono = $('mc-telefono').value.trim();
    // Los tres son obligatorios al registrar, así que tampoco pueden vaciarse aquí
    if (!$('mc-nombre').value.trim()) {
      marcar('mc-nombre', 'Escribe tu nombre o el seudónimo que prefieras usar.');
      return;
    }
    if (!telefono) {
      marcar('mc-telefono', 'Necesitamos el número al que te llaman.');
      return;
    }
    if (!NMM.wizard.normalizarTelefono(telefono)) {
      marcar('mc-telefono', 'Revisa el número: 10 dígitos que empiezan por 3 o por 60.');
      return;
    }
    if (!ubicacion) {
      marcar('mc-ubicacion', 'Dinos desde qué ciudad nos escribes.');
      return;
    }
    const cambios = {
      nombre: $('mc-nombre').value.trim(),
      telefono: telefono ? NMM.wizard.normalizarTelefono(telefono) : '',
      ciudad: i < 0 ? ubicacion : ubicacion.slice(0, i).trim(),
      departamento: i < 0 ? '' : ubicacion.slice(i + 1).trim(),
      relato: $('mc-relato').value.trim(),
      novedades: $('mc-novedades').checked
    };

    ocupar(true, 'Guardando…');
    NMM.api.miCaso('actualizar', Object.assign({}, credenciales(), { cambios })).then(() => {
      exito.textContent = 'Listo, guardamos tus cambios.';
      exito.hidden = false;
      vivo.textContent = 'Cambios guardados';
      dialogo.dataset.confirmarCierre = '0';
    }).catch((e) => {
      if (e && e.tipo === 'validacion' && e.campos) {
        Object.keys(e.campos).forEach((k) => marcar('mc-' + k, e.campos[k]));
      }
      fallar(mensajeError(e));
    }).then(() => ocupar(false));
  }

  function eliminar() {
    limpiarErrores();
    ocupar(true, 'Eliminando…');
    $('mc-borrar').disabled = true;
    NMM.api.miCaso('eliminar', credenciales()).then(() => {
      caso = null;
      mostrar('borrado');
      $('mc-borrado-titulo').focus({ preventScroll: true });
      vivo.textContent = 'Tu caso fue eliminado';
    }).catch((e) => {
      fallar(mensajeError(e));
    }).then(() => {
      ocupar(false);
      $('mc-borrar').disabled = false;
    });
  }

  /* ---------- eventos -------------------------------------------------------- */
  function alAbrir() {
    caso = null;
    token = NMM.tokenInicial || '';
    $('mc-codigo').value = NMM.casoInicial || '';
    $('mc-correo').value = '';
    limpiarErrores();
    mostrar('entrar');

    if (token) {
      // Vino del enlace del correo: se abre solo, sin escribir nada
      consultar(true);
      return;
    }
    if (NMM.casoInicial) {
      setTimeout(() => $('mc-correo').focus({ preventScroll: true }), 150);
    }
  }

  dialogo.addEventListener('nmm:abierto', alAbrir);

  botonAccion.addEventListener('click', () => {
    if (ocupado) { return; }
    if (panelEntrar.hidden) { guardar(); } else { consultar(); }
  });

  dialogo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      botonAccion.click();
    }
  });

  $('mc-pedir-borrar').addEventListener('click', () => {
    confirmar.hidden = false;
    confirmar.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
  $('mc-cancelar-borrar').addEventListener('click', () => { confirmar.hidden = true; });
  $('mc-borrar').addEventListener('click', eliminar);
  $('mc-relato').addEventListener('input', actualizarContador);

  // El código siempre en mayúsculas, como se entrega
  $('mc-codigo').addEventListener('input', (e) => {
    const p = e.target.selectionStart;
    e.target.value = e.target.value.toUpperCase();
    e.target.setSelectionRange(p, p);
  });

  // Este módulo se descarga al vuelo: si el modal ya está abierto cuando
  // termina de cargar, hay que ponerlo en su estado inicial aquí mismo.
  if (dialogo.open) { alAbrir(); }
})();
