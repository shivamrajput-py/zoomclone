import type { RefObject } from "react";
import { MeetingProvider, Constants } from "@videosdk.live/react-sdk";
import type { MeetingSocket, TransientHandlers } from "@/hooks/useMeetingSocket";
import type { MediaCredentials } from "@/lib/types";
import LiveMeetingView from "./LiveMeetingView";

interface LiveMeetingProps {
  /** Our meeting id (what the user sees and shares). */
  meetingId: string;
  /** Human-readable title shown in the top bar, e.g. "Alex's Zoom Meeting". */
  meetingTitle?: string;
  /** Token and room id issued by our backend for this participant. */
  media: MediaCredentials;
  participantId: number;
  name: string;
  /** Initial mic/camera state chosen on the pre-join screen. */
  micOn: boolean;
  webcamOn: boolean;
  socket: MeetingSocket;
  handlersRef: RefObject<TransientHandlers>;
  onLeave: (reason?: string) => void;
}

/**
 * Wraps the video provider for a single room. Keyed by meeting id upstream so switching
 * meetings cleanly remounts the provider.
 *
 * The token is signed by our backend and scoped to this room and participant; host
 * permissions (mute/remove others) exist only in tokens issued to the host.
 */
export default function LiveMeeting({
  meetingId,
  meetingTitle,
  media,
  participantId,
  name,
  micOn,
  webcamOn,
  socket,
  handlersRef,
  onLeave,
}: LiveMeetingProps) {
  return (
    <MeetingProvider
      token={media.token}
      config={{
        meetingId: media.room_id,
        // Media identity == our participant id, so the roster, chat and host actions
        // coming from the backend line up with the video participants.
        participantId: String(participantId),
        name: name || "Guest",
        micEnabled: micOn,
        webcamEnabled: webcamOn,
        mode: Constants.modes.SEND_AND_RECV as "SEND_AND_RECV",
        multiStream: true,
        debugMode: false,
      }}
      joinWithoutUserInteraction
    >
      <LiveMeetingView
        meetingId={meetingId}
        meetingTitle={meetingTitle}
        mediaToken={media.token}
        socket={socket}
        handlersRef={handlersRef}
        onLeave={onLeave}
      />
    </MeetingProvider>
  );
}
