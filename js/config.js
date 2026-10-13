'use strict';
/*
 * Cloud accounts (Supabase). Leave url / anonKey empty to run without accounts (data stays on the phone).
 * The anon key is designed to be public: every table is protected by row-level security (supabase/schema.sql).
 * phone: true shows SMS login — only enable after configuring an SMS provider in Supabase.
 */
const CLOUD_CONFIG = {
  url: '',
  anonKey: '',
  phone: false,
};
