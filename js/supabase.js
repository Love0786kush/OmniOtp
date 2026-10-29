/**
 * OmniOTP Cloud - Supabase Client (browser-safe)
 *
 * Uses ONLY the Supabase anon/public key. Row Level Security (RLS) on the server
 * protects all data. The service-role key must NEVER be loaded here.
 */

(function () {
  'use strict';

  const SUPABASE_URL = (window.OMNI_ENV && window.OMNI_ENV.SUPABASE_URL) || '';
  const SUPABASE_ANON_KEY = (window.OMNI_ENV && window.OMNI_ENV.SUPABASE_ANON_KEY) || '';

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[OmniOTP Supabase] SUPABASE_URL/SUPABASE_ANON_KEY not configured. Supabase storage disabled.');
    window.supabaseClient = null;
    window.supabaseStorage = null;
    return;
  }

  let supabaseLib = null;
  try {
    supabaseLib = window.supabase || window.createClient || null;
  } catch (e) {
    console.warn('[OmniOTP Supabase] Could not locate supabase client library:', e.message);
  }

  if (!supabaseLib) {
    console.warn('[OmniOTP Supabase] @supabase/supabase-js not available globally. Supabase storage disabled.');
    window.supabaseClient = null;
    window.supabaseStorage = null;
    return;
  }

  const createClient = supabaseLib.createClient || supabaseLib.default || supabaseLib;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'omniotp-web' } }
  });

  /**
   * Minimal storage adapter so existing code (window.supabaseStorage.saveAll / saveAllRows)
   * keeps working while writing to real Supabase tables.
   */
  const supabaseStorage = {
    enabled: true,

    async saveAll(table, rows) {
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      return data || [];
    },

    async saveAllRows(table, rows) {
      return this.saveAll(table, rows);
    },

    async fetchAll(table, { filter, order = 'created_at', limit = 100 } = {}) {
      let q = supabase.from(table).select('*').order(order, { ascending: false }).limit(limit);
      if (filter) {
        const [col, op, val] = filter;
        q = q[col](op, val);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    async fetchOne(table, { column = 'id', value }) {
      const { data, error } = await supabase.from(table).select('*').eq(column, value).single();
      if (error) return null;
      return data;
    },

    async remove(table, { column = 'id', value }) {
      const { error } = await supabase.from(table).delete().eq(column, value);
      if (error) throw error;
      return { ok: true };
    }
  };

  window.supabaseClient = supabase;
  window.supabaseStorage = supabaseStorage;
  console.log('[OmniOTP Supabase] Initialized with anon key (RLS enforced)');
})();