// share-docs: public resolver for protected document share links.
// GET ?token=… → validates the link (exists, not revoked, not expired), logs the access,
// and returns the loan summary + 1-hour signed URLs for every document on the loan.
// Deployed with --no-verify-jwt: recipients are external institutions with no account;
// the capability is the unguessable 48-hex token, plus expiry and revocation.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: "invalid link" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: link } = await admin
    .from("share_links")
    .select("*, loans(loan_number, type, amount, collateral, customers(company)), orgs(name)")
    .eq("token", token)
    .single();
  if (!link) return json({ error: "This link is invalid." }, 404);
  if (link.revoked) return json({ error: "This link has been revoked by the lender." }, 410);
  if (new Date(link.expires_at) < new Date()) return json({ error: "This link has expired." }, 410);
  if (link.passcode) {
    const supplied = new URL(req.url).searchParams.get("passcode") ?? "";
    if (supplied !== link.passcode) return json({ needs_passcode: true, error: supplied ? "Incorrect passcode." : "This room requires a passcode." }, 401);
  }

  await admin.from("share_links")
    .update({ access_count: link.access_count + 1, last_accessed_at: new Date().toISOString() })
    .eq("id", link.id);

  let q = admin
    .from("documents")
    .select("id, filename, doc_type, storage_path, created_at")
    .eq("loan_id", link.loan_id)
    .order("created_at", { ascending: false });
  if (link.doc_ids?.length) q = q.in("id", link.doc_ids);
  const { data: docs } = await q;

  const files = [];
  for (const d of docs ?? []) {
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(d.storage_path, 3600);
    files.push({ filename: d.filename, doc_type: d.doc_type, uploaded: d.created_at, url: signed?.signedUrl ?? null });
  }

  return json({
    institution: link.institution,
    lender: link.orgs?.name,
    expires_at: link.expires_at,
    loan: {
      loan_number: link.loans?.loan_number, type: link.loans?.type, amount: link.loans?.amount,
      collateral: link.loans?.collateral, borrower: link.loans?.customers?.company,
    },
    files,
  });
});
