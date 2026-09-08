/* ==========================================================================
   NO ME LLAMEN MÁS · config.js
   Valores PÚBLICOS de configuración. Aquí no va ningún secreto: la clave
   secreta de Turnstile, la service role de Supabase y el token de Resend
   viven solo en el servidor (secretos de Supabase).
   ========================================================================== */
window.NMM = window.NMM || {};
window.NMM.config = {
  /* URL base de las funciones del backend, por ejemplo
     'https://xxxxxxxx.supabase.co/functions/v1'. Vacío = modo local: el
     formulario funciona completo pero no envía nada a ningún servidor. */
  apiBase: 'https://aqwjeqqndtuhtsafhzxv.supabase.co/functions/v1',

  /* Site key pública de Cloudflare Turnstile. Vacío = sin verificación
     antirrobots (solo aceptable en pruebas locales). */
  turnstileSiteKey: '0x4AAAAAAEsIuXXtNbj6R6rH',

  /* Versión del texto de autorización que acepta la persona (docs/03). */
  versionPolitica: '2026-09',

  /* Dirección que se comparte desde la pantalla de confirmación. */
  urlCanonica: 'https://nomellamenmas.com/'
};
