"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiErrorMessage } from "@/lib/api";
import type { JoinResult, MediaCredentials } from "@/lib/types";
import type { CloseReason } from "@/hooks/roomState";
import { useMeetingSocket, type TransientHandlers } from "@/hooks/useMeetingSocket";
import LiveMeeting from "./LiveMeeting";
import WaitingRoom from "./WaitingRoom";

interface MeetingSessionProps {
  join: JoinResult;
  name: string;
  micOn: boolean;
  webcamOn: boolean;
  /** Navigate away; an optional reason surfaces as a toast on Home. */
  onLeave: (reason?: string) => void;
}

const CLOSE_MESSAGES: Record<CloseReason, string> = {
  removed: "You were removed from the meeting by the host.",
  denied: "The host did not let you into the meeting.",
  "meeting-ended": "This meeting has been ended by the host.",
  rejected: "Your session is no longer valid. Please join again.",
  replaced: "You joined this meeting from another tab or device.",
  "connection-lost": "Lost connection to the meeting.",
};

/**
 * Owns everything that happens around the media call: the realtime socket, the waiting
 * room, and claiming the media token. The video provider only mounts once the server has
 * handed us a token, so a participant held in the waiting room never reaches the media room.
 */
export default function MeetingSession({ join, name, micOn, webcamOn, onLeave }: MeetingSessionProps) {
  const meetingId = join.meeting.id;
  const isHost = join.role === "host";

  // The meeting view (inside the video provider) registers its handlers here.
  const handlersRef = useRef<TransientHandlers>({});
  const socket = useMeetingSocket({
    meetingId,
    participantId: join.participant_id,
    sessionKey: join.session_key,
    onReaction: (id, emoji) => handlersRef.current.onReaction?.(id, emoji),
    onError: (code) => handlersRef.current.onError?.(code),
  });
  const { room } = socket;

  const [media, setMedia] = useState<MediaCredentials | null>(
    join.token && join.room_id ? { token: join.token, room_id: join.room_id } : null,
  );

  const hasLeft = useRef(false);
  const leave = useCallback(
    (reason?: string) => {
      if (hasLeft.current) return;
      hasLeft.current = true;
      api.leaveMeeting(meetingId, join.participant_id, join.session_key).catch(() => {});
      onLeave(reason);
    },
    [meetingId, join.participant_id, join.session_key, onLeave],
  );

  // Host admitted us (the server sends a fresh `state`): now we may fetch the media token.
  const admitted = room.status === "connected";
  useEffect(() => {
    if (media || !admitted) return;
    let cancelled = false;
    api
      .claimToken(meetingId, join.participant_id, join.session_key)
      .then((credentials) => {
        if (!cancelled) setMedia(credentials);
      })
      .catch((err) => {
        if (!cancelled) leave(apiErrorMessage(err, "Could not join the meeting."));
      });
    return () => {
      cancelled = true;
    };
  }, [media, admitted, meetingId, join.participant_id, join.session_key, leave]);

  // Removed, denied, meeting ended, or the connection is gone for good.
  useEffect(() => {
    if (room.status !== "closed" || !room.closeReason) return;
    const endedItself = isHost && room.closeReason === "meeting-ended";
    leave(endedItself ? undefined : CLOSE_MESSAGES[room.closeReason]);
  }, [room.status, room.closeReason, isHost, leave]);

  if (media) {
    const hostName = join.meeting.host_name ?? "Host";
    const meetingTitle = join.meeting.is_instant
      ? `${hostName}'s Zoom Meeting`
      : (join.meeting.title ?? `${hostName}'s Zoom Meeting`);
    return (
      <LiveMeeting
        key={meetingId}
        meetingId={meetingId}
        meetingTitle={meetingTitle}
        media={media}
        participantId={join.participant_id}
        name={name}
        micOn={micOn}
        webcamOn={webcamOn}
        socket={socket}
        handlersRef={handlersRef}
        onLeave={leave}
      />
    );
  }

  if (room.status === "waiting") {
    return <WaitingRoom roomId={meetingId} name={name} onLeave={() => leave()} />;
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-stage text-sm text-text-secondary">
      Joining meeting…
    </div>
  );
}
