"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Video, Plus, Calendar, Copy, Link2, Clock, Trash2, MoreHorizontal, Search,
  Menu, History, ExternalLink, ChevronRight, ChevronDown, MessageCircle,
} from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { getHostToken, removeHostToken, saveHostToken } from "@/lib/hostTokens";
import type { Meeting, RecentMeeting } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatMeetingTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
type Tab = "home" | "meetings" | "history";

/**
 * Row actions that appear on hover. Only devices that can hover get the hide-until-hover
 * behaviour; on touch screens (phones, tablets) they stay visible, since there is no hover.
 */
const REVEAL_ON_HOVER =
  "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100";

/** Placeholder identity until sign-in exists; the name and photo will come from the account. */
const GUEST = { name: "Guest", plan: "Basic" };

function ZoomWordmark() {
  return (
    <span
      className="select-none text-[32px] font-black lowercase leading-none tracking-tight text-[#0b5cff]"
      aria-label="Zoom"
    >
      zoom
    </span>
  );
}

function GuestAvatar({ size }: { size: number }) {
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.2),
        fontSize: size * 0.42,
        background: "linear-gradient(135deg,#6a7fdb,#2d3a8c)",
      }}
    >
      {GUEST.name[0]}
    </div>
  );
}

// ─── Utility strip + main nav ─────────────────────────────────────────────────
function UtilityBar() {
  return (
    <div className="hidden h-[39px] shrink-0 items-center justify-end gap-6 bg-[#00051f] px-5 text-[13px] font-medium text-white md:flex">
      <span className="flex items-center gap-1.5">
        <Search className="h-[18px] w-[18px]" strokeWidth={2.2} /> Search
      </span>
      <span>Support</span>
      <span>1.888.799.9666</span>
      <span className="h-4 w-px bg-white/30" />
      <span>Contact Sales</span>
      <span>Request a Demo</span>
    </div>
  );
}

