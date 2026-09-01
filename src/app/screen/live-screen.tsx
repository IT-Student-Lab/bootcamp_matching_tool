"use client";

import { useEffect, useRef, useState } from "react";

import { getBrowserClient } from "@/lib/supabase/browser";

import styles from "./screen.module.css";

type PublicNode = { participant_id: string; created_at: string; country: string | null; source: "seed" | "live"; name: string };
type PublicMatch = {
  match_id: string; created_at: string; participant_a: string; participant_b: string; score: number; reason: string;
  a_name: string; a_country: string | null; a_good_at: string; a_source: "seed" | "live";
  b_name: string; b_country: string | null; b_wants_to_learn: string; b_source: "seed" | "live"; shown_at: string | null;
};
type ShowControl = { id: number; mode: "live" | "fallback"; score_floor: number; forced_match_id: string | null; force_version: number };
type Point = { x: number; y: number; radius: number; born: number };

const FORCE_STORAGE_KEY = "bootcamp-force-version";
const SEED_DEMO_STORAGE_KEY = "bootcamp-seed-demo-version";
// Matches never render all at once, even when a backlog already exists on load — they trickle in on this cadence.
const LINE_REVEAL_INTERVAL_MS = 600;

const FALLBACK_NODE_COUNTRIES = ["Poland", "Chile", "Netherlands", "Hungary", "Spain", "Portugal", "Greece", "Netherlands"];
const FALLBACK_NODE_NAMES = ["Dominik", "Raquel", "Sasja", "Lilla", "Yhore", "Igor", "George", "Steven"];
const FALLBACK_NODES: PublicNode[] = FALLBACK_NODE_COUNTRIES.map((country, index) => ({
  participant_id: `fallback-${index}`,
  created_at: new Date(Date.UTC(2026, 8, 4, 8, 0, index)).toISOString(),
  country,
  name: FALLBACK_NODE_NAMES[index],
  source: index > 2 ? "live" : "seed",
}));
const FALLBACK_MATCHES: PublicMatch[] = [
  { match_id: "fallback-match-1", participant_a: "fallback-2", participant_b: "fallback-4", score: 92, a_name: "Sasja", a_country: "Netherlands", a_good_at: "Analysis, statistics and understanding what data really means", a_source: "seed", b_name: "Yhore", b_country: "Spain", b_wants_to_learn: "Analyzing sales data and identifying business trends in Power BI", b_source: "live", reason: "Strong analytical methods transfer directly to finding meaningful trends in sales data." },
  { match_id: "fallback-match-2", participant_a: "fallback-7", participant_b: "fallback-3", score: 90, a_name: "Steven", a_country: "Netherlands", a_good_at: "Optimizing processes with automation and avoiding manual work", a_source: "live", b_name: "Lilla", b_country: "Hungary", b_wants_to_learn: "Using AI and automation to reduce administrative work", b_source: "live", reason: "Process automation directly addresses the administrative work Lilla wants to reduce." },
  { match_id: "fallback-match-3", participant_a: "fallback-5", participant_b: "fallback-0", score: 88, a_name: "Igor", a_country: "Portugal", a_good_at: "Finding what should be explained in workflows and training material", a_source: "live", b_name: "Dominik", b_country: "Poland", b_wants_to_learn: "Creating e-learning content with AI agents", b_source: "live", reason: "Spotting missing explanations is exactly what useful e-learning content needs." },
  { match_id: "fallback-match-4", participant_a: "fallback-6", participant_b: "fallback-1", score: 80, a_name: "George", a_country: "Greece", a_good_at: "Listening and making people feel understood", a_source: "live", b_name: "Raquel", b_country: "Chile", b_wants_to_learn: "Clear communication skills", b_source: "live", reason: "Careful listening is a practical foundation for clearer communication." },
].map((match, index) => ({ ...match, created_at: new Date(Date.UTC(2026, 8, 4, 8, 1, index)).toISOString(), shown_at: null })) as PublicMatch[];

function hashFraction(value: string, salt: number) {
  let hash = 2166136261 ^ salt;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  // Without this avalanche step inputs differing by one bit keep near-identical high bits,
  // which collapses the node cloud onto a diagonal.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967295;
}

