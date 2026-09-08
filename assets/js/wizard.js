/* ==========================================================================
   NO ME LLAMEN MÁS · wizard.js
   El formulario por pasos dentro de #modal-registro: cuatro preguntas de
   selección y un paso final de contacto (con texto libre opcional). Validación
   por paso, borrador en sessionStorage (solo los pasos 1 a 4, nunca los datos
   de contacto), progreso, historial y envío por api.js.
   ========================================================================== */
(function () {
  'use strict';

  const NMM = window.NMM = window.NMM || {};
  const dialogo = document.getElementById('modal-registro');
  if (!dialogo) { return; }

  const form = document.getElementById('formulario-caso');
  const cuerpo = document.getElementById('wizard-cuerpo');
  const titulo = document.getElementById('titulo-registro');
  const meta = document.getElementById('wizard-meta');
  const progreso = document.getElementById('wizard-progreso');
  const vivo = document.getElementById('wizard-vivo');
  const pie = document.getElementById('wizard-pie');
  const btnAtras = document.getElementById('wizard-atras');
  const btnSiguiente = document.getElementById('wizard-siguiente');
  const errorGeneral = document.getElementById('wizard-error');

  const pasos = new Map();
  form.querySelectorAll('.paso').forEach((p) => pasos.set(p.dataset.paso, p));

  const TITULOS = {
    intro: 'Registra tu caso',
    1: '¿Qué ocurrió?',
    2: '¿Quién te llamó?',
    3: '¿Habías autorizado el contacto?',
    4: '¿Pediste que dejaran de llamarte?',
    5: 'Tus datos y tu autorización',
    fin: 'Caso registrado'
  };
  const ULTIMO_PASO_CON_BORRADOR = 4;
  const PASO_FINAL = '5';
  const CLAVE_BORRADOR = 'nmm-borrador-v3';
  const CAMPOS_BORRADOR = ['canal', 'frecuencia', 'ultima_vez', 'franja', 'sector', 'empresa', 'proposito',
    'autorizacion', 'era_cliente', 'pidio_cese', 'continuaron'];
  const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const MSJ_TURNSTILE_CAIDO = 'No pudimos cargar la verificación de seguridad. Puede que una extensión del navegador la esté bloqueando: desactívala para este sitio o prueba con otro navegador.';
  const reduceMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let actual = 'intro';
  let inicio = 0;        // momento en que la persona llegó al paso 1
  let enviado = false;
  let enviando = false;
  let widgetTurnstile = null;
  let cargaTurnstile = null;
  let turnstileCaido = false;
  let cargaCiudades = null;

  /* ---------- utilidades de campos ---------------------------------------- */
  const q = (sel) => form.querySelector(sel);
  const qa = (sel) => Array.from(form.querySelectorAll(sel));
  // Todas las preguntas de opciones admiten varias respuestas: siempre son listas
  const valoresCasillas = (n) => qa(`input[name="${n}"]:checked`).map((e) => e.value);
  const sinRespuesta = (n) => valoresCasillas(n).length === 0;
  const valorTexto = (n) => { const e = q(`[name="${n}"]`); return e ? e.value.trim() : ''; };
  const campoDe = (n) => q(`[data-campo="${n}"]`);
  const esNumero = (p) => /^\d$/.test(String(p));

  function marcarError(nombre, mensaje) {
    const campo = campoDe(nombre);
    if (!campo) { return null; }
    campo.classList.add('tiene-error');
    const err = campo.querySelector('.error');
    if (err) { err.textContent = mensaje; }
    campo.querySelectorAll('input, textarea, select').forEach((i) => {
      i.setAttribute('aria-invalid', 'true');
      if (err && err.id) { i.setAttribute('aria-describedby', err.id); }
    });
    return campo;
  }

  function limpiarErrores(paso) {
    const raiz = pasos.get(String(paso)) || form;
    raiz.querySelectorAll('.tiene-error').forEach((c) => c.classList.remove('tiene-error'));
    raiz.querySelectorAll('[aria-invalid]').forEach((i) => {
      i.removeAttribute('aria-invalid');
      i.removeAttribute('aria-describedby');
    });
    errorGeneral.hidden = true;
  }

  /* ---------- normalización ------------------------------------------------ */
  /* El campo de ubicación guarda «Ciudad, Departamento» en una sola línea, que es
     como la elige la persona. Aquí se parte en dos por la última coma; si no hay
     coma, lo escrito se toma como ciudad. */
  function partirUbicacion() {
    const v = valorTexto('ubicacion');
    const i = v.lastIndexOf(',');
    if (i < 0) { return { ciudad: v.slice(0, 80), departamento: '' }; }
    return {
      ciudad: v.slice(0, i).trim().slice(0, 80),
      departamento: v.slice(i + 1).trim().slice(0, 60)
    };
  }

  // Números colombianos: 10 dígitos que empiezan por 3 (celular) o por 60 (fijo).
  function normalizarTelefono(txt) {
    let d = String(txt || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+57')) { d = d.slice(3); }
    else if (d.startsWith('57') && d.length === 12) { d = d.slice(2); }
    else if (d.startsWith('+')) { return null; }
    if (!/^\d{10}$/.test(d)) { return null; }
    if (!(d[0] === '3' || d.startsWith('60'))) { return null; }
    return '+57' + d;
  }

  /* ---------- pasos y progreso --------------------------------------------- */
  function pasosActivos() { return [1, 2, 3, 4, 5]; }

  function pintarProgreso(p) {
    if (!esNumero(p)) { meta.hidden = true; progreso.hidden = true; return; }
    const activos = pasosActivos();
    const idx = activos.indexOf(Number(p));
    const total = activos.length;
    meta.textContent = `Paso ${idx + 1} de ${total}`;
    meta.hidden = false;
    progreso.hidden = false;
    const segmentos = [];
    for (let k = 0; k < total; k++) {
      const i = document.createElement('i');
      if (k <= idx) { i.className = 'hecho'; }
      segmentos.push(i);
    }
    progreso.replaceChildren(...segmentos);
  }

  // «¿Continuaron?» solo aplica si en alguna respuesta pidió que dejaran de llamar
  function pidioCese() {
    return valoresCasillas('pidio_cese').some((x) => x !== 'no');
  }

  function refrescarCondicionales() {
    const sub = document.getElementById('sub-continuaron');
    if (sub) { sub.hidden = !pidioCese(); }
  }

  function actualizarContadores() {
    qa('[data-contador]').forEach((t) => {
      const c = document.getElementById(t.dataset.contador);
      if (c) { c.textContent = `${t.value.length}/${t.maxLength > 0 ? t.maxLength : 500}`; }
    });
  }

  function mostrar(p, opciones) {
    opciones = opciones || {};
    p = String(p);
    if (!pasos.has(p)) { return; }
    if (enviado && p !== 'fin') { p = 'fin'; }

    pasos.forEach((el, id) => { el.hidden = id !== p; });
    actual = p;
    titulo.textContent = TITULOS[p] || TITULOS.intro;
    pintarProgreso(p);

    if (p === 'intro' || p === 'fin') {
      pie.hidden = true;
    } else {
      pie.hidden = false;
      btnSiguiente.textContent = p === PASO_FINAL ? 'Enviar mi caso' : 'Continuar';
    }

    refrescarCondicionales();
    if (p === PASO_FINAL) { prepararTurnstile(); }
    if (p === '1' && !inicio) { inicio = Date.now(); }

    // Confirmar antes de cerrar solo mientras hay respuestas en juego
    dialogo.dataset.confirmarCierre = (esNumero(p) && !enviado) ? '1' : '0';

    cuerpo.scrollTop = 0;
    if (!opciones.sinFoco) {
      const enfocar = pasos.get(p).querySelector('.paso__pregunta') || titulo;
      enfocar.focus({ preventScroll: true });
    }
    if (esNumero(p)) {
      const a = pasosActivos();
      vivo.textContent = `Paso ${a.indexOf(Number(p)) + 1} de ${a.length}: ${TITULOS[p]}`;
    } else {
      vivo.textContent = TITULOS[p];
    }
  }

  /* ---------- navegación --------------------------------------------------- */
  function irA(p) {
    if (NMM.modal && NMM.modal.empujar) { NMM.modal.empujar({ paso: String(p) }); }
    mostrar(p);
  }

  function siguiente() {
    if (!esNumero(actual)) { return; }
    const invalido = validar(actual);
    if (invalido) { enfocarError(invalido); return; }
    guardarBorrador();
    if (actual === PASO_FINAL) { enviar(); return; }
    const a = pasosActivos();
    irA(a[a.indexOf(Number(actual)) + 1]);
  }

  function atras() {
    // Retroceder por el historial mantiene coherente el botón «atrás» del teléfono
    const s = history.state;
    if (s && s.nmm && s.paso) { history.back(); return; }
    const a = pasosActivos();
    const i = a.indexOf(Number(actual));
    mostrar(i > 0 ? a[i - 1] : 'intro');
  }

  function enfocarError(campo) {
    const foco = campo.querySelector('input:not([type="hidden"]), textarea, select') || campo;
    foco.focus({ preventScroll: true });
    campo.scrollIntoView({ block: 'center', behavior: reduceMovimiento ? 'auto' : 'smooth' });
    const err = campo.querySelector('.error');
    if (err && err.textContent) { vivo.textContent = 'Revisa: ' + err.textContent; }
  }

  /* ---------- validación por paso ----------------------------------------- */
  function validar(p) {
    limpiarErrores(p);
    let primero = null;
    const falla = (n, m) => { const c = marcarError(n, m); if (c && !primero) { primero = c; } };

    switch (String(p)) {
      case '1':
        if (sinRespuesta('canal')) { falla('canal', 'Marca al menos una opción.'); }
        if (sinRespuesta('frecuencia')) { falla('frecuencia', 'Marca al menos una opción.'); }
        if (sinRespuesta('ultima_vez')) { falla('ultima_vez', 'Marca al menos una opción.'); }
        break;
      case '2':
        if (sinRespuesta('sector')) { falla('sector', 'Marca al menos una opción. Si no lo sabes, marca «No se identificaron».'); }
        if (valorTexto('empresa').length > 120) { falla('empresa', 'Máximo 120 caracteres.'); }
        break;
      case '3':
        if (sinRespuesta('autorizacion')) { falla('autorizacion', 'Marca al menos una opción.'); }
        if (sinRespuesta('era_cliente')) { falla('era_cliente', 'Marca al menos una opción.'); }
        break;
      case '4':
        if (sinRespuesta('pidio_cese')) { falla('pidio_cese', 'Marca al menos una opción.'); }
        else if (pidioCese() && sinRespuesta('continuaron')) { falla('continuaron', 'Cuéntanos si siguieron llamando.'); }
        break;
      case '5': {
        if (valorTexto('nombre').length > 80) { falla('nombre', 'Máximo 80 caracteres.'); }
        const c = valorTexto('correo');
        if (!c) { falla('correo', 'Necesitamos un correo para avisarte y para que puedas actualizar tu caso.'); }
        else if (!CORREO_RE.test(c)) { falla('correo', 'Revisa el formato del correo, por ejemplo nombre@correo.com.'); }
        const t = valorTexto('telefono');
        if (t && !normalizarTelefono(t)) { falla('telefono', 'Revisa el número: 10 dígitos que empiezan por 3 (celular) o por 60 (fijo).'); }
        if (valorTexto('ubicacion').length > 90) { falla('ubicacion', 'Máximo 90 caracteres.'); }
        if (valorTexto('relato').length > 500) { falla('relato', 'Máximo 500 caracteres.'); }

        const legales = q('.casillas-legales');
        const faltan = ['acepto_tratamiento', 'acepto_veracidad', 'acepto_mayor'].filter((n) => !q(`input[name="${n}"]`).checked);
        if (faltan.length) {
          legales.classList.add('tiene-error');
          legales.querySelector('.error').textContent = 'Para registrar el caso necesitamos las tres casillas obligatorias.';
          if (!primero) { primero = legales; }
        }
        if (turnstileRequerido() && !tokenTurnstile()) {
          errorGeneral.textContent = turnstileCaido
            ? MSJ_TURNSTILE_CAIDO
            : 'Espera un momento a que termine la verificación de seguridad e inténtalo de nuevo.';
          errorGeneral.hidden = false;
          if (!primero) { primero = document.getElementById('caja-turnstile'); }
        }
        break;
      }
      default:
        break;
    }
    return primero;
  }

  /* ---------- borrador en la sesión (solo pasos 1 a 4) --------------------- */
  function recogerBorrador() {
    const o = {};
    CAMPOS_BORRADOR.forEach((n) => {
      const inputs = qa(`[name="${n}"]`);
      if (!inputs.length) { return; }
      const tipo = inputs[0].type;
      if (tipo === 'radio') { o[n] = valorRadio(n); }
      else if (tipo === 'checkbox') { o[n] = valoresCasillas(n); }
      else { o[n] = inputs[0].value; }
    });
    return o;
  }

  function guardarBorrador() {
    try {
      sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify({
        v: 3,
        paso: esNumero(actual) ? Math.min(Number(actual), ULTIMO_PASO_CON_BORRADOR) : 1,
        inicio,
        campos: recogerBorrador()
      }));
    } catch (e) { /* almacenamiento no disponible: se sigue sin borrador */ }
  }

  function leerBorrador() {
    try {
      const b = JSON.parse(sessionStorage.getItem(CLAVE_BORRADOR) || 'null');
      return (b && b.v === 3 && b.campos) ? b : null;
    } catch (e) { return null; }
  }

  function borrarBorrador() {
    try { sessionStorage.removeItem(CLAVE_BORRADOR); } catch (e) { /* nada */ }
  }

  function restaurarBorrador(b) {
    Object.keys(b.campos).forEach((n) => {
      const v = b.campos[n];
      qa(`[name="${n}"]`).forEach((i) => {
        if (i.type === 'radio') { i.checked = i.value === v; }
        else if (i.type === 'checkbox') { i.checked = Array.isArray(v) && v.includes(i.value); }
        else { i.value = v || ''; }
      });
    });
    if (b.inicio) { inicio = b.inicio; }
    refrescarCondicionales();
    actualizarContadores();
  }

  function prepararIntro() {
    const b = leerBorrador();
    const nuevo = document.getElementById('intro-nuevo');
    const conBorrador = document.getElementById('intro-borrador');
    if (b && b.paso) {
      restaurarBorrador(b);
      conBorrador.hidden = false;
      nuevo.hidden = true;
    } else {
      conBorrador.hidden = true;
      nuevo.hidden = false;
    }
  }

  /* ---------- Lista de municipios (se descarga al abrir el formulario) ------ */
  function cargarCiudades() {
    if (cargaCiudades) { return cargaCiudades; }
    cargaCiudades = new Promise((res) => {
      if (NMM.ciudades) { res(); return; }
      const s = document.createElement('script');
      s.src = 'assets/js/ciudades.js?v=2e800e51';
      s.async = true;
      s.onload = res;
      s.onerror = res;   // sin lista, el campo sigue siendo de texto libre
      document.head.appendChild(s);
    }).then(() => {
      const lista = document.getElementById('ciudades');
      if (!lista || !NMM.ciudades || lista.children.length) { return; }
      const trozo = document.createDocumentFragment();
      NMM.ciudades.forEach((nombre) => {
        const o = document.createElement('option');
        o.value = nombre;
        trozo.appendChild(o);
      });
      lista.appendChild(trozo);
    });
    return cargaCiudades;
  }

  /* ---------- Turnstile (solo si hay site key) ----------------------------- */
  function turnstileRequerido() {
    return Boolean(NMM.config && NMM.config.turnstileSiteKey);
  }

  /* Cuidado: cada elemento con id crea una variable global del mismo nombre, así que
     window.turnstile podría ser un <div> de la propia página. Solo vale como biblioteca
     si trae la función render(). */
  function apiTurnstile() {
    const api = window.turnstile;
    return (api && typeof api.render === 'function') ? api : null;
  }

  function tokenTurnstile() {
    const api = apiTurnstile();
    if (!turnstileRequerido() || !api || widgetTurnstile === null) { return ''; }
    try { return api.getResponse(widgetTurnstile) || ''; } catch (e) { return ''; }
  }

  function cargarTurnstile() {
    if (cargaTurnstile) { return cargaTurnstile; }
    cargaTurnstile = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      // Tras cargar, la biblioteca puede tardar un instante en registrarse
      const esperarApi = (intentos) => {
        if (apiTurnstile() || intentos <= 0) { res(); return; }
        setTimeout(() => esperarApi(intentos - 1), 150);
      };
      s.onload = () => esperarApi(20);
      s.onerror = () => res();
      document.head.appendChild(s);
    });
    return cargaTurnstile;
  }

  function prepararTurnstile() {
    if (!turnstileRequerido() || widgetTurnstile !== null || turnstileCaido) { return; }
    const api = apiTurnstile();
    if (api) {
      widgetTurnstile = api.render(document.getElementById('caja-turnstile'), {
        sitekey: NMM.config.turnstileSiteKey,
        theme: 'light',
        language: 'es'
      });
      return;
    }
    // Un solo intento de carga: si falla, se avisa en vez de reintentar en bucle
    cargarTurnstile().then(() => {
      if (apiTurnstile()) { prepararTurnstile(); return; }
      turnstileCaido = true;
      errorGeneral.textContent = MSJ_TURNSTILE_CAIDO;
      errorGeneral.hidden = false;
    });
  }

  /* ---------- carga útil y envío ------------------------------------------- */
  function recoger() {
    const tel = valorTexto('telefono');
    const donde = partirUbicacion();
    return {
      esquema: 1,
      turnstile: tokenTurnstile(),
      hp: valorTexto('sitio_web'),
      caso: {
        canal: valoresCasillas('canal'),
        frecuencia: valoresCasillas('frecuencia'),
        ultima_vez: valoresCasillas('ultima_vez'),
        franja: valoresCasillas('franja'),
        sector: valoresCasillas('sector'),
        empresa: valorTexto('empresa'),
        proposito: valoresCasillas('proposito'),
        autorizacion: valoresCasillas('autorizacion'),
        era_cliente: valoresCasillas('era_cliente'),
        pidio_cese: valoresCasillas('pidio_cese'),
        continuaron: pidioCese() ? valoresCasillas('continuaron') : ['no_aplica'],
        relato: valorTexto('relato'),
        ciudad: donde.ciudad,
        departamento: donde.departamento
      },
      contacto: {
        nombre: valorTexto('nombre'),
        correo: valorTexto('correo'),
        telefono: tel ? normalizarTelefono(tel) : ''
      },
      consentimientos: {
        tratamiento: q('input[name="acepto_tratamiento"]').checked,
        veracidad: q('input[name="acepto_veracidad"]').checked,
        mayor_de_edad: q('input[name="acepto_mayor"]').checked,
        novedades: q('input[name="novedades"]').checked,
        version_politica: (NMM.config && NMM.config.versionPolitica) || ''
      },
      meta: {
        duracion_s: inicio ? Math.round((Date.now() - inicio) / 1000) : null,
        origen: 'landing'
      }
    };
  }

  function mensajeError(e) {
    switch (e && e.tipo) {
      case 'validacion': return 'Algunos datos no pasaron la revisión del servidor. Corrige lo marcado e inténtalo de nuevo.';
      case 'antibot': return 'No pudimos confirmar la verificación antirrobots. Vuelve a intentarlo.';
      case 'limite': return 'Has enviado varios registros seguidos. Espera un rato e inténtalo de nuevo; tus respuestas siguen aquí.';
      case 'mantenimiento': return 'Estamos en mantenimiento. Vuelve en unos minutos; tus respuestas siguen aquí.';
      default: return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo; no se perdió nada.';
    }
  }

  function enviar() {
    if (enviando) { return; }
    enviando = true;
    const etiqueta = btnSiguiente.textContent;
    btnSiguiente.disabled = true;
    btnAtras.disabled = true;
    btnSiguiente.textContent = 'Enviando…';
    errorGeneral.hidden = true;
    vivo.textContent = 'Enviando tu caso…';

    NMM.api.registrarCaso(recoger()).then((r) => {
      enviado = true;
      borrarBorrador();
      document.getElementById('codigo-caso').textContent = r.codigo;
      document.getElementById('aviso-local').hidden = !r.modoLocal;
      document.getElementById('aviso-correo').hidden = !r.correoEnviado;
      // Si el correo no salió, hay que decirlo: si no, la persona cierra la
      // ventana esperando un mensaje que nunca va a llegar
      document.getElementById('aviso-sin-correo').hidden = Boolean(r.modoLocal) || r.correoEnviado !== false;
      form.reset();
      refrescarCondicionales();
      actualizarContadores();
      inicio = 0;
      if (window.turnstile && widgetTurnstile !== null) {
        try { window.turnstile.reset(widgetTurnstile); } catch (e) { /* nada */ }
      }
      // Que «atrás» no vuelva a un formulario ya enviado
      if (history.state && history.state.nmm) {
        history.replaceState(Object.assign({}, history.state, { paso: 'fin' }), '');
      }
      mostrar('fin');
    }).catch((e) => {
      const m = mensajeError(e);
      errorGeneral.textContent = m;
      errorGeneral.hidden = false;
      vivo.textContent = m;
      if (e && e.tipo === 'validacion' && e.campos) {
        Object.keys(e.campos).forEach((k) => marcarError(k.split('.').pop(), e.campos[k]));
      }
      if (window.turnstile && widgetTurnstile !== null) {
        try { window.turnstile.reset(widgetTurnstile); } catch (x) { /* nada */ }
      }
    }).then(() => {
      enviando = false;
      btnSiguiente.disabled = false;
      btnAtras.disabled = false;
      btnSiguiente.textContent = etiqueta;
    });
  }

  /* ---------- compartir ---------------------------------------------------- */
  function compartir() {
    const url = (NMM.config && NMM.config.urlCanonica) || location.href;
    const msj = document.getElementById('compartir-msj');
    const datos = {
      title: 'NO ME LLAMEN MÁS',
      text: 'Unidos contra el acoso comercial. Si a ti también te llaman sin autorización, registra tu caso:',
      url
    };
    if (navigator.share) {
      navigator.share(datos).catch(() => { /* la persona canceló */ });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        msj.textContent = 'Enlace copiado. Pégalo donde quieras compartirlo.';
      }).catch(() => { msj.textContent = 'Copia este enlace: ' + url; });
    } else {
      msj.textContent = 'Copia este enlace: ' + url;
    }
  }

  /* ---------- eventos ------------------------------------------------------ */
  dialogo.addEventListener('nmm:abierto', () => {
    enviado = false;
    enviando = false;
    errorGeneral.hidden = true;
    document.getElementById('compartir-msj').textContent = '';
    prepararIntro();
    mostrar('intro', { sinFoco: true });
    cargarCiudades();
  });

  dialogo.addEventListener('nmm:estado', (e) => {
    const s = e.detail || {};
    const p = s.paso ? String(s.paso) : 'intro';
    if (p !== actual) { mostrar(p); }
  });

  document.getElementById('btn-empezar').addEventListener('click', () => irA(1));
  document.getElementById('btn-continuar-borrador').addEventListener('click', () => {
    const b = leerBorrador();
    irA(b && b.paso ? b.paso : 1);
  });
  document.getElementById('btn-nuevo').addEventListener('click', () => {
    borrarBorrador();
    form.reset();
    inicio = 0;
    refrescarCondicionales();
    actualizarContadores();
    irA(1);
  });
  document.getElementById('btn-compartir').addEventListener('click', compartir);
  document.getElementById('btn-cerrar-fin').addEventListener('click', () => {
    if (NMM.modal) { NMM.modal.cerrar('registro'); }
  });

  btnSiguiente.addEventListener('click', siguiente);
  btnAtras.addEventListener('click', atras);
  form.addEventListener('submit', (e) => { e.preventDefault(); siguiente(); });

  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'pidio_cese') {
      // «No» es incompatible con haberlo pedido de alguna forma
      const cajas = qa('input[name="pidio_cese"]');
      if (t.value === 'no' && t.checked) {
        cajas.forEach((c) => { if (c !== t) { c.checked = false; } });
      } else if (t.checked) {
        const no = cajas.find((c) => c.value === 'no');
        if (no) { no.checked = false; }
      }
      refrescarCondicionales();
    }
    const campo = t.closest('.campo, .casillas-legales');
    if (campo) { campo.classList.remove('tiene-error'); }
    if (esNumero(actual) && Number(actual) <= ULTIMO_PASO_CON_BORRADOR) { guardarBorrador(); }
  });

  form.addEventListener('input', (e) => {
    if (e.target.matches('[data-contador]')) { actualizarContadores(); }
  });

  actualizarContadores();
  NMM.wizard = { mostrar, recoger, normalizarTelefono };
  // El formulario de contacto reutiliza este cargador: una sola copia del
  // código y una sola descarga de la biblioteca de Cloudflare
  NMM.turnstile = { cargar: cargarTurnstile, api: apiTurnstile, requerido: turnstileRequerido };
})();
