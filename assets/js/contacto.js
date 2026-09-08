/* ==========================================================================
   NO ME LLAMEN MÁS · contacto.js
   El formulario de contacto: nombre, correo y asunto. Habla con la función
   «contacto», que guarda el mensaje antes de intentar avisar por correo.
   Se descarga solo cuando alguien abre el modal.
   ========================================================================== */
(function () {
  'use strict';

  const NMM = window.NMM = window.NMM || {};
  const dialogo = document.getElementById('modal-contacto');
  if (!dialogo) { return; }

  const $ = (id) => document.getElementById(id);
  const formulario = $('ct-formulario');
  const listo = $('ct-listo');
  const pie = $('ct-pie');
  const boton = $('ct-enviar');
  const error = $('ct-error');
  const vivo = $('ct-vivo');

  const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  let enviando = false;
  let widget = null;

  /* ---------- verificación antirrobots -------------------------------------
     El cargador vive en wizard.js, que siempre está en la portada: así no hay
     dos copias del mismo código ni dos descargas de la biblioteca. */
  function turnstileRequerido() {
    return Boolean(NMM.turnstile && NMM.turnstile.requerido && NMM.turnstile.requerido());
  }

  function token() {
    const api = NMM.turnstile && NMM.turnstile.api && NMM.turnstile.api();
    if (!api || widget === null) { return ''; }
    try { return api.getResponse(widget) || ''; } catch (e) { return ''; }
  }

  function prepararTurnstile() {
    if (!turnstileRequerido() || widget !== null) { return; }
    const api = NMM.turnstile.api();
    if (api) {
      widget = api.render($('caja-turnstile-contacto'), {
        sitekey: NMM.config.turnstileSiteKey, theme: 'light', language: 'es'
      });
      return;
    }
    NMM.turnstile.cargar().then(() => {
      if (NMM.turnstile.api()) { prepararTurnstile(); }
    });
  }

  /* ---------- errores -------------------------------------------------------- */
  function limpiar() {
    dialogo.querySelectorAll('.tiene-error').forEach((c) => c.classList.remove('tiene-error'));
    error.hidden = true;
  }

  function marcar(campo, mensaje) {
    const c = dialogo.querySelector('[data-campo="' + campo + '"]');
    if (!c) { return null; }
    c.classList.add('tiene-error');
    const e = c.querySelector('.error');
    if (e) { e.textContent = mensaje; }
    return c;
  }

  function mensajeError(e) {
    switch (e && e.tipo) {
      case 'validacion': return 'Revisa los datos marcados.';
      case 'antibot': return 'No pudimos confirmar la verificación de seguridad. Vuelve a intentarlo.';
      case 'limite': return 'Ya nos escribiste varias veces seguidas. Espera un rato antes de mandar otro mensaje.';
      case 'mantenimiento': return 'Estamos en mantenimiento. Vuelve en unos minutos; lo que escribiste sigue aquí.';
      default: return 'No pudimos enviar el mensaje. Revisa tu conexión e inténtalo de nuevo.';
    }
  }

  function contador() {
    const t = $('ct-asunto');
    $('ct-contador').textContent = t.value.length + '/1000';
  }

  /* ---------- envío ----------------------------------------------------------- */
  function enviar() {
    if (enviando) { return; }
    limpiar();

    const nombre = $('ct-nombre').value.trim();
    const correo = $('ct-correo').value.trim().toLowerCase();
    const asunto = $('ct-asunto').value.trim();
    let primero = null;
    const falla = (campo, m) => { const c = marcar(campo, m); if (c && !primero) { primero = c; } };

    if (!nombre) { falla('ct-nombre', 'Dinos cómo te llamas.'); }
    if (!correo) { falla('ct-correo', 'Necesitamos tu correo para responderte.'); }
    else if (!CORREO_RE.test(correo)) { falla('ct-correo', 'Revisa el formato, por ejemplo nombre@correo.com.'); }
    if (!asunto) { falla('ct-asunto', 'Cuéntanos de qué se trata.'); }
    if (primero) {
      const foco = primero.querySelector('input, textarea');
      if (foco) { foco.focus({ preventScroll: true }); }
      primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (turnstileRequerido() && !token()) {
      error.textContent = 'Espera un momento a que termine la verificación de seguridad e inténtalo de nuevo.';
      error.hidden = false;
      return;
    }

    enviando = true;
    boton.disabled = true;
    const etiqueta = boton.textContent;
    boton.textContent = 'Enviando…';
    vivo.textContent = 'Enviando tu mensaje…';

    NMM.api.contacto({
      nombre: nombre, correo: correo, asunto: asunto,
      turnstile: token(), hp: $('ct-web').value
    }).then((r) => {
      formulario.hidden = true;
      listo.hidden = false;
      pie.hidden = true;
      $('ct-sin-correo').hidden = r.avisado !== false;
      dialogo.dataset.confirmarCierre = '0';
      $('ct-listo-titulo').focus({ preventScroll: true });
      vivo.textContent = 'Mensaje enviado';
    }).catch((e) => {
      const m = mensajeError(e);
      error.textContent = m;
      error.hidden = false;
      vivo.textContent = m;
      if (e && e.tipo === 'validacion' && e.campos) {
        Object.keys(e.campos).forEach((k) => marcar('ct-' + k, e.campos[k]));
      }
      const api = NMM.turnstile && NMM.turnstile.api && NMM.turnstile.api();
      if (api && widget !== null) { try { api.reset(widget); } catch (x) { /* nada */ } }
    }).then(() => {
      enviando = false;
      boton.disabled = false;
      boton.textContent = etiqueta;
    });
  }

  /* ---------- eventos ---------------------------------------------------------- */
  function alAbrir() {
    formulario.hidden = false;
    listo.hidden = true;
    pie.hidden = false;
    limpiar();
    dialogo.dataset.confirmarCierre = '0';
    prepararTurnstile();
    contador();
  }

  dialogo.addEventListener('nmm:abierto', alAbrir);
  boton.addEventListener('click', enviar);
  $('ct-asunto').addEventListener('input', () => {
    contador();
    dialogo.dataset.confirmarCierre = $('ct-asunto').value.trim() ? '1' : '0';
  });
  dialogo.addEventListener('change', (e) => {
    const campo = e.target.closest('.campo');
    if (campo) { campo.classList.remove('tiene-error'); }
  });

  // Se descarga al vuelo: si el modal ya está abierto, lo prepara ahora
  if (dialogo.open) { alAbrir(); }
})();
