// Ianz Fitness · send-reminders
// Delivers the reminders each device scheduled in public.push_subs (Web Push / VAPID).
// Called every 5 minutes by pg_cron (supabase/push_cron.sql). Secrets (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are built in)
// Deploy with "Verify JWT" turned OFF — the x-cron-secret header protects it instead.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const STALE_MS = 2 * 3600e3; // a reminder more than 2 h late is skipped instead of sent

Deno.serve(async (req) => {
  if (!Deno.env.get('CRON_SECRET') || req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  webpush.setVapidDetails('https://github.com/EthanZhengy/ianz-fitness', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const now = new Date();
  const { data: subs, error } = await db.from('push_subs').select('*').eq('enabled', true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0, removed = 0;
  for (const s of subs ?? []) {
    const last = new Date(s.last_sent_at).getTime();
    const due = (Array.isArray(s.schedule) ? s.schedule : []).filter((m: { at: string }) => {
      const t = new Date(m.at).getTime();
      return t > last && t <= now.getTime() && now.getTime() - t < STALE_MS;
    }).slice(-3);
    if (!due.length) continue;
    let gone = false;
    for (const m of due) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: m.title, body: m.body, url: m.url || './', tag: m.tag || m.title }), { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { gone = true; break; } // subscription expired / app removed
        console.error('push failed', code, (e as Error).message);
      }
    }
    if (gone) { await db.from('push_subs').delete().eq('endpoint', s.endpoint); removed++; }
    else await db.from('push_subs').update({ last_sent_at: now.toISOString() }).eq('endpoint', s.endpoint);
  }
  return Response.json({ checked: subs?.length ?? 0, sent, removed });
});
