#!/usr/bin/env node
// Direct probe of Apollo to diagnose why find-contacts is returning zero people.
// Does NOT print the API key.

require("fs").readFileSync(".env.local", "utf-8").split(/\r?\n/).forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const APOLLO_BASE = "https://api.apollo.io/api/v1";
const key = process.env.APOLLO_API_KEY;
if (!key) { console.error("No APOLLO_API_KEY"); process.exit(1); }

async function post(path, body) {
  const res = await fetch(APOLLO_BASE + path, {
    method: "POST",
    headers: { "X-Api-Key": key, "content-type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

(async () => {
  for (const name of ["Bubble", "Bubble Skincare", "Topicals", "Naturium"]) {
    console.log(`\n========== ${name} ==========`);
    const orgRes = await post("/mixed_companies/search", { q_organization_name: name, page: 1, per_page: 5 });
    console.log(`org search status: ${orgRes.status}`);
    const orgs = orgRes.json.organizations ?? [];
    console.log(`orgs returned: ${orgs.length}`);
    orgs.slice(0, 3).forEach((o) => {
      console.log(`  - ${o.name}`);
      console.log(`      id:          ${o.id}`);
      console.log(`      domain:      ${o.primary_domain ?? o.website_url ?? "?"}`);
      console.log(`      industry:    ${o.industry ?? "(missing)"}`);
      console.log(`      keywords:    ${JSON.stringify(o.keywords ?? []).slice(0, 100)}`);
      console.log(`      short_desc:  ${(o.short_description ?? "(missing)").slice(0, 80)}`);
      console.log(`      all keys:    ${Object.keys(o).join(", ")}`);
    });
    if (orgs.length === 0) {
      console.log("  (no orgs — Apollo can't find this brand by name)");
      console.log("  error key in response?", JSON.stringify(orgRes.json).slice(0, 200));
      continue;
    }
    const pickedOrg = orgs[0];
    const peopleRes = await post("/mixed_people/api_search", {
      organization_ids: [pickedOrg.id],
      person_titles: ["influencer", "creator", "partnership", "community", "campus", "social media", "brand marketing"],
      page: 1,
      per_page: 10,
    });
    console.log(`people search status: ${peopleRes.status}`);
    const people = peopleRes.json.people ?? [];
    console.log(`people returned: ${people.length}`);
    if (people.length === 0 && peopleRes.json.error) {
      console.log(`  error: ${peopleRes.json.error}`);
    }
    if (people.length === 0 && !peopleRes.json.error) {
      console.log(`  full response keys: ${Object.keys(peopleRes.json).join(", ")}`);
      console.log(`  response snippet: ${JSON.stringify(peopleRes.json).slice(0, 300)}`);
    }
    people.slice(0, 3).forEach((p) => {
      console.log(`  - ${p.name ?? "?"} | ${p.title ?? "?"} | linkedin=${p.linkedin_url ?? "null"}`);
    });
  }
})();
