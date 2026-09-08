/* ==========================================================================
   NO ME LLAMEN MÁS · main.js
   Arranque de la landing: revelado suave de secciones y barra CTA fija en
   móvil. Los modales y el wizard se inician solos en sus módulos.
   ========================================================================== */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  // Si alguien intenta mostrar la landing dentro de un marco ajeno, salimos de él
  try {
    if (window.top !== window.self) { window.top.location.href = window.location.href; }
  } catch (e) { /* marco de otro origen: no podemos hacer más sin cabeceras */ }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tieneIO = 'IntersectionObserver' in window;

  /* ---------- revelado suave ------------------------------------------------ */
  // Todo es visible en reposo. Solo lo que aún no está en pantalla se marca
  // «pendiente» y se revela al entrar. Una red de seguridad lo muestra todo a los 4 s.
  const revelables = Array.from(document.querySelectorAll('.revelar'));
  if (revelables.length && tieneIO && !reduce) {
    const alto = window.innerHeight || document.documentElement.clientHeight;
    const pendientes = revelables.filter((el) => el.getBoundingClientRect().top > alto * 0.92);
    pendientes.forEach((el) => el.classList.add('pendiente'));
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.remove('pendiente');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    pendientes.forEach((el) => io.observe(el));
    setTimeout(() => pendientes.forEach((el) => el.classList.remove('pendiente')), 4000);
  }

  /* ---------- «Mi caso» se descarga cuando hace falta ------------------------
     La mayoría de quien llega solo lee o registra su caso. El módulo de
     consulta se pide la primera vez que se pulsa el enlace. Escuchamos en fase
     de captura para adelantarnos a modal.js; si el modal alcanza a abrirse
     antes, micaso.js se pone al día solo al cargar. */
  let cargaMiCaso = null;
  function cargarMiCaso() {
    if (cargaMiCaso) { return cargaMiCaso; }
    cargaMiCaso = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'assets/js/micaso.js?v=81f5903b';
      s.async = true;
      s.onload = res;
      s.onerror = res;
      document.head.appendChild(s);
    });
    return cargaMiCaso;
  }
  let cargaContacto = null;
  function cargarContacto() {
    if (cargaContacto) { return cargaContacto; }
    cargaContacto = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'assets/js/contacto.js?v=33c32774';
      s.async = true;
      s.onload = res;
      s.onerror = res;
      document.head.appendChild(s);
    });
    return cargaContacto;
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest) { return; }
    if (e.target.closest('[data-abrir-modal="mi-caso"]')) { cargarMiCaso(); }
    if (e.target.closest('[data-abrir-modal="contacto"]')) { cargarContacto(); }
  }, true);

  /* El correo de confirmación trae dos formas de volver al caso:
       ?t=<token firmado>  abre el caso de un clic, sin escribir nada
       ?caso=NMM-XXXXXX    solo rellena el código (enlaces antiguos)
     El token se quita de la barra de direcciones en cuanto se usa, para que no
     quede en el historial ni se comparta por accidente al copiar la URL. */
  const NMM = window.NMM = window.NMM || {};
  const parametros = new URLSearchParams(location.search);
  const token = (parametros.get('t') || '').trim();
  const codigo = (parametros.get('caso') || '').trim().toUpperCase();

  if (token || /^NMM-[A-Z2-9]{6}$/.test(codigo)) {
    if (token) { NMM.tokenInicial = token; } else { NMM.casoInicial = codigo; }
    try {
      parametros.delete('t');
      parametros.delete('caso');
      const limpia = location.pathname + (parametros.toString() ? '?' + parametros : '');
      history.replaceState(history.state, '', limpia);
    } catch (e) { /* si el navegador no deja, seguimos igual */ }
    cargarMiCaso().then(() => {
      if (NMM.modal) { NMM.modal.abrir('mi-caso'); }
    });
  }

  /* ---------- CTA fija en móvil --------------------------------------------- */
  // Aparece cuando el hero queda arriba y se oculta mientras se ve el bloque
  // rojo final, que ya tiene su propio botón.
  const barra = document.getElementById('cta-fija');
  const hero = document.getElementById('hero');
  const cierre = document.getElementById('registra');
  const compartir = document.getElementById('barra-compartir');
  if (barra && hero && tieneIO) {
    let heroArriba = false;
    let cierreVisible = false;
    const actualizar = () => {
      const visible = heroArriba && !cierreVisible;
      barra.classList.toggle('visible', visible);
      if (visible) { barra.removeAttribute('inert'); } else { barra.setAttribute('inert', ''); }
      // Compartir sigue disponible tambien sobre el bloque rojo final; solo
      // se aparta hacia arriba mientras la CTA fija ocupa el borde inferior
      if (compartir) {
        compartir.classList.toggle('visible', heroArriba);
        compartir.classList.toggle('compartir--sube', visible);
        if (heroArriba) { compartir.removeAttribute('inert'); } else { compartir.setAttribute('inert', ''); }
      }
    };
    new IntersectionObserver((en) => {
      heroArriba = !en[0].isIntersecting && en[0].boundingClientRect.bottom < 0;
      actualizar();
    }, { threshold: 0 }).observe(hero);
    if (cierre) {
      new IntersectionObserver((en) => {
        cierreVisible = en[0].isIntersecting;
        actualizar();
        // 0.35 y no 0.15: el bloque rojo creció, y con el umbral viejo la barra
        // fija se escondía mucho antes de que el botón real entrara en pantalla
      }, { threshold: 0.35 }).observe(cierre);
    }
  }

})();
