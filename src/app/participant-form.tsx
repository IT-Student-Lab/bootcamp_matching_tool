"use client";

import { useState, type FormEvent } from "react";

import { COUNTRIES } from "@/lib/countries";

const MAX_ANSWER_LENGTH = 300;
const HELPFUL_ANSWER_LENGTH = 15;

type AnswerFieldProps = {
  id: string;
  label: string;
  name: "goodAt" | "wantsToLearn";
  placeholder: string;
  helper?: string;
};

function AnswerField({ id, label, name, placeholder, helper }: AnswerFieldProps) {
  const [value, setValue] = useState("");
  const needsDetail = value.length > 0 && value.trim().length < HELPFUL_ANSWER_LENGTH;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} name={name} rows={3} maxLength={MAX_ANSWER_LENGTH} placeholder={placeholder} required value={value} onChange={(event) => setValue(event.target.value)} />
      {helper ? <p className="field-helper">{helper}</p> : null}
      <div className="field-meta">
        <span className={needsDetail ? "detail-note visible" : "detail-note"}>A little more detail will help us find a stronger match.</span>
        <span>{value.length}/{MAX_ANSWER_LENGTH}</span>
      </div>
    </div>
  );
}

export function ParticipantForm() {
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    const form = new FormData(event.currentTarget);
    const selectedCountry = String(form.get("country") ?? "");
    const resolvedCountry = selectedCountry === "Other" ? String(form.get("otherCountry") ?? "") : selectedCountry;
    const payload = {
      firstName: String(form.get("firstName") ?? ""), country: resolvedCountry,
      email: String(form.get("email") ?? ""), goodAt: String(form.get("goodAt") ?? ""),
      wantsToLearn: String(form.get("wantsToLearn") ?? ""), website: String(form.get("website") ?? ""),
    };

    try {
      const response = await fetch("/api/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        setError(response.status === 429 ? "Too many attempts. Please try again later." : "We couldn't submit your answer. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("success");
    } catch {
      setError("We couldn't submit your answer. Please try again.");
      setStatus("idle");
    }
  }

  if (status === "success") {
    return <section className="success" aria-live="polite"><div className="success-ring" aria-hidden="true"><span /></div><h1>You&apos;re in.</h1><p>We&apos;re reading every answer in the room, in every language. Check your email during the break — your match will be waiting.</p></section>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="eyebrow">Construsoft Bootcamp · Live Matchmaker</div>
      <h1>What do you know? What do you want to know?</h1>
      <p className="form-intro">Two short answers. We&apos;ll find who in this room is your match — and email it to you at the break.</p>
      <div className="field-row">
        <div className="field"><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" type="text" autoComplete="given-name" maxLength={80} required /></div>
        <div className="field"><label htmlFor="country">Country</label><select id="country" name="country" required value={country} onChange={(event) => setCountry(event.target.value)}><option value="" disabled>Select</option>{COUNTRIES.map((option) => <option key={option}>{option}</option>)}<option>Other</option></select></div>
      </div>
      {country === "Other" ? <div className="field"><label htmlFor="otherCountry">Your country</label><input id="otherCountry" name="otherCountry" type="text" maxLength={80} required /></div> : null}
      <AnswerField id="goodAt" name="goodAt" label="1. What's something you're genuinely good at? It could be a skill a way of working or something that you are very confident with using." placeholder="Turning campaign numbers into decisions" />
      <AnswerField id="wantsToLearn" name="wantsToLearn" label="2. What’s one work-related skill, tool or topic you’d like to learn more about?" placeholder="How to build a sales dashboard that people actually use" helper="Name the task, not just the tool. 'Using AI to draft customer replies' finds you a match — 'AI' can't." />
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
      <div className="honeypot" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" /></div>
      <p className="privacy-notice">Your first name, country and answers may be shown on the bootcamp screen during this session.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="submit-button" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Submitting…" : "Find my match →"}</button>
    </form>
  );
}
