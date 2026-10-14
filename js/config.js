'use strict';
/*
 * Cloud accounts (Supabase). Leave url / anonKey empty to run without accounts (data stays on the phone).
 * The anon key is designed to be public: every table is protected by row-level security (supabase/schema.sql).
 * phone: true shows SMS login — only enable after configuring an SMS provider in Supabase.
 */
const CLOUD_CONFIG = {
  url: 'https://atpinhpsvsmgaansocse.supabase.co',
  anonKey: 'sb_publishable_GDIRySztsJqCohdFwGgIdw_vkeSNEKb',
  phone: false,
  // google: true shows 「使用 Google 登录」 — needs the Google provider enabled in Supabase (see README)
  google: true,
};
