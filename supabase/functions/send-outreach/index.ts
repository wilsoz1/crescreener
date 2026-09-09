// send-outreach: sends an email (Resend) or SMS (Twilio) on behalf of the caller and logs the
// attempt. Missing provider keys → the attempt is logged with status "simulated" so the product
// flow works before accounts exist. Secrets: RESEND_API_KEY, OUTREACH_FROM_EMAIL,
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { org_id, customer_id, channel, recipient, subject, body } = await req.json();
    if (!org_id || !channel || !recipient || !body) return json({ error: "missing fields" }, 400);

    // Caller-scoped client: RLS enforces org membership on the insert.
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData.user) return json({ error: "not authenticated" }, 401);

    let status = "simulated", provider_id: string | null = null, error: string | null = null;

    if (channel === "email" && Deno.env.get("RESEND_API_KEY")) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("OUTREACH_FROM_EMAIL") ?? "CRE Screener <onboarding@resend.dev>",
          to: [recipient], subject: subject ?? "(no subject)", text: body,
        }),
      });
      const out = await r.json();
      if (r.ok) { status = "sent"; provider_id = out.id ?? null; }
      else { status = "failed"; error = out.message ?? JSON.stringify(out); }
    } else if (channel === "sms" && Deno.env.get("TWILIO_ACCOUNT_SID")) {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(`${sid}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: recipient, From: Deno.env.get("TWILIO_FROM_NUMBER") ?? "", Body: body }),
      });
      const out = await r.json();
      if (r.ok) { status = "sent"; provider_id = out.sid ?? null; }
      else { status = "failed"; error = out.message ?? JSON.stringify(out); }
    }

    const { data: row, error: insErr } = await supa
      .from("outreach_attempts")
      .insert({ org_id, customer_id, channel, recipient, subject, body, status, provider_id, error, created_by: userData.user.id })
      .select()
      .single();
    if (insErr) return json({ error: insErr.message }, 403);
    return json({ attempt: row });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
