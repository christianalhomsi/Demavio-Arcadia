// k6 load test for the anonymous browse path (halls -> devices -> busy slots).
// NEVER point this at production. Use an isolated staging Supabase project with synthetic data.
//   k6 run -e SUPABASE_URL=https://<staging>.supabase.co -e ANON_KEY=<staging publishable key> \
//          -e HALL_ID=<synthetic hall uuid> -e STAGE=100 load/k6-public-browse.js
// STAGE is the peak virtual-user count; run it at 100, 500, 1000, 3000, 5000, 10000 in turn. Virtual users
// think for 1-4 s between steps, so requests/second is far lower than the VU count: report both.
// Authenticated flows (login, bookings, sessions, wallets) are NOT covered here; they need synthetic accounts.
import http from "k6/http";
import { check, sleep } from "k6";

const STAGE = Number(__ENV.STAGE || 100);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const options = {
  stages: [
    { duration: "2m", target: STAGE },
    { duration: "5m", target: STAGE },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    // Any failed check (including "hall has devices") fails the run.
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<800", "p(99)<2000"] },
};

// Fail fast on bad input instead of running a meaningless test.
export function setup() {
  if (!Number.isInteger(STAGE) || STAGE < 1) throw new Error("STAGE must be a positive integer");
  if (!__ENV.SUPABASE_URL || !__ENV.ANON_KEY) throw new Error("SUPABASE_URL and ANON_KEY are required");
  if (!UUID.test(__ENV.HALL_ID || "")) throw new Error("HALL_ID must be a hall uuid");
  // Abort before load starts if the hall has no devices: the busy-slot step could not be exercised.
  const res = http.post(`${__ENV.SUPABASE_URL}/rest/v1/rpc/list_public_devices`, JSON.stringify({ p_hall_id: __ENV.HALL_ID }), {
    headers: { apikey: __ENV.ANON_KEY, Authorization: `Bearer ${__ENV.ANON_KEY}`, "Content-Type": "application/json" },
  });
  if (res.status !== 200 || res.json().length === 0) throw new Error("HALL_ID has no active devices (or the call failed)");
}

const base = __ENV.SUPABASE_URL;
const headers = { apikey: __ENV.ANON_KEY, Authorization: `Bearer ${__ENV.ANON_KEY}`, "Content-Type": "application/json" };
const rpc = (name, body) => http.post(`${base}/rest/v1/rpc/${name}`, JSON.stringify(body), { headers, tags: { name } });

export default function () {
  const hall = __ENV.HALL_ID;
  check(rpc("list_public_halls", {}), { "halls 200": (r) => r.status === 200 });
  sleep(1 + Math.random() * 3);
  const devices = rpc("list_public_devices", { p_hall_id: hall });
  check(devices, { "devices 200": (r) => r.status === 200 });
  sleep(1 + Math.random() * 3);
  const list = devices.status === 200 ? devices.json() : [];
  // A hall with no devices must fail the run, not silently skip the busy-slot step.
  check(list, { "hall has devices": (l) => l.length > 0 });
  if (list.length > 0) {
    const from = new Date();
    const to = new Date(from.getTime() + 24 * 3600 * 1000);
    const device = list[Math.floor(Math.random() * list.length)].id;
    check(rpc("list_public_device_busy", { p_device_id: device, p_from: from.toISOString(), p_to: to.toISOString() }), {
      "busy 200": (r) => r.status === 200,
    });
    sleep(1 + Math.random() * 3);
  }
}
