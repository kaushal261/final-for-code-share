/**
 * supabaseClient.js
 * ---------------------------------------------------------------------------
 * Creates a single shared Supabase client for the whole app.
 * Relies on window.SUPABASE_CONFIG, which is provided by assets/js/config.js
 * (auto-generated at build time from environment variables — see build.js).
 *
 * Load order in every HTML page must be:
 *   1. Supabase CDN script
 *   2. assets/js/config.js
 *   3. assets/js/supabaseClient.js
 *   4. page-specific script (auth.js / admin.js / student.js)
 * ---------------------------------------------------------------------------
 */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};

  if (!cfg.url || !cfg.anonKey || cfg.url.includes('YOUR-PROJECT-REF')) {
    console.error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY ' +
      '(Netlify env vars) or fill assets/js/config.js for local development.'
    );
  }

  // window.supabase is provided by the Supabase CDN <script> tag.
  window.sbClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