function NavBar({
  onMenu,
  onHost,
  onJoin,
  onSchedule,
}: {
  onMenu: () => void;
  onHost: () => void;
  onJoin: () => void;
  onSchedule: () => void;
}) {
  const link = "text-[15px] text-[#4a4f63] hover:text-[#0b5cff]";
  const action = "flex items-center gap-0.5 text-[15px] font-semibold text-[#4a4f63] hover:text-[#0b5cff]";
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#e8e9ee] bg-white px-3 sm:px-6">
      <div className="flex items-center gap-8">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#4a4f63] hover:bg-portal-hover md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <ZoomWordmark />
        <nav className="hidden items-center gap-9 lg:flex">
          <span className={link}>Products</span>
          <span className={link}>Solutions</span>
          <span className={link}>Resources</span>
          <span className={link}>Plans &amp; Pricing</span>
        </nav>
      </div>
      <div className="flex items-center gap-4 sm:gap-7">
        <button onClick={onSchedule} className={`${action} hidden sm:flex`}>Schedule</button>
        <button onClick={onJoin} className={`${action} hidden sm:flex`}>Join</button>
        <button onClick={onHost} className={`${action} hidden sm:flex`}>
          Host <ChevronDown className="h-4 w-4" />
        </button>
        <span className={`${action} hidden sm:flex`}>
          Web App <ChevronDown className="h-4 w-4" />
        </span>
        <GuestAvatar size={32} />
      </div>
    </header>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
/** `tab` items switch the dashboard view; the rest are labels for now. */
const PRODUCTS: { label: string; tab?: Tab; isNew?: boolean; external?: boolean }[] = [
  { label: "AI", isNew: true, external: true },
  { label: "Meetings", tab: "meetings" },
  { label: "History", tab: "history" },
  { label: "Recordings" },
  { label: "Summaries" },
  { label: "Hub", isNew: true, external: true },
  { label: "Whiteboards", external: true },
  { label: "Notes" },
  { label: "Clips", external: true },
  { label: "Canvas", external: true },
  { label: "Paper", external: true },
  { label: "Sheets", external: true },
  { label: "Slides", external: true },
  { label: "Tasks", external: true },
  { label: "Scheduler", external: true },
  { label: "Discover More Products" },
];

function Sidebar({
  active,
  onChange,
  open,
  onClose,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  /** Small screens only: whether the off-canvas drawer is showing. */
  open: boolean;
  onClose: () => void;
}) {
  const row = "flex w-full items-center justify-between rounded-md px-3 py-[7px] text-left text-sm";
  const go = (t: Tab) => {
    onChange(t);
    onClose();
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-[300px] shrink-0 flex-col overflow-y-auto bg-[#f7f9fc] px-1.5 pb-6 pt-3 transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => go("home")}
          className={`${row} ${active === "home" ? "bg-[#eaf1ff] text-[#0b5cff]" : "text-[#232333] hover:bg-portal-hover"}`}
        >
          Home
        </button>

        <p className="px-1.5 pb-2 pt-5 text-xs text-[#4a4f63]">My Products</p>
        <div className="space-y-px">
          {PRODUCTS.map(({ label, tab, isNew, external }) => {
            const isActive = tab !== undefined && active === tab;
            return (
              <button
                key={label}
                onClick={tab ? () => go(tab) : undefined}
                className={`${row} pl-6 ${
                  isActive ? "bg-[#eaf1ff] text-[#0b5cff]" : "text-[#232333] hover:bg-portal-hover"
                } ${tab ? "" : "cursor-default"}`}
              >
                {label}
                <span className="flex items-center gap-2">
                  {isNew && (
                    <span className="rounded-full border border-[#0b5cff] bg-[#eaf1ff] px-1.5 text-[10px] font-semibold leading-4 text-[#0b5cff]">
                      New
                    </span>
                  )}
                  {external && <ExternalLink className="h-4 w-4 text-[#4a4f63]" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-px">
          {["My Account", "Admin", "Support"].map((label) => (
            <div
              key={label}
              className="flex cursor-default items-center gap-2 rounded-md px-1.5 py-[7px] text-sm text-[#232333]"
            >
              <ChevronRight className="h-3.5 w-3.5 text-[#4a4f63]" />
              {label}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}

// ─── Quick actions (New meeting / Join / Schedule) ───────────────────────────
function QuickActions({
  onNewMeeting,
  onJoin,
  onSchedule,
  starting,
}: {
  onNewMeeting: () => void;
  onJoin: () => void;
  onSchedule: () => void;
  starting: boolean;
}) {
  const tile = "flex h-[50px] w-[50px] items-center justify-center rounded-xl text-white";
  const item = "flex w-[80px] flex-col items-center gap-2 disabled:opacity-60";
  const label = "text-xs font-semibold text-[#4a4f63] whitespace-nowrap";
  return (
    <div className="flex items-start justify-center gap-5">
      {/* 1. New meeting — orange, with caret (matches Zoom exactly) */}
      <button onClick={onNewMeeting} disabled={starting} className={item}>
        <span className={`${tile} relative bg-[#ff742e]`}>
          <Video className="h-6 w-6" fill="currentColor" />
        </span>
        <span className={`${label} flex items-center gap-0.5`}>
          {starting ? "Starting…" : "New meeting"}
          <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
        </span>
      </button>

      {/* 2. Join — blue */}
      <button onClick={onJoin} className={item}>
        <span className={`${tile} bg-[#0e72ed]`}>
          <Plus className="h-6 w-6" strokeWidth={2.5} />
        </span>
        <span className={label}>Join</span>
      </button>

      {/* 3. Schedule — blue calendar */}
      <button onClick={onSchedule} className={item}>
        <span className={`${tile} relative bg-[#0e72ed]`}>
          <Calendar className="h-6 w-6" strokeWidth={2} />
          <span className="absolute top-[22px] text-[8px] font-bold leading-none">
            {new Date().getDate()}
          </span>
        </span>
        <span className={label}>Schedule</span>
      </button>
    </div>
  );
}

/** Isometric open box shown when a list is empty. */
function EmptyBox() {
  return (
    <svg width="150" height="100" viewBox="0 0 150 100" fill="none" aria-hidden="true">
      <polygon points="75,8 132,28 75,48 18,28" fill="#cfe1ff" />
      <polygon points="18,28 75,48 75,96 18,74" fill="#1a73e8" />
      <polygon points="132,28 75,48 75,96 132,74" fill="#3b8cf7" />
      <polygon points="18,28 44,18 75,36 52,44" fill="#e7f0ff" />
      <polygon points="132,28 106,18 75,36 98,44" fill="#a8caff" />
    </svg>
  );
}

// ─── Upcoming Meeting Card ────────────────────────────────────────────────────
function UpcomingCard({
  meeting,
  onStart,
  onCopyLink,
  onDelete,
}: {
  meeting: Meeting;
  onStart: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);

  return (
    <div className="group flex flex-col gap-3 rounded-xl bg-portal-card px-4 py-3.5 shadow-sm border border-portal-border sm:flex-row sm:items-center sm:justify-between">
      {/* Left: time bar */}
      <div className="flex min-w-0 items-start gap-4">
        <div className="flex w-16 shrink-0 flex-col items-center rounded-lg border border-portal-border bg-portal-bg py-1.5 text-center">
          <span className="text-[11px] font-medium uppercase text-text-label">
            {new Date(meeting.scheduled_at!).toLocaleDateString([], { month: "short" })}
          </span>
          <span className="text-xl font-bold text-text-on-light leading-tight">
            {new Date(meeting.scheduled_at!).getDate()}
          </span>
        </div>
        <div>
          <p className="font-semibold text-text-on-light">{meeting.title}</p>
          <p className="mt-0.5 text-xs text-text-label">
            {formatMeetingTime(meeting.scheduled_at!)} · {meeting.duration ?? 60} min
          </p>
          <p className="mt-0.5 text-xs text-text-label">
            Meeting ID: <span className="font-mono">{meeting.id}</span>
          </p>
        </div>
      </div>

      {/* Right: actions */}
      <div className={`flex shrink-0 items-center gap-2 transition-opacity ${REVEAL_ON_HOVER}`}>
        <button
          onClick={onCopyLink}
          title="Copy invite link"
          className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-portal-border px-2.5 text-xs font-medium text-text-label hover:bg-portal-hover"
        >
          <Link2 className="h-3.5 w-3.5" /> Copy Link
        </button>
        <button
          onClick={onStart}
          className="rounded-lg bg-zoom-blue px-4 py-1.5 text-xs font-semibold text-white hover:bg-zoom-blue-hover"
        >
          Start
        </button>
        <div className="relative">
          <button
            onClick={() => setMenu(v => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-label hover:bg-portal-hover"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl bg-portal-card shadow-lg border border-portal-border py-1">
                <button
                  onClick={() => { setMenu(false); onDelete(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-leave hover:bg-portal-hover"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Recent Meeting Row ───────────────────────────────────────────────────────
function RecentRow({ meeting }: { meeting: RecentMeeting }) {
  return (
    <div className="group flex items-center justify-between gap-3 rounded-xl bg-portal-card px-4 py-3 border border-portal-border">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zoom-blue-light text-zoom-blue">
          <Clock className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-medium text-text-on-light">{meeting.title}</p>
          <p className="text-xs text-text-label">
            {formatRelative(meeting.ended_at)}
            {meeting.duration_minutes ? ` · ${meeting.duration_minutes} min` : ""}
            {" · "}ID: <span className="font-mono">{meeting.meeting_id}</span>
          </p>
        </div>
      </div>
      <button
        onClick={() => copyText(`${window.location.origin}/meeting/${meeting.meeting_id}`)}
        className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-portal-border px-2 text-xs text-text-label hover:bg-portal-hover transition-opacity ${REVEAL_ON_HOVER}`}
      >
        <Copy className="h-3.5 w-3.5" /> Copy Link
      </button>
    </div>
  );
}

// ─── Home Tab ─────────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg bg-white shadow-[0_1px_8px_rgba(20,30,70,0.10)] ${className}`}>
      {children}
    </section>
  );
}

function HomeTab({
  upcoming,
  recent,
  onNewMeeting,
  onJoin,
  onSchedule,
  onStart,
  onVisitMeetings,
  starting,
}: {
  upcoming: Meeting[];
  recent: RecentMeeting[];
  onNewMeeting: () => void;
  onJoin: () => void;
  onSchedule: () => void;
  onStart: (id: string) => void;
  onVisitMeetings: () => void;
  starting: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6 lg:flex-row lg:items-start">
      {/* Left column: profile + recent activity */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <GuestAvatar size={80} />
            <div>
              <h1 className="text-[26px] font-semibold leading-tight text-[#0e0e1a]">{GUEST.name}</h1>
              <p className="text-sm text-[#4a4f63]">
                Plan: <span className="font-medium text-[#0e0e1a]">{GUEST.plan}</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-4">
            <span className="cursor-default rounded-full bg-[#eef2fb] px-5 py-1.5 text-[13px] text-[#0b5cff]">
              Manage Plan
            </span>
            <span className="cursor-default text-[13px] text-[#0b5cff]">View Plan Details</span>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="border-b border-[#e8e9ee] pb-4 text-2xl font-semibold text-[#0e0e1a]">
            Recent activity
          </h2>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-9 pb-14 pt-12">
              <EmptyBox />
              <p className="text-[15px] font-semibold text-[#0e0e1a]">No recent activity</p>
            </div>
          ) : (
            <div className="space-y-2 pt-4">
              {recent.slice(0, 5).map((r) => (
                <RecentRow key={r.id} meeting={r} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Right column: quick actions + meetings */}
      <div className="flex w-full flex-col gap-6 lg:w-[328px] lg:shrink-0">
        <Card className="px-4 py-6">
          <QuickActions
            onNewMeeting={onNewMeeting}
            onJoin={onJoin}
            onSchedule={onSchedule}
            starting={starting}
          />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[#0e0e1a]">Meetings</h2>
            <button onClick={onVisitMeetings} className="text-[13px] text-[#0b5cff] hover:underline">
              Visit Meetings
            </button>
          </div>
          {upcoming.length === 0 ? (
            <>
              <p className="mt-5 rounded-lg bg-[#f7f9fc] px-2 py-3 text-[15px] font-semibold text-[#0e0e1a]">
                No Upcoming Meetings
              </p>
              <div className="mt-4 flex justify-center">
                <span className="cursor-default rounded-full bg-[#eef2fb] px-4 py-1.5 text-[13px] text-[#0b5cff]">
                  Test Audio and Video
                </span>
              </div>
            </>
          ) : (
            <ul className="mt-4 space-y-2">
              {upcoming.slice(0, 3).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#f7f9fc] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0e0e1a]">{m.title}</p>
                    <p className="text-xs text-[#4a4f63]">{formatMeetingTime(m.scheduled_at!)}</p>
                  </div>
                  <button
                    onClick={() => onStart(m.id)}
                    className="shrink-0 rounded-full bg-[#0e72ed] px-4 py-1 text-xs font-semibold text-white hover:bg-[#0b5cff]"
                  >
                    Start
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ─── Meetings Tab (full upcoming list) ────────────────────────────────────────
function MeetingsTab({
  upcoming,
  onStart,
  onDelete,
  onSchedule,
}: {
  upcoming: Meeting[];
  onStart: (id: string) => void;
  onDelete: (id: string) => void;
  onSchedule: () => void;
}) {
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-on-light">Upcoming Meetings</h1>
        <button
          onClick={onSchedule}
          className="flex items-center gap-2 rounded-lg bg-zoom-blue px-4 py-2 text-sm font-semibold text-white hover:bg-zoom-blue-hover"
        >
          <Plus className="h-4 w-4" /> Schedule a Meeting
        </button>
      </div>

      {upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-portal-border bg-portal-card py-16 text-center">
          <Calendar className="mb-3 h-10 w-10 text-text-label" />
          <p className="text-sm font-medium text-text-on-light">No upcoming meetings</p>
          <p className="mt-1 text-xs text-text-label">Click &quot;Schedule a Meeting&quot; to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map(m => (
            <UpcomingCard
              key={m.id}
              meeting={m}
              onStart={() => onStart(m.id)}
              onCopyLink={() => copyText(`${window.location.origin}/meeting/${m.id}`)}
              onDelete={() => onDelete(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ recent }: { recent: RecentMeeting[] }) {
  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold text-text-on-light">Meeting History</h1>

      {recent.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-portal-border bg-portal-card py-16 text-center">
          <History className="mb-3 h-10 w-10 text-text-label" />
          <p className="text-sm font-medium text-text-on-light">No meeting history</p>
          <p className="mt-1 text-xs text-text-label">Meetings you attend will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map(r => (
            <RecentRow key={r.id} meeting={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#1a1a2e] px-5 py-3 text-sm text-white shadow-xl">
      <span>{msg}</span>
      <button onClick={onDismiss} className="text-white/60 hover:text-white">✕</button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");
  const [upcoming, setUpcoming] = useState<Meeting[]>([]);
  const [recent, setRecent] = useState<RecentMeeting[]>([]);
  const [starting, setStarting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchData = useCallback(async () => {
    const [upcomingMeetings, recentMeetings] = await Promise.all([
      api.listUpcoming().catch(() => null),
      api.listRecent().catch(() => null),
    ]);
    if (upcomingMeetings) setUpcoming(upcomingMeetings);
    if (recentMeetings) setRecent(recentMeetings);
    if (!upcomingMeetings || !recentMeetings) {
      showToast("Couldn't load your meetings. Is the server running?");
    }
  }, [showToast]);

  useEffect(() => {
    fetchData();
    // Check for toast from meeting leave
    const msg = sessionStorage.getItem("zoom_toast");
    if (msg) { showToast(msg); sessionStorage.removeItem("zoom_toast"); }
  }, [fetchData, showToast]);

  async function handleNewMeeting() {
    setStarting(true);
    try {
      const meeting = await api.createInstantMeeting();
      // Remember we created it, so we join as its host.
      saveHostToken(meeting.id, meeting.host_token);
      router.push(`/meeting/${meeting.id}`);
    } catch (err) {
      showToast(apiErrorMessage(err, "Couldn't start a meeting. Please try again."));
      setStarting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteMeeting(id, getHostToken(id));
    } catch (err) {
      showToast(apiErrorMessage(err, "Couldn't delete the meeting."));
      return;
    }
    removeHostToken(id);
    setUpcoming(prev => prev.filter(m => m.id !== id));
    showToast("Meeting deleted.");
  }

  const goJoin = () => router.push("/join");
  const goSchedule = () => router.push("/schedule");

  return (
    <div className="flex h-screen flex-col bg-white">
      <UtilityBar />
      <NavBar
        onMenu={() => setMenuOpen(true)}
        onHost={handleNewMeeting}
        onJoin={goJoin}
        onSchedule={goSchedule}
      />

      <div className="flex min-h-0 flex-1">
        <Sidebar active={tab} onChange={setTab} open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main className="min-w-0 flex-1 overflow-y-auto bg-white px-4 py-6 sm:px-8 md:py-9">
          {tab === "home" && (
            <HomeTab
              upcoming={upcoming}
              recent={recent}
              onNewMeeting={handleNewMeeting}
              onJoin={goJoin}
              onSchedule={goSchedule}
              onStart={(id) => router.push(`/meeting/${id}`)}
              onVisitMeetings={() => setTab("meetings")}
              starting={starting}
            />
          )}
          {tab === "meetings" && (
            <div className="mx-auto max-w-2xl">
              <MeetingsTab
                upcoming={upcoming}
                onStart={(id) => router.push(`/meeting/${id}`)}
                onDelete={handleDelete}
                onSchedule={goSchedule}
              />
            </div>
          )}
          {tab === "history" && (
            <div className="mx-auto max-w-2xl">
              <HistoryTab recent={recent} />
            </div>
          )}
        </main>
      </div>

      {/* Support chat launcher (visual only for now) */}
      <button
        aria-label="Chat with support"
        className="fixed bottom-4 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#0e72ed] text-white shadow-lg hover:bg-[#0b5cff]"
      >
        <MessageCircle className="h-7 w-7" fill="currentColor" />
      </button>

      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
