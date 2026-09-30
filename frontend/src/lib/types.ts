/** Shapes returned by the FastAPI backend (see backend/app/schemas). */

export type MeetingStatus = "scheduled" | "live" | "ended";
export type ParticipantRole = "host" | "cohost" | "participant";

export interface Meeting {
  id: string;
  title: string;
  description?: string | null;
  scheduled_at?: string | null;
  duration?: number | null;
  is_instant: boolean;
  status: MeetingStatus;
  host_name: string;
  created_at: string;
}

/** Returned once, to the creator; `host_token` proves host identity later. */
export interface CreatedMeeting extends Meeting {
  host_token: string;
}

export interface RecentMeeting {
  id: string;
  meeting_id: string;
  title: string;
  host_name?: string | null;
  ended_at: string;
  duration_minutes?: number | null;
}

export interface JoinResult {
  participant_id: number;
  session_key: string;
  role: ParticipantRole;
  /** False while the host is holding this participant in the waiting room. */
  admitted: boolean;
  /** Media token; null until admitted. */
  token: string | null;
  room_id: string | null;
  meeting: Meeting;
}

export interface MediaCredentials {
  token: string;
  room_id: string;
}

export interface ScheduleInput {
  title: string;
  description: string | null;
  scheduled_at: string;
  duration?: number | null;
}

export interface MeetingControls {
  locked: boolean;
  waiting_room: boolean;
  allow_share: boolean;
  allow_chat: boolean;
  allow_unmute: boolean;
}

export interface RosterEntry {
  id: number;
  name: string;
  role: ParticipantRole;
  hand_raised: boolean;
}

export interface WaitingEntry {
  id: number;
  name: string;
}

export interface ChatMessage {
  id: number;
  sender_name: string;
  text: string;
  sent_at: string;
  participant_id?: number;
}

export interface PollOption {
  id: number;
  text: string;
  vote_count: number;
}

export interface ServerPoll {
  id: number;
  question: string;
  is_open: boolean;
  created_at: string;
  options: PollOption[];
}
