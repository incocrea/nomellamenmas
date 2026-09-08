/* ==========================================================================
   NO ME LLAMEN MÁS · modal.js
   Sistema de modales sobre <dialog>. Abre con [data-abrir-modal="id"], cierra
   con [data-cerrar-modal], Escape, clic en el fondo (solo escritorio) y el
   botón «atrás» del teléfono. Integra el historial para que retroceder cierre
   el modal en vez de abandonar la página (patrón heredado de Mentefu).

   Estados del historial: { nmm: true, i: <entradas desde la base>,
   pila: [ids abiertos], ...extra }. La entrada «base» es la anterior a abrir
   el primer modal; cerrar del todo es volver a ella con history.go(-i).
   ========================================================================== */
(function () {
  'use strict';

  var NMM = window.NMM = window.NMM || {};
  var dialogos = new Map();
  document.querySelectorAll('dialog.modal[id^="modal-"]').forEach(function (d) {
    dialogos.set(d.id.slice(6), d);
  });
  if (!dialogos.size) { return; }

  var soporta = typeof HTMLDialogElement === 'function' &&
    typeof HTMLDialogElement.prototype.showModal === 'function';
  var abiertos = [];              // ids abiertos, de abajo hacia arriba
  var focoPrevio = new Map();     // id -> elemento que tenía el foco al abrir

  function estado() {
    var s = history.state;
    return (s && s.nmm) ? s : null;
  }

  function empujar(extra) {
    var previo = estado();
    var nuevo = { nmm: true, i: previo ? previo.i + 1 : 1, pila: abiertos.slice() };
    if (extra) { Object.keys(extra).forEach(function (k) { nuevo[k] = extra[k]; }); }
    history.pushState(nuevo, '');
  }

  function bloquearPagina(si) {
    document.body.classList.toggle('modal-abierto', si);
    document.body.classList.toggle('sin-scroll', si);
  }

  function abrir(id, opciones) {
    opciones = opciones || {};
    var d = dialogos.get(id);
    if (!d) { return false; }
    if (abiertos.indexOf(id) >= 0) { return true; }

    focoPrevio.set(id, document.activeElement);
    if (soporta) { d.showModal(); } else { d.setAttribute('open', ''); }
    abiertos.push(id);
    bloquearPagina(true);

    var cuerpo = d.querySelector('.modal__cuerpo');
    if (cuerpo) { cuerpo.scrollTop = 0; }
    if (!opciones.sinHistorial) { empujar(opciones.estado); }

    d.dispatchEvent(new CustomEvent('nmm:abierto'));

    var foco = d.querySelector('[data-foco-inicial]') || d.querySelector('.modal__titulo');
    if (foco) {
      if (!foco.hasAttribute('tabindex')) { foco.setAttribute('tabindex', '-1'); }
      foco.focus({ preventScroll: true });
    }
    return true;
  }

  function cerrarDirecto(id) {
    var d = dialogos.get(id);
    if (!d) { return; }
    var pos = abiertos.indexOf(id);
    if (pos >= 0) { abiertos.splice(pos, 1); }
    if (d.open) {
      if (soporta) { d.close(); } else { d.removeAttribute('open'); }
    }
    if (!abiertos.length) { bloquearPagina(false); }
    var f = focoPrevio.get(id);
    focoPrevio.delete(id);
    d.dispatchEvent(new CustomEvent('nmm:cerrado'));
    if (f && typeof f.focus === 'function' && document.contains(f)) {
      try { f.focus({ preventScroll: true }); } catch (e) { /* sin foco previo */ }
    }
  }

  function puedeCerrar(d) {
    if (d.dataset.confirmarCierre !== '1') { return true; }
    return window.confirm(d.dataset.mensajeCierre || '¿Cerrar?');
  }

  /* Cierra el modal superior (o el indicado) deshaciendo el historial propio.
     El cierre real lo hace el popstate; un temporizador cubre el caso raro
     de que el evento no llegue. */
  function cerrar(id) {
    id = id || abiertos[abiertos.length - 1];
    if (!id) { return; }
    var d = dialogos.get(id);
    if (!d || abiertos.indexOf(id) < 0) { return; }
    if (!puedeCerrar(d)) { return; }

    var s = estado();
    if (!s) { cerrarDirecto(id); return; }
    if (abiertos.length <= 1) { history.go(-s.i); } else { history.back(); }
    setTimeout(function () {
      if (abiertos.indexOf(id) >= 0) { cerrarDirecto(id); }
    }, 450);
  }

  /* Hace que los modales abiertos coincidan con la pila del estado recibido */
  function reconciliar(s) {
    var pila = (s && s.nmm && Array.isArray(s.pila)) ? s.pila : [];
    for (var k = abiertos.length - 1; k >= 0; k--) {
      if (pila.indexOf(abiertos[k]) < 0) { cerrarDirecto(abiertos[k]); }
    }
    pila.forEach(function (id) {
      if (abiertos.indexOf(id) < 0) { abrir(id, { sinHistorial: true }); }
    });
    if (s && s.nmm && abiertos.length) {
      var cima = dialogos.get(abiertos[abiertos.length - 1]);
      if (cima) { cima.dispatchEvent(new CustomEvent('nmm:estado', { detail: s })); }
    }
  }

  window.addEventListener('popstate', function (e) { reconciliar(e.state); });

  /* Si la página se recargó con un estado nuestro, esta entrada pasa a ser base */
  if (estado()) { history.replaceState(null, ''); }

  dialogos.forEach(function (d, id) {
    // Escape: pasa por nuestro cierre para mantener el historial coherente
    d.addEventListener('cancel', function (e) { e.preventDefault(); cerrar(id); });
    // Cierre por otra vía (p. ej. doble Escape en Chrome): limpiamos y deshacemos el historial
    d.addEventListener('close', function () {
      if (abiertos.indexOf(id) >= 0) {
        cerrarDirecto(id);
        var s = estado();
        if (s && !abiertos.length) { history.go(-s.i); }
      }
    });
    // Clic en el fondo oscurecido: solo en escritorio
    d.addEventListener('click', function (e) {
      if (e.target === d && window.matchMedia('(min-width: 768px)').matches) { cerrar(id); }
    });
  });

  document.addEventListener('click', function (e) {
    var abre = e.target.closest('[data-abrir-modal]');
    if (abre) { e.preventDefault(); abrir(abre.getAttribute('data-abrir-modal')); return; }
    var cierra = e.target.closest('[data-cerrar-modal]');
    if (cierra) {
      e.preventDefault();
      var d = cierra.closest('dialog');
      cerrar(d ? d.id.slice(6) : undefined);
    }
  });

  NMM.modal = {
    abrir: abrir,
    cerrar: cerrar,
    empujar: empujar,
    abiertos: function () { return abiertos.slice(); }
  };
})();