function placeNodes(nodes: PublicNode[], width: number, height: number) {
  const positions = new Map<string, Point>();
  const paddingX = Math.max(56, width * 0.055);
  const paddingTop = Math.max(100, height * 0.18);
  const paddingBottom = Math.max(64, height * 0.12);
  for (const node of nodes) {
    let point = { x: width / 2, y: height / 2, radius: 0, born: performance.now() };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      // Separate seed strings keep x and y independent; nearby salts alone correlate them into a diagonal.
      const x = paddingX + hashFraction(`${node.participant_id}:x`, attempt) * Math.max(1, width - paddingX * 2);
      const y = paddingTop + hashFraction(`${node.participant_id}:y`, attempt) * Math.max(1, height - paddingTop - paddingBottom);
      point = { x, y, radius: 0, born: performance.now() };
      if ([...positions.values()].every((existing) => Math.hypot(existing.x - x, existing.y - y) >= 34)) break;
    }
    positions.set(node.participant_id, point);
  }
  return positions;
}

function NetworkCanvas({ nodes, matches, topMatches, onSelect, onHoverNode }: { nodes: PublicNode[]; matches: PublicMatch[]; topMatches: PublicMatch[]; onSelect: (match: PublicMatch) => void; onHoverNode: (node: PublicNode | null, x: number, y: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let positions = new Map<string, Point>();
    let hitBoxes: { match: PublicMatch; x: number; y: number; width: number; height: number }[] = [];
    let width = 0;
    let height = 0;
    let frameErrorLogged = false;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      positions = placeNodes(nodes, width, height);
    }

    function draw(time: number) {
      try {
        context!.clearRect(0, 0, width, height);
        for (const match of matches) {
          const from = positions.get(match.participant_a);
          const to = positions.get(match.participant_b);
          if (!from || !to) continue;
          const midpointX = (from.x + to.x) / 2;
          const midpointY = (from.y + to.y) / 2 - Math.min(30, height * 0.035);
          const pulse = reduceMotion ? 0 : Math.max(0, Math.sin((time + hashFraction(match.match_id, 4) * 1000) / 420));
          context!.strokeStyle = `rgba(168,224,95,${(0.28 + pulse * 0.34).toFixed(3)})`;
          context!.lineWidth = match.score >= 85 ? 1.6 : 1;
          context!.beginPath();
          context!.moveTo(from.x, from.y);
          context!.quadraticCurveTo(midpointX, midpointY, to.x, to.y);
          context!.stroke();

          if (!reduceMotion) {
            const progress = ((time / 1800) + hashFraction(match.match_id, 9)) % 1;
            const inverse = 1 - progress;
            const pulseX = inverse * inverse * from.x + 2 * inverse * progress * midpointX + progress * progress * to.x;
            const pulseY = inverse * inverse * from.y + 2 * inverse * progress * midpointY + progress * progress * to.y;
            context!.fillStyle = "#c4f084";
            context!.beginPath();
            context!.arc(pulseX, pulseY, 2.5, 0, Math.PI * 2);
            context!.fill();
          }
        }

        for (const node of nodes) {
          const point = positions.get(node.participant_id);
          if (!point) continue;
          point.radius += (3.2 - point.radius) * 0.08;
          const glow = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin((time - point.born) / 900);
          const gradient = context!.createRadialGradient(point.x, point.y, 0, point.x, point.y, 10);
          gradient.addColorStop(0, `rgba(196,240,132,${0.55 + 0.25 * glow})`);
          gradient.addColorStop(1, "rgba(196,240,132,0)");
          context!.fillStyle = gradient;
          context!.beginPath(); context!.arc(point.x, point.y, 10, 0, Math.PI * 2); context!.fill();
          context!.fillStyle = "#eaf7d8";
          context!.beginPath(); context!.arc(point.x, point.y, point.radius, 0, Math.PI * 2); context!.fill();
        }

        hitBoxes = [];
        for (const match of topMatches) {
          const from = positions.get(match.participant_a);
          const to = positions.get(match.participant_b);
          if (!from || !to) continue;
          const cardWidth = 168;
          const cardHeight = 30;
          const x = Math.max(8, Math.min((from.x + to.x) / 2 - cardWidth / 2, width - cardWidth - 8));
          let y = Math.max(112, Math.min((from.y + to.y) / 2 - 42, height - cardHeight - 54));
          // Labels are clickable, so overlapping ones would make the target ambiguous.
          while (hitBoxes.some((box) => Math.abs(box.x - x) < cardWidth && Math.abs(box.y - y) < cardHeight + 4)) {
            y += cardHeight + 6;
          }
          context!.fillStyle = "rgba(24,24,22,.94)";
          context!.strokeStyle = "rgba(196,240,132,.65)";
          context!.lineWidth = 1;
          context!.beginPath(); context!.roundRect(x, y, cardWidth, cardHeight, 5); context!.fill(); context!.stroke();
          context!.fillStyle = "#eaf7d8";
          context!.font = '600 10px "Inter", sans-serif';
          const names = `${match.a_name} · ${match.b_name}`;
          context!.fillText(names.length > 20 ? `${names.slice(0, 19)}…` : names, x + 9, y + 19);
          context!.fillStyle = "#c4f084";
          context!.font = '700 10px "JetBrains Mono", monospace';
          context!.textAlign = "right";
          context!.fillText(`${match.score}%`, x + cardWidth - 8, y + 19);
          context!.textAlign = "left";
          hitBoxes.push({ match, x, y, width: cardWidth, height: cardHeight });
        }
      } catch (error) {
        // A broken frame must never stop the loop, and must never flood the console at 60fps.
        if (!frameErrorLogged) {
          frameErrorLogged = true;
          console.error("screen_canvas_frame_failed", error);
        }
      }
      frameRef.current = window.requestAnimationFrame(draw);
    }

    resize();
    const selectMatch = (event: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = [...hitBoxes].reverse().find((box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height);
      if (hit) onSelect(hit.match);
    };
    const hoverNode = (event: MouseEvent) => {
      const rect = canvas!.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const hit = nodes.find((node) => {
        const point = positions.get(node.participant_id);
        return point ? Math.hypot(point.x - x, point.y - y) <= 14 : false;
      });
      onHoverNode(hit ?? null, event.clientX, event.clientY);
    };
    const clearHover = () => onHoverNode(null, 0, 0);
    canvas.addEventListener("click", selectMatch);
    canvas.addEventListener("mousemove", hoverNode);
    canvas.addEventListener("mouseleave", clearHover);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frameRef.current = window.requestAnimationFrame(draw);
    return () => { canvas.removeEventListener("click", selectMatch); canvas.removeEventListener("mousemove", hoverNode); canvas.removeEventListener("mouseleave", clearHover); observer.disconnect(); window.cancelAnimationFrame(frameRef.current); };
  }, [matches, nodes, onSelect, onHoverNode, topMatches]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}

function MatchReveal({ match, canPrevious, canNext, onPrevious, onNext, onClose }: { match: PublicMatch; canPrevious: boolean; canNext: boolean; onPrevious: () => void; onNext: () => void; onClose: () => void }) {
  return <div className={styles.featureCard} onClick={onClose}>
    <button className={styles.closeReveal} type="button" aria-label="Close match" title="Close match" onClick={onClose}>×</button>
    <div className={styles.featureInner}>
      <div className={styles.person}>
        <div className={styles.personName}>{match.a_name}</div><div className={styles.personLocation}>{match.a_country ?? ""}</div>
        <div className={styles.personTag}>good at</div><div className={styles.personValue}>{match.a_good_at}</div>
      </div>
      <div className={styles.score}><div className={styles.percentage}>{match.score}%</div><div className={styles.matchWord}>match</div><div className={styles.reason}>“{match.reason}”</div></div>
      <div className={styles.person}>
        <div className={styles.personName}>{match.b_name}</div><div className={styles.personLocation}>{match.b_country ?? ""}</div>
        <div className={styles.personTag}>wants to learn</div><div className={styles.personValue}>{match.b_wants_to_learn}</div>
      </div>
    </div>
    <div className={styles.revealNavigation} onClick={(event) => event.stopPropagation()}><button type="button" disabled={!canPrevious} onClick={onPrevious}>← Previous</button><button type="button" onClick={onClose}>Close</button><button type="button" disabled={!canNext} onClick={onNext}>Next →</button></div>
  </div>;
}

export function LiveScreen() {
  const [nodes, setNodes] = useState<PublicNode[]>([]);
  const [matches, setMatches] = useState<PublicMatch[]>([]);
  const [control, setControl] = useState<ShowControl | null>(null);
  const [connected, setConnected] = useState(false);
  const [feature, setFeature] = useState<PublicMatch | null>(null);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [forcedFallback, setForcedFallback] = useState(false);
  const [seedVisibleCount, setSeedVisibleCount] = useState<number | null>(null);
  const [revealedMatchIds, setRevealedMatchIds] = useState<string[]>([]);
  const [hoveredNode, setHoveredNode] = useState<{ node: PublicNode; x: number; y: number } | null>(null);
  const lastForceVersionRef = useRef(0);
  const lastSeedDemoVersionRef = useRef(0);
  const knownMatchIdsRef = useRef<Set<string>>(new Set());
  const pendingMatchQueueRef = useRef<string[]>([]);

  useEffect(() => {
    setForcedFallback(new URLSearchParams(window.location.search).get("fallback") === "1");
    lastForceVersionRef.current = Number(localStorage.getItem(FORCE_STORAGE_KEY) ?? "0");
    lastSeedDemoVersionRef.current = Number(localStorage.getItem(SEED_DEMO_STORAGE_KEY) ?? "0");
  }, []);

  const fallbackMode = forcedFallback || control?.mode === "fallback";
  const liveNodes = nodes.filter((node) => node.source === "live");
  const seedNodes = nodes.filter((node) => node.source === "seed");
  const stagedNodes = seedVisibleCount === null ? nodes : [...seedNodes.slice(0, seedVisibleCount), ...liveNodes].sort((left, right) => left.created_at.localeCompare(right.created_at));
  const displayNodes = fallbackMode ? FALLBACK_NODES : stagedNodes;
  const displayMatches = fallbackMode ? FALLBACK_MATCHES : matches;
  const displayControl = fallbackMode ? { id: 1, mode: "fallback" as const, score_floor: 70, forced_match_id: null, force_version: 0 } : control;

  useEffect(() => {
    setFeature(null);
    // A mode switch restarts the reveal so lines never jump straight to their final state.
    knownMatchIdsRef.current = new Set();
    pendingMatchQueueRef.current = [];
    setRevealedMatchIds([]);
  }, [fallbackMode]);

  useEffect(() => {
    const source = fallbackMode ? FALLBACK_MATCHES : matches;
    const fresh = source
      .filter((match) => !knownMatchIdsRef.current.has(match.match_id))
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
    for (const match of fresh) {
      knownMatchIdsRef.current.add(match.match_id);
      pendingMatchQueueRef.current.push(match.match_id);
    }
  }, [matches, fallbackMode]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = pendingMatchQueueRef.current.shift();
      if (!next) return;
      setRevealedMatchIds((current) => (current.includes(next) ? current : [...current, next]));
    }, LINE_REVEAL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (forcedFallback) return;
    const supabase = getBrowserClient();
    let active = true;
    async function load() {
      const [nodeResult, matchResult, controlResult] = await Promise.all([
        supabase.from("public_nodes").select("*").order("created_at"),
        supabase.from("public_matches").select("*").order("created_at"),
        supabase.from("show_control").select("*").eq("id", 1).single(),
      ]);
      if (!active) return;
      if (!nodeResult.error) setNodes(nodeResult.data as PublicNode[]);
      if (!matchResult.error) setMatches(matchResult.data as PublicMatch[]);
      if (!controlResult.error) setControl(controlResult.data as ShowControl);
    }
    void load();
    const channel = supabase.channel("projector-screen")
      .on("postgres_changes", { event: "*", schema: "public", table: "public_nodes" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "public_matches" }, () => void load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "show_control", filter: "id=eq.1" }, (payload) => setControl(payload.new as ShowControl))
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [forcedFallback]);

  useEffect(() => {
    if (!control || control.force_version <= 0) return;
    if (control.forced_match_id && control.force_version > lastForceVersionRef.current) {
      const forced = matches.find((match) => match.match_id === control.forced_match_id);
      lastForceVersionRef.current = control.force_version;
      localStorage.setItem(FORCE_STORAGE_KEY, String(control.force_version));
      if (forced) {
        setFeature(forced);
        // Its line should already be on screen when the card pops up.
        setRevealedMatchIds((current) => (current.includes(forced.match_id) ? current : [...current, forced.match_id]));
      }
      return;
    }
    if (!control.forced_match_id && control.force_version > lastSeedDemoVersionRef.current) {
      lastSeedDemoVersionRef.current = control.force_version;
      localStorage.setItem(SEED_DEMO_STORAGE_KEY, String(control.force_version));
      setFeature(null);
      setSeedVisibleCount(0);
      knownMatchIdsRef.current = new Set();
      pendingMatchQueueRef.current = [];
      setRevealedMatchIds([]);
    }
  }, [control, matches]);

  useEffect(() => {
    if (seedVisibleCount === null || seedVisibleCount >= seedNodes.length) return;
    const timer = window.setTimeout(() => setSeedVisibleCount((count) => count === null ? null : count + 1), 520);
    return () => window.clearTimeout(timer);
  }, [seedNodes.length, seedVisibleCount]);

  useEffect(() => {
    let timer = window.setTimeout(() => setCursorHidden(true), 3_000);
    const showCursor = () => { setCursorHidden(false); window.clearTimeout(timer); timer = window.setTimeout(() => setCursorHidden(true), 3_000); };
    const fullscreen = (event: KeyboardEvent) => { if (event.key.toLowerCase() === "f" && !document.fullscreenElement) void document.documentElement.requestFullscreen(); };
    window.addEventListener("mousemove", showCursor);
    window.addEventListener("keydown", fullscreen);
    return () => { window.clearTimeout(timer); window.removeEventListener("mousemove", showCursor); window.removeEventListener("keydown", fullscreen); };
  }, []);

  const revealedIdSet = new Set(revealedMatchIds);
  const visibleMatches = displayMatches.filter((match) => revealedIdSet.has(match.match_id));
  const rankedMatches = visibleMatches.filter((match) => match.score >= (displayControl?.score_floor ?? 70)).sort((left, right) => right.score - left.score || left.created_at.localeCompare(right.created_at));
  const featureIndex = feature ? rankedMatches.findIndex((match) => match.match_id === feature.match_id) : -1;

  return <main className={`${styles.screen} ${cursorHidden ? styles.cursorHidden : ""}`}>
    <NetworkCanvas nodes={displayNodes} matches={visibleMatches} topMatches={rankedMatches.slice(0, 5)} onSelect={setFeature} onHoverNode={(node, x, y) => setHoveredNode(node ? { node, x, y } : null)} />
    <header className={styles.top}>
      <div><div className={styles.eyebrow}>Construsoft Bootcamp · Collective Intelligence</div><div className={styles.title}>reading the room, live</div></div>
      <div className={styles.stats}><div><strong>{displayNodes.length}</strong><span>answers in</span></div><div><strong>{visibleMatches.length}</strong><span>matches found</span></div></div>
    </header>
    <div className={styles.log}>{visibleMatches.slice(-4).reverse().map((match) => <div key={match.match_id}>&gt; match found · {match.score}%</div>)}</div>
    <div className={styles.brand}>CONSTRUSOFT BOOTCAMP <span>×</span> JODA AI</div>
    <span className={fallbackMode || connected ? styles.connectionOnline : styles.connectionOffline} title={fallbackMode ? "Fallback mode" : connected ? "Realtime connected" : "Realtime reconnecting"} />
    <button className={styles.fullscreen} type="button" title="Enter fullscreen" aria-label="Enter fullscreen" onClick={() => void document.documentElement.requestFullscreen()}>⛶</button>
    {hoveredNode ? <div className={styles.nodeTooltip} style={{ left: hoveredNode.x + 16, top: hoveredNode.y - 12 }}>{hoveredNode.node.name}</div> : null}
    {feature ? <MatchReveal match={feature} canPrevious={featureIndex > 0} canNext={featureIndex >= 0 && featureIndex < rankedMatches.length - 1} onPrevious={() => setFeature(rankedMatches[featureIndex - 1])} onNext={() => setFeature(rankedMatches[featureIndex + 1])} onClose={() => setFeature(null)} /> : null}
  </main>;
}