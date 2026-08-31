"use client";

import { useEffect, useRef, useState } from "react";

import { getBrowserClient } from "@/lib/supabase/browser";

import styles from "./admin.module.css";

type RoundResponse = {
  ok: boolean;
  skipped?: boolean;
  waiting?: boolean;
  reason?: string;
  arrivals?: number;
  queuedArrivals?: number;
  rosterSize?: number;
  insertedMatches?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  error?: string;
};
type AdminMatch = { match_id: string; score: number; a_name: string; b_name: string; a_source: "seed" | "live"; b_source: "seed" | "live" };
type ShowControl = { mode: "live" | "fallback"; score_floor: number };

function describeResult(result: RoundResponse) {
  if (!result.ok) return "Round failed safely";
  if (result.waiting) return `Waiting for room (${result.rosterSize ?? 0})`;
  if (result.skipped) return result.reason === "round_in_flight" ? "Previous round still running" : "No new arrivals";
  const queued = result.queuedArrivals ? ` · ${result.queuedArrivals} queued` : "";
  return `${result.insertedMatches ?? 0} matches from ${result.arrivals ?? 0} arrivals${queued}`;
}

export function AdminPanel() {
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [lastResult, setLastResult] = useState<RoundResponse | null>(null);
  const [completedCalls, setCompletedCalls] = useState(0);
  const [responseCount, setResponseCount] = useState(0);
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [control, setControl] = useState<ShowControl>({ mode: "live", score_floor: 70 });
  const [floorInput, setFloorInput] = useState(70);
  const [testEmail, setTestEmail] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    let activeSubscription = true;
    async function loadDashboard() {
      const [nodes, publicMatches, showControl] = await Promise.all([
        supabase.from("public_nodes").select("*", { count: "exact", head: true }),
        supabase.from("public_matches").select("match_id,score,a_name,b_name,a_source,b_source"),
        supabase.from("show_control").select("mode,score_floor").eq("id", 1).single(),
      ]);
      if (!activeSubscription) return;
      if (!nodes.error) setResponseCount(nodes.count ?? 0);
      if (!publicMatches.error) setMatches(publicMatches.data as AdminMatch[]);
      if (!showControl.error) {
        const nextControl = showControl.data as ShowControl;
        setControl(nextControl);
        setFloorInput(nextControl.score_floor);
      }
    }
    void loadDashboard();
    const channel = supabase.channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "public_nodes" }, () => void loadDashboard())
      .on("postgres_changes", { event: "*", schema: "public", table: "public_matches" }, () => void loadDashboard())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "show_control", filter: "id=eq.1" }, () => void loadDashboard())
      .subscribe();
    return () => { activeSubscription = false; void supabase.removeChannel(channel); };
  }, []);

  async function updateShowControl(body: object, successStatus: string) {
    if (!password) return;
    setStatus("Updating screen");
    try {
      const response = await fetch("/api/show-control", { method: "POST", headers: { "content-type": "application/json", "x-admin-password": password }, body: JSON.stringify(body) });
      const result = await response.json() as { ok: boolean; control?: ShowControl };
      if (response.status === 401) { setStatus("Incorrect password"); return; }
      if (!result.ok || !result.control) { setStatus("Screen update failed safely"); return; }
      setControl(result.control);
      setFloorInput(result.control.score_floor);
      setStatus(successStatus);
    } catch { setStatus("Screen connection failed"); }
  }

  async function runAdminDataAction(action: "reset_matches" | "delete_live" | "start_seed_demo") {
    if (!password) return false;
    const labels = { reset_matches: "Removing all matches", delete_live: "Removing live submissions", start_seed_demo: "Starting seed responses" };
    setStatus(labels[action]);
    try {
      const response = await fetch("/api/admin-data", { method: "POST", headers: { "content-type": "application/json", "x-admin-password": password }, body: JSON.stringify({ action }) });
      const result = await response.json() as { ok: boolean; liveDeleted?: number };
      if (response.status === 401) { setStatus("Incorrect password"); return false; }
      if (!result.ok) { setStatus("Operation failed safely"); return false; }
      setStatus(action === "reset_matches" ? "All matches removed" : action === "delete_live" ? `${result.liveDeleted ?? 0} live submissions removed` : "Seed responses arriving");
      return true;
    } catch { setStatus("Operation connection failed"); return false; }
  }

  async function startSeedDemo() {
    setActive(false);
    if (!await runAdminDataAction("start_seed_demo")) return;
    window.setTimeout(async () => {
      setStatus("Matching seed responses");
      try {
        const response = await fetch("/api/match-round", { method: "POST", headers: { "x-admin-password": password } });
        const result = await response.json() as RoundResponse;
        setLastResult(result);
        setCompletedCalls((count) => count + 1);
        setStatus(describeResult(result));
      } catch { setStatus("Seed matching failed safely"); }
    }, 9_000);
  }

  async function warmUp() {
    if (!password) return;
    setStatus("Warming up matching");
    try {
      const response = await fetch("/api/match-round", { headers: { "x-admin-password": password } });
      const result = await response.json() as { ok: boolean; latencyMs?: number };
      if (response.status === 401) { setStatus("Incorrect password"); return; }
      setStatus(result.ok ? `Warm (${result.latencyMs ?? 0} ms)` : "Warm-up failed safely");
    } catch { setStatus("Warm-up connection failed"); }
  }

  async function sendTestEmail() {
    if (!password || !testEmail) return;
    setStatus(`Sending test mail to ${testEmail}`);
    try {
      const response = await fetch("/api/send-results", { method: "POST", headers: { "content-type": "application/json", "x-admin-password": password }, body: JSON.stringify({ testEmail }) });
      const result = await response.json() as { ok: boolean; messageId?: string; message?: string };
      if (response.status === 401) { setStatus("Incorrect password"); return; }
      setStatus(result.ok ? `Test mail accepted (${result.messageId ?? "no id"})` : `Test mail rejected: ${result.message ?? "unknown reason"}`);
    } catch { setStatus("Test mail connection failed"); }
  }

  async function runM5Action(endpoint: "finalize-matches" | "send-results") {
    if (!password) return;
    setActive(false);
    setStatus(endpoint === "finalize-matches" ? "Finalizing all matches" : "Sending result emails");
    try {
      const response = await fetch(`/api/${endpoint}`, { method: "POST", headers: { "x-admin-password": password } });
      const result = await response.json() as { ok: boolean; matched?: number; unresolved?: number; sent?: number; failed?: number };
      if (response.status === 401) { setStatus("Incorrect password"); return; }
      if (!result.ok) { setStatus(endpoint === "finalize-matches" ? "Finalize failed safely" : "Email send failed safely"); return; }
      setStatus(endpoint === "finalize-matches" ? `Finalized: ${result.matched ?? 0} matched, ${result.unresolved ?? 0} unresolved` : `Email: ${result.sent ?? 0} sent, ${result.failed ?? 0} failed`);
    } catch { setStatus("Operation connection failed"); }
  }

  const rankedMatches = [...matches].sort((left, right) => Number(right.a_source === "live" || right.b_source === "live") - Number(left.a_source === "live" || left.b_source === "live") || right.score - left.score);
  const guaranteeMatch = matches.find((match) => match.a_name === "Sasja" && match.b_name === "Yhore");

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    async function runRound() {
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus("Round running");
      try {
        const response = await fetch("/api/match-round", { method: "POST", headers: { "x-admin-password": password } });
        const result = await response.json() as RoundResponse;
        if (cancelled) return;
        if (response.status === 401) {
          setActive(false);
          setStatus("Incorrect password");
          return;
        }
        setLastResult(result);
        setCompletedCalls((count) => count + 1);
        setStatus(describeResult(result));
      } catch {
        if (!cancelled) setStatus("Connection failed; next round will retry");
      } finally {
        inFlight.current = false;
      }
    }

    void runRound();
    const interval = window.setInterval(() => void runRound(), 7_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [active, password]);

  return (
    <section className={styles.panel}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Construsoft Bootcamp</p><h1>Match control</h1></div>
        <span className={active ? styles.live : styles.stopped}>{active ? "Live" : "Stopped"}</span>
      </header>

      <label className={styles.passwordLabel} htmlFor="admin-password">Admin password</label>
      <input className={styles.password} id="admin-password" type="password" autoComplete="current-password" value={password} disabled={active} onChange={(event) => setPassword(event.target.value)} />

      <div className={styles.controlRow}>
        <div><strong>Matching rounds</strong><span>Every 7 seconds</span></div>
        <label className={styles.switch}>
          <input type="checkbox" checked={active} disabled={!password} onChange={(event) => setActive(event.target.checked)} aria-label="Toggle matching rounds" />
          <span />
        </label>
      </div>

      <div className={styles.demoActions}>
        <button className={styles.seedDemo} disabled={!password} onClick={() => void startSeedDemo()}>▶ Start seed demo</button>
        <button disabled={!password} onClick={() => void warmUp()}>Warm up</button>
        <button disabled={!password} onClick={() => { if (window.confirm("Remove every found match and reset active participants to new?")) void runAdminDataAction("reset_matches"); }}>Delete all matches</button>
        <button className={styles.danger} disabled={!password} onClick={() => { if (window.confirm("Permanently delete every live submission? Seed responses stay intact.")) void runAdminDataAction("delete_live"); }}>Delete live submissions</button>
      </div>

      <dl className={styles.metrics}>
        <div><dt>Status</dt><dd>{status}</dd></div>
        <div><dt>Responses / matches</dt><dd>{responseCount} / {matches.length}</dd></div>
        <div><dt>Completed calls</dt><dd>{completedCalls}</dd></div>
        <div><dt>Last latency</dt><dd>{lastResult?.latencyMs === undefined ? "-" : `${lastResult.latencyMs} ms`}</dd></div>
        <div><dt>Last token use</dt><dd>{lastResult ? `${lastResult.inputTokens ?? 0} in / ${lastResult.outputTokens ?? 0} out` : "-"}</dd></div>
      </dl>

      <div className={styles.screenControls}>
        <div className={styles.sectionHeading}><div><strong>Projector</strong><span>{control.mode === "fallback" ? "Local fallback active" : "Realtime data active"}</span></div><div className={styles.segmented}><button className={control.mode === "live" ? styles.selected : ""} disabled={!password} onClick={() => void updateShowControl({ action: "set_mode", mode: "live" }, "Live screen active")}>Live</button><button className={control.mode === "fallback" ? styles.selected : ""} disabled={!password} onClick={() => void updateShowControl({ action: "set_mode", mode: "fallback" }, "Fallback screen active")}>Fallback</button></div></div>
        <div className={styles.floorRow}><label htmlFor="score-floor">Reveal floor</label><input id="score-floor" type="number" min="0" max="100" value={floorInput} onChange={(event) => setFloorInput(Number(event.target.value))} /><button disabled={!password || floorInput < 0 || floorInput > 100} onClick={() => void updateShowControl({ action: "set_floor", scoreFloor: floorInput }, `Reveal floor set to ${floorInput}`)}>Apply</button></div>
        {guaranteeMatch ? <button className={styles.guarantee} disabled={!password} onClick={() => void updateShowControl({ action: "force_match", matchId: guaranteeMatch.match_id }, "Sasja / Yhore queued now")}>Feature Sasja / Yhore now</button> : null}
      </div>

      <div className={styles.queue}>
        <div className={styles.queueTitle}><strong>Top of reveal queue</strong><span>Live-involving first, then score</span></div>
        {rankedMatches.slice(0, 5).map((match) => <div className={styles.queueItem} key={match.match_id}><div><strong>{match.a_name} → {match.b_name}</strong><span>{match.a_source === "live" || match.b_source === "live" ? "Live" : "Seed"}</span></div><b>{match.score}%</b><button title={`Feature ${match.a_name} and ${match.b_name}`} aria-label={`Feature ${match.a_name} and ${match.b_name}`} disabled={!password} onClick={() => void updateShowControl({ action: "force_match", matchId: match.match_id }, `${match.a_name} / ${match.b_name} queued now`)}>▶</button></div>)}
      </div>

      <div className={styles.testMailRow}>
        <label htmlFor="test-email">Test mail</label>
        <input id="test-email" type="email" placeholder="you@gmail.com" autoComplete="off" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} />
        <button disabled={!password || !testEmail.includes("@")} onClick={() => void sendTestEmail()}>Send one test</button>
      </div>

      <div className={styles.finalActions}>
        <button disabled={!password} onClick={() => void runM5Action("finalize-matches")}>Finalize matches</button>
        <button disabled={!password} onClick={() => { if (window.confirm("Send personal result emails now? Already sent assignments will be skipped.")) void runM5Action("send-results"); }}>Send result emails</button>
      </div>
    </section>
  );
}