// run-rules: delinquency outreach engine. For every org: find payments past due, match enabled
// rules by days-past-due threshold, and send templated email/SMS to the borrower — once per
// (rule, payment, channel), so re-runs are idempotent and safe. Invoked daily by pg_cron and
// on demand from the UI. Providers fall back to "simulated" logging until keys are set.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const daysLate = (due: string) => Math.floor((Date.now() - new Date(due + "T00:00:00Z").getTime()) / 86400000);

async function deliver(channel: "email" | "sms", recipient: string, subject: string | null, body: string) {
  if (channel === "email" && Deno.env.get("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("OUTREACH_FROM_EMAIL") ?? "CRE Screener <onboarding@resend.dev>", to: [recipient], subject: subject ?? "(no subject)", text: body }),
    });
    const out = await r.json();
    return r.ok ? { status: "sent", provider_id: out.id ?? null, error: null } : { status: "failed", provider_id: null, error: out.message ?? JSON.stringify(out) };
  }
  if (channel === "sms" && Deno.env.get("TWILIO_ACCOUNT_SID")) {
    const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: recipient, From: Deno.env.get("TWILIO_FROM_NUMBER") ?? "", Body: body }),
    });
    const out = await r.json();
    return r.ok ? { status: "sent", provider_id: out.sid ?? null, error: null } : { status: "failed", provider_id: null, error: out.message ?? JSON.stringify(out) };
  }
  return { status: "simulated", provider_id: null, error: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const today = new Date().toISOString().slice(0, 10);

  const { data: overdue } = await admin
    .from("loan_payments")
    .select("id, org_id, loan_id, due_date, amount, status, loans(loan_number, customer_id, customers(name, company, email, phone)), orgs:org_id(name)")
    .neq("status", "paid")
    .lt("due_date", today);
  const { data: rules } = await admin.from("outreach_rules").select("*").eq("enabled", true);

  let sent = 0, skipped = 0;
  const actions: string[] = [];

  for (const p of overdue ?? []) {
    const late = daysLate(p.due_date);
    // Escalate stored status as it ages (due → late → missed at 10+ days).
    const shouldBe = late >= 10 ? "missed" : "late";
    if (p.status !== shouldBe) await admin.from("loan_payments").update({ status: shouldBe }).eq("id", p.id);

    const cust = (p.loans as { customers?: { name?: string; company?: string; email?: string; phone?: string } } | null)?.customers;
    const loanNumber = (p.loans as { loan_number?: string } | null)?.loan_number ?? "";
    const lender = (p.orgs as { name?: string } | null)?.name ?? "your lender";

    for (const r of (rules ?? []).filter(r => r.org_id === p.org_id && late >= r.days_past_due)) {
      const channels: ("email" | "sms")[] = r.channel === "both" ? ["email", "sms"] : [r.channel];
      for (const ch of channels) {
        const recipient = ch === "email" ? cust?.email : cust?.phone;
        if (!recipient) continue;
        const { count } = await admin.from("outreach_attempts")
          .select("id", { count: "exact", head: true })
          .eq("rule_id", r.id).eq("payment_id", p.id).eq("channel", ch);
        if (count && count > 0) { skipped++; continue; }

        const fill = (t: string) => t
          .replaceAll("{{name}}", cust?.name ?? "there").replaceAll("{{company}}", cust?.company ?? "")
          .replaceAll("{{loan_number}}", loanNumber).replaceAll("{{amount}}", money(Number(p.amount)))
          .replaceAll("{{due_date}}", p.due_date).replaceAll("{{days_late}}", String(late))
          .replaceAll("{{lender}}", lender);
        const subject = ch === "email" && r.subject ? fill(r.subject) : null;
        const body = fill(r.body);
        const res = await deliver(ch, recipient, subject, body);
        await admin.from("outreach_attempts").insert({
          org_id: p.org_id, customer_id: (p.loans as { customer_id?: string } | null)?.customer_id ?? null,
          channel: ch, recipient, subject, body,
          status: res.status, provider_id: res.provider_id, error: res.error,
          rule_id: r.id, payment_id: p.id,
        });
        sent++;
        actions.push(`${loanNumber}: ${ch} to ${recipient} (${late}d late, rule ${r.days_past_due}d, ${res.status})`);
      }
    }
  }
  return json({ overdue: overdue?.length ?? 0, sent, skipped_already_sent: skipped, actions });
});
