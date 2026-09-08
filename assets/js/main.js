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
  let pedidoMiCaso = false;
  document.addEventListener('click', (e) => {
    const abre = e.target.closest && e.target.closest('[data-abrir-modal="mi-caso"]');
    if (!abre || pedidoMiCaso) { return; }
    pedidoMiCaso = true;
    const s = document.createElement('script');
    s.src = 'assets/js/micaso.js';
    s.async = true;
    document.head.appendChild(s);
  }, true);

  /* ---------- CTA fija en móvil --------------------------------------------- */
  // Aparece cuando el hero queda arriba y se oculta mientras se ve el bloque
  // rojo final, que ya tiene su propio botón.
  const barra = document.getElementById('cta-fija');
  const hero = document.getElementById('hero');
  const cierre = document.getElementById('registra');
  if (barra && hero && tieneIO) {
    let heroArriba = false;
    let cierreVisible = false;
    const actualizar = () => {
      const visible = heroArriba && !cierreVisible;
      barra.classList.toggle('visible', visible);
      if (visible) { barra.removeAttribute('inert'); } else { barra.setAttribute('inert', ''); }
    };
    new IntersectionObserver((en) => {
      heroArriba = !en[0].isIntersecting && en[0].boundingClientRect.bottom < 0;
      actualizar();
    }, { threshold: 0 }).observe(hero);
    if (cierre) {
      new IntersectionObserver((en) => {
        cierreVisible = en[0].isIntersecting;
        actualizar();
      }, { threshold: 0.15 }).observe(cierre);
    }
  }
})();
