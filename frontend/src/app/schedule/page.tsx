"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, ChevronLeft } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { saveHostToken } from "@/lib/hostTokens";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MIN_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** yyyy-mm-dd in the user's local timezone */
function localDateString(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateString(d);
}

function getLocalTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
}

function tzOffset() {
  const off = new Date().getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

const inputCls =
  "w-full rounded border border-[#d8d8d8] bg-white px-3 py-2 text-sm text-[#232333] outline-none focus:border-[#0b5cff] focus:ring-1 focus:ring-[#0b5cff]";
const selectCls =
  "rounded border border-[#d8d8d8] bg-white px-2 py-2 text-sm text-[#232333] outline-none focus:border-[#0b5cff] cursor-pointer";
const labelCls = "block text-sm font-medium text-[#232333] min-w-[90px] shrink-0";

export default function SchedulePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(getTomorrow());
  const [time, setTime] = useState("10:30");
  const [ampm, setAmpm] = useState<"AM" | "PM">("AM");
  const [durationHr, setDurationHr] = useState(0);
  const [durationMin, setDurationMin] = useState(40);
  const [recurring, setRecurring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [scheduled, setScheduled] = useState<{ id: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const timezone = getLocalTimezone();

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Convert 12-hr picker to 24-hr for Date parsing
    const [hrStr, minStr] = time.split(":");
    let hr = parseInt(hrStr, 10);
    const min = parseInt(minStr || "0", 10);
    if (ampm === "PM" && hr !== 12) hr += 12;
    if (ampm === "AM" && hr === 12) hr = 0;
    const pad = (n: number) => String(n).padStart(2, "0");
    const localIso = `${date}T${pad(hr)}:${pad(min)}:00`;
    const startsAt = new Date(localIso);

    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      setError("Pick a date and time in the future.");
      return;
    }

    const totalMin = durationHr * 60 + durationMin;
    setLoading(true);
    try {
      const meeting = await api.scheduleMeeting({
        title: (title.trim() || "My Meeting"),
        description: description.trim() || null,
        scheduled_at: startsAt.toISOString(),
        duration: totalMin > 0 ? totalMin : undefined,
      });
      saveHostToken(meeting.id, meeting.host_token);
      setScheduled({ id: meeting.id, title: title.trim() || "My Meeting" });
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't schedule the meeting. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    if (!scheduled) return;
    navigator.clipboard.writeText(`${window.location.origin}/meeting/${scheduled.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (scheduled) {
    const inviteLink =
      typeof window !== "undefined"
        ? `${window.location.origin}/meeting/${scheduled.id}`
        : `/meeting/${scheduled.id}`;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-[#e8e8ee] bg-white px-8 py-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="mb-1 text-lg font-semibold text-[#0e0e1a]">Meeting Scheduled!</h2>
          <p className="mb-5 text-sm text-[#4a4f63]">{scheduled.title}</p>

          <div className="mb-4 rounded-xl bg-[#f7f8fa] px-4 py-3 text-left">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#4a4f63]">
              Meeting ID
            </p>
            <p className="font-mono text-sm font-semibold text-[#0e0e1a]">{scheduled.id}</p>
          </div>

          <div className="mb-6 rounded-xl bg-[#f7f8fa] px-4 py-3 text-left">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#4a4f63]">
              Invite Link
            </p>
            <p className="break-all font-mono text-xs text-[#0e0e1a]">{inviteLink}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#e8e8ee] py-2 text-sm font-medium text-[#232333] hover:bg-[#f0f1f5]"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => router.push("/")}
              className="flex-1 rounded-lg bg-[#0b5cff] py-2 text-sm font-semibold text-white hover:bg-[#0950e8]"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Schedule form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      {/* Zoom-style utility bar */}
      <div className="hidden h-9 shrink-0 items-center justify-end gap-6 bg-[#00051f] px-5 text-[13px] font-medium text-white md:flex">
        <span>Support</span>
        <span className="h-4 w-px bg-white/30" />
        <span>Contact Sales</span>
        <span>Request a Demo</span>
      </div>

      <div className="flex">
        {/* Left sidebar */}
        <aside className="hidden w-[200px] shrink-0 border-r border-[#e8e8ee] bg-[#f7f9fc] min-h-screen pt-3 px-1.5 md:block">
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-md px-3 py-[7px] text-left text-sm text-[#232333] hover:bg-[#f0f1f5]"
          >
            Home
          </button>
          <p className="px-1.5 pb-2 pt-5 text-xs text-[#4a4f63]">My Products</p>
          {["AI", "Meetings", "Recordings", "Summaries"].map((l) => (
            <button
              key={l}
              className={`w-full rounded-md px-3 py-[7px] pl-6 text-left text-sm hover:bg-[#f0f1f5] ${
                l === "Meetings" ? "bg-[#eaf1ff] text-[#0b5cff]" : "text-[#232333]"
              }`}
            >
              {l}
            </button>
          ))}
        </aside>

        {/* Main form area */}
        <main className="flex-1 px-6 py-8 md:px-12 md:py-10 max-w-3xl">
          {/* Back to Meetings link */}
          <button
            onClick={() => router.push("/")}
            className="mb-6 flex items-center gap-1 text-sm text-[#0b5cff] hover:underline"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Meetings
          </button>

          <h1 className="mb-8 text-2xl font-semibold text-[#0e0e1a]">Schedule Meeting</h1>

          <form onSubmit={handleSchedule} className="space-y-6 max-w-xl">
            {/* Topic */}
            <div className="flex items-start gap-4">
              <label className={`${labelCls} pt-2`}>
                <span className="text-[#e02b20] mr-0.5">*</span>Topic
              </label>
              <div className="flex-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My Meeting"
                  className={inputCls}
                />
                {!showDesc ? (
                  <button
                    type="button"
                    onClick={() => setShowDesc(true)}
                    className="mt-2 flex items-center gap-1 text-sm text-[#0b5cff] hover:underline"
                  >
                    + Add Description
                  </button>
                ) : (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Meeting description"
                    className={`${inputCls} mt-2 resize-none`}
                  />
                )}
              </div>
            </div>

            {/* When */}
            <div className="flex items-center gap-4">
              <label className={labelCls}>When</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={localDateString(new Date())}
                  className={`${selectCls} min-w-[140px]`}
                  required
                />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={`${selectCls} w-28`}
                  required
                />
                <select
                  value={ampm}
                  onChange={(e) => setAmpm(e.target.value as "AM" | "PM")}
                  className={`${selectCls} w-16`}
                >
                  <option>AM</option>
                  <option>PM</option>
                </select>
              </div>
            </div>

            {/* Duration */}
            <div className="flex items-center gap-4">
              <label className={labelCls}>Duration</label>
              <div className="flex items-center gap-2">
                <select
                  value={durationHr}
                  onChange={(e) => setDurationHr(Number(e.target.value))}
                  className={`${selectCls} w-16`}
                >
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <span className="text-sm text-[#232333]">hr</span>
                <select
                  value={durationMin}
                  onChange={(e) => setDurationMin(Number(e.target.value))}
                  className={`${selectCls} w-16`}
                >
                  {MIN_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="text-sm text-[#232333]">min</span>
              </div>
            </div>

            {/* Time Zone */}
            <div className="flex items-center gap-4">
              <label className={labelCls}>Time Zone</label>
              <select className={`${selectCls} w-72`} defaultValue={timezone}>
                <option value={timezone}>
                  (GMT{tzOffset()}) {timezone}
                </option>
              </select>
            </div>

            {/* Recurring */}
            <div className="flex items-center gap-4">
              <div className={labelCls} aria-hidden="true" />
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-[#232333]">
                <input
                  type="checkbox"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-[#d8d8d8] accent-[#0b5cff]"
                />
                Recurring meeting
              </label>
            </div>

            {error && (
              <div className="flex gap-4">
                <div className={labelCls} aria-hidden="true" />
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              </div>
            )}

            {/* Buttons — left-aligned, Zoom style */}
            <div className="flex items-center gap-4 pt-2">
              <div className={labelCls} aria-hidden="true" />
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded bg-[#0b5cff] px-7 py-2 text-sm font-semibold text-white hover:bg-[#0950e8] disabled:opacity-50 transition-colors"
                >
                  {loading ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="rounded border border-[#d8d8d8] bg-white px-7 py-2 text-sm font-medium text-[#232333] hover:bg-[#f0f1f5] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
