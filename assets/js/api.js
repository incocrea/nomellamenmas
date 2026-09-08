/* ==========================================================================
   NO ME LLAMEN MÁS · api.js
   Lo único que la landing sabe del backend: un POST a {apiBase}/registrar-caso
   (contrato v1 en docs/00 §3). Sin apiBase funciona en modo local: simula la
   respuesta y no envía nada.
   ========================================================================== */
(function () {
  'use strict';

  var NMM = window.NMM = window.NMM || {};
  var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

  function esperar(ms) {
    return new Promise(function (res) { setTimeout(res, ms); });
  }

  function codigoDePrueba() {
    var s = 'NMM-';
    for (var k = 0; k < 6; k++) { s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]; }
    return s;
  }

  function leerJson(respuesta) {
    return respuesta.text().then(function (t) {
      try { return t ? JSON.parse(t) : null; } catch (e) { return null; }
    });
  }

  function registrarCaso(payload) {
    var cfg = NMM.config || {};
    if (!cfg.apiBase) {
      // Modo local: el flujo completo se puede probar sin servidor
      return esperar(900).then(function () {
        if (window.console) { console.info('[NMM] Modo local: el caso no se envió a ningún servidor.', payload); }
        return { codigo: codigoDePrueba(), modoLocal: true };
      });
    }

    var url = cfg.apiBase.replace(/\/+$/, '') + '/registrar-caso';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit'
    }).catch(function () {
      throw { tipo: 'red' };
    }).then(function (respuesta) {
      return leerJson(respuesta).then(function (datos) {
        if (respuesta.ok) {
          if (datos && datos.codigo) { return datos; }
          throw { tipo: 'red' };
        }
        switch (respuesta.status) {
          case 400: throw { tipo: 'validacion', campos: (datos && datos.campos) || {} };
          case 403: throw { tipo: 'antibot' };
          case 429: throw { tipo: 'limite', reintentarEn: datos && datos.reintentar_en };
          case 503: throw { tipo: 'mantenimiento' };
          default: throw { tipo: 'red' };
        }
      });
    });
  }

  /* «Mi caso»: consultar, actualizar o eliminar el propio reporte.
     accion = 'consultar' | 'actualizar' | 'eliminar' */
  function miCaso(accion, datos) {
    const cfg = NMM.config || {};
    if (!cfg.apiBase) { return Promise.reject({ tipo: 'red' }); }

    const url = cfg.apiBase.replace(/\/+$/, '') + '/mi-caso';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ esquema: 1, accion: accion }, datos)),
      credentials: 'omit'
    }).catch(function () {
      throw { tipo: 'red' };
    }).then(function (respuesta) {
      return leerJson(respuesta).then(function (d) {
        if (respuesta.ok) { return d || {}; }
        switch (respuesta.status) {
          case 400: throw { tipo: 'validacion', campos: (d && d.campos) || {} };
          case 403: throw { tipo: 'origen' };
          case 404: throw { tipo: 'no_encontrado' };
          case 410: throw { tipo: 'enlace_invalido' };
          case 429: throw { tipo: 'limite' };
          case 503: throw { tipo: 'mantenimiento' };
          default: throw { tipo: 'red' };
        }
      });
    });
  }

  NMM.api = { registrarCaso: registrarCaso, miCaso: miCaso };
})();
