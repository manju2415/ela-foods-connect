// Equivalent of `npm audit --audit-level=high`, except that advisories listed
// in audit-allowlist.json (each with a written justification and a reviewBy
// date) are tolerated. Any other high/critical advisory, or an expired
// allowlist entry, fails the run.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);

const allowlist = JSON.parse(readFileSync(new URL('../audit-allowlist.json', import.meta.url), 'utf8')).advisories;
const today = new Date().toISOString().slice(0, 10);
const allowed = new Map(allowlist.map((entry) => [entry.id, entry]));

let raw;
try {
  raw = execSync('npm audit --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch (error) {
  // npm audit exits non-zero when it finds anything; the JSON is still on stdout.
  raw = error.stdout;
}
if (!raw) {
  console.error('npm audit produced no output');
  process.exit(1);
}
const report = JSON.parse(raw);
if (report.error) {
  console.error('npm audit failed:', report.error.summary || report.error);
  process.exit(1);
}

// Package-level severities are inherited from advisories, so checking every
// advisory object (the non-string `via` entries) covers transitive parents too.
const advisories = new Map();
for (const vuln of Object.values(report.vulnerabilities || {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string' || !BLOCKING.has(via.severity)) continue;
    const id = via.url.split('/').pop();
    advisories.set(`${id} ${via.name}`, { id, name: via.name, severity: via.severity, title: via.title, range: via.range });
  }
}

const failures = [];
const tolerated = [];
for (const advisory of advisories.values()) {
  const entry = allowed.get(advisory.id);
  if (!entry || entry.package !== advisory.name) failures.push(advisory);
  else if (entry.reviewBy < today) failures.push({ ...advisory, title: `${advisory.title} (allowlist entry expired ${entry.reviewBy})` });
  else tolerated.push(advisory);
}

const seen = new Set([...advisories.values()].map((a) => a.id));
for (const entry of allowlist) {
  if (!seen.has(entry.id)) console.warn(`note: allowlisted ${entry.id} (${entry.package}) is no longer reported; remove it from audit-allowlist.json`);
}

console.log('npm audit totals:', JSON.stringify(report.metadata.vulnerabilities));
for (const a of tolerated) console.log(`allowlisted ${a.severity}: ${a.name} ${a.range} ${a.id} - ${a.title}`);
for (const a of failures) console.error(`BLOCKING ${a.severity}: ${a.name} ${a.range} ${a.id} - ${a.title}`);

if (failures.length) {
  console.error(`\n${failures.length} high/critical advisory(ies) not covered by audit-allowlist.json`);
  process.exit(1);
}
console.log('\nNo unallowlisted high/critical advisories.');
