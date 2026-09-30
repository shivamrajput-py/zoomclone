import { useEffect, useReducer, useRef, useState, type RefObject } from "react";
import {
  useMeeting,
  useWhiteboard,
  useFile,
  VideoPlayer,
  createMicrophoneAudioTrack,
  createScreenShareVideoTrack,
} from "@videosdk.live/react-sdk";
import TopBar from "./TopBar";
import ControlBar from "./ControlBar";
import SpeakerView from "./SpeakerView";
import LiveParticipantTile from "./LiveParticipantTile";
import LiveParticipantRowActions from "./LiveParticipantRowActions";
import MicEnforcer from "./MicEnforcer";
import RecordingIndicator from "./RecordingIndicator";
import FloatingReactions, { type FloatingReaction } from "./FloatingReactions";
import { useServerPolls } from "./useServerPolls";
import { useMeetingHotkeys } from "./useMeetingHotkeys";
import type { PanelType } from "./types";
import ParticipantsPanel from "@/components/panels/ParticipantsPanel";
import ChatPanel, {
  type ChatMessageVM,
  type ChatAttachment,
} from "@/components/panels/ChatPanel";
import PollsPanel from "@/components/panels/PollsPanel";
import type { MeetingSocket, TransientHandlers } from "@/hooks/useMeetingSocket";
import { api } from "@/lib/api";
import { PERMISSION_FIELD, toControlsView, type Permission } from "@/lib/controls";
import { getHostToken } from "@/lib/hostTokens";
import { colorForId, type ParticipantVM } from "@/lib/participantVM";
import { fileToBase64, base64ToObjectUrl, triggerDownload } from "@/lib/file";
import type { MeetingControls } from "@/lib/types";
import { useSessionStore } from "@/store/useSessionStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useGalleryTileSize } from "./useGalleryTileSize";
import { usePictureInPicture } from "./usePictureInPicture";

const DISCONNECTED_MSG = "You were disconnected from the meeting.";
const NOTICE_MS = 4000;

/** Friendly text for error codes the server sends back over the socket. */
const ERROR_NOTICES: Record<string, string> = {
  "chat-disabled": "The host has turned off chat.",
  forbidden: "Only the host can do that.",
  "vote-rejected": "That poll is closed.",
  "invalid-message": "That couldn't be sent. Try a shorter message.",
};

// A failed screen-share (user cancelled the picker, denied permission, or the
// browser can't share -- e.g. most mobile browsers) is never fatal to the
// meeting, so it must never surface the "Back to Home" toast. Platforms report
// the cancel differently; the SDK can fire a specific *and* a generic
// display-media error for the same action, so match the whole family: the known
// getDisplayMedia error codes plus any message mentioning screen/display share.
const SCREENSHARE_ERROR_CODES = new Set(["3011", "3013", "3014", "3016", "3020"]);
function isScreenShareError(e: { code?: string | number; message?: string }): boolean {
  if (SCREENSHARE_ERROR_CODES.has(String(e?.code ?? ""))) return true;
  return /display\s*media|getdisplaymedia|screen[-\s]?shar/i.test(String(e?.message ?? ""));
}

type RecordingStatus =
  | "RECORDING_STOPPED"
  | "RECORDING_STARTING"
  | "RECORDING_STARTED"
  | "RECORDING_STOPPING";

function fmtTime(ts: string): string {
  const d = new Date(Number(ts) || Date.parse(ts) || Date.now());
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function useElapsed(): string {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

interface LiveMeetingViewProps {
  /** Our meeting id (shown in the top bar and used for host actions). */
  meetingId: string;
  /** Human-readable title for the top bar, e.g. "Alex's Zoom Meeting". */
  meetingTitle?: string;
  /** Participant-scoped media token, also used for chat file storage. */
  mediaToken: string;
  /** Realtime room state and sender, owned by MeetingSession. */
  socket: MeetingSocket;
  /** Where this view registers its handlers for transient socket events. */
  handlersRef: RefObject<TransientHandlers>;
  /** Navigate away; an optional reason surfaces as a toast on Home. */
  onLeave: (reason?: string) => void;
}

export default function LiveMeetingView({
  meetingId,
  meetingTitle,
  mediaToken,
  socket,
  handlersRef,
  onLeave,
}: LiveMeetingViewProps) {
  const { room, send } = socket;
  const role = useSessionStore((s) => s.role);
  const isHost = role === "host";
  const elapsed = useElapsed();

  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [view, setView] = useState<"gallery" | "speaker">("gallery");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<RecordingStatus>("RECORDING_STOPPED");

  // Force-update tick so VideoSDK's in-place participants-Map mutations
  // reflect in the UI when the roster changes.
  const [, bump] = useReducer((n: number) => n + 1, 0);

  // Distinguishes a real Leave click (self-leave) from an involuntary removal.
  const intentionalLeave = useRef(false);

  const {
    participants,
    activeSpeakerId,
    localParticipant,
    localMicOn,
    localWebcamOn,
    presenterId,
    toggleMic,
    toggleWebcam,
    toggleScreenShare,
    disableScreenShare,
    changeMic,
    changeWebcam,
    startRecording,
    stopRecording,
    leave,
    end,
  } = useMeeting({
    onRecordingStateChanged: ({ status }: { status: RecordingStatus }) =>
      setRecordingStatus(status),
    onMeetingLeft: () => {
      if (intentionalLeave.current) {
        onLeave();
        return;
      }
      // Involuntary exit (removed, or the media room closed). The realtime socket
      // normally explains why a moment earlier; the session ignores this call if so.
      setTimeout(() => onLeave(DISCONNECTED_MSG), 1000);
    },
    onParticipantJoined: () => bump(),
    onParticipantLeft: () => bump(),
    onError: (e: { code: string; message: string }) => {
      // Cancelling/denying/failing a screen-share is a normal user action, not a
      // fatal meeting error -- silently ignore the whole display-media error
      // family instead of surfacing the "Back to Home" toast, matching Zoom.
      if (isScreenShareError(e)) return;
      setJoinError(e?.message || "Could not connect to the meeting.");
    },
  });

  // Host-managed settings come from the server, so late joiners and reconnects agree.
  const controls = toControlsView(room.controls);
  const localId = localParticipant?.id ?? "";
  const rosterById = new Map(room.participants.map((p) => [String(p.id), p]));

  // --- Reactions (transient, floating emoji) and server error notices ---
  const [floating, setFloating] = useState<FloatingReaction[]>([]);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    handlersRef.current = {
      onReaction: (participantId, emoji) => {
        const id = `${participantId}-${Date.now()}-${Math.random()}`;
        setFloating((prev) => [
          ...prev,
          { id, emoji, left: 10 + Math.floor(Math.random() * 80) },
        ]);
        setTimeout(() => setFloating((prev) => prev.filter((r) => r.id !== id)), 3000);
      },
      onError: (code) => {
        setNotice(ERROR_NOTICES[code] ?? "Something went wrong.");
        clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
      },
    };
    return () => {
      handlersRef.current = {};
      clearTimeout(noticeTimer.current);
    };
  }, [handlersRef]);
  const sendReaction = (emoji: string) => {
    send({ type: "reaction", emoji });
  };

  // --- Raise hand (server-tracked per participant) ---
  const raisedHands = new Set(
    room.participants.filter((p) => p.hand_raised).map((p) => String(p.id)),
  );
  const raiseHand = () => {
    send({ type: "raise-hand", raised: !raisedHands.has(localId) });
  };

  // --- Chat (persisted server-side; late joiners receive the history) ---
  const { uploadBase64File, fetchBase64File } = useFile();
  const chatVMs: ChatMessageVM[] = room.messages.map((m) => {
    // Payload is JSON { text, files? }; tolerate a bare-string message.
    let text = m.text;
    let files: ChatAttachment[] | undefined;
    try {
      const parsed = JSON.parse(m.text);
      if (parsed && typeof parsed === "object") {
        text = typeof parsed.text === "string" ? parsed.text : "";
        files = Array.isArray(parsed.files) ? parsed.files : undefined;
      }
    } catch {
      /* not JSON -- treat as plain text */
    }
    return {
      id: String(m.id),
      senderName: m.sender_name,
      toName: "Everyone",
      message: text,
      timestamp: fmtTime(m.sent_at),
      isLocal: m.participant_id === Number(localId),
      files,
    };
  });

  // --- Polls (server-held) ---
  const polls = useServerPolls(socket);

  // --- Whiteboard (native VideoSDK, shared via URL) ---
  const { startWhiteboard, stopWhiteboard, whiteboardUrl } = useWhiteboard();
  const toggleWhiteboard = () => {
    if (whiteboardUrl) stopWhiteboard();
    else startWhiteboard();
  };

  // Derived each render (the Map reference is stable, so no memo).
  const participantIds = [...participants.keys()];
  const gallery = useGalleryTileSize(participantIds.length);

  // Picture-in-Picture composites the live participant videos in the stage.
  const stageRef = useRef<HTMLDivElement>(null);
  const { pipActive, pipSupported, togglePip } = usePictureInPicture(stageRef);

  // Permission-derived flags for this client.
  const chatBlocked = !isHost && !controls.permissions.chat;
  const shareBlocked = !isHost && !controls.permissions.share;
  const unmuteBlocked = !isHost && !controls.permissions.unmute;

  // --- Host meeting controls (Security menu): the server applies and broadcasts them ---
  const toggleLock = () => send({ type: "set-controls", locked: !controls.locked });
  const toggleWaitingRoom = () =>
    send({ type: "set-controls", waiting_room: !controls.waitingRoomEnabled });
  const togglePermission = (p: Permission) => {
    const change = { [PERMISSION_FIELD[p]]: !controls.permissions[p] } as Partial<MeetingControls>;
    send({ type: "set-controls", ...change });
  };

  // --- Original Sound (Zoom): honor the persisted mic-fidelity preference ---
  // Build a mic track whose browser DSP (echo cancel / noise suppression /
  // auto-gain) is OFF when Original Sound is ON, matching Zoom's semantics.
  const micTrackFor = (originalSound: boolean) =>
    createMicrophoneAudioTrack({
      microphoneId: useSettingsStore.getState().micId,
      encoderConfig: originalSound ? "high_quality" : "speech_standard",
      noiseConfig: {
        echoCancellation: !originalSound,
        autoGainControl: !originalSound,
        noiseSuppression: !originalSound,
      },
    });

  // Toggle the mic, applying the Original Sound preference on the unmute edge
  // (a custom track can only be attached while turning the mic on).
  const handleToggleMic = async () => {
    if (unmuteBlocked && !localMicOn) return;
    if (localMicOn) {
      toggleMic();
      return;
    }
    try {
      toggleMic(await micTrackFor(useSettingsStore.getState().originalSound));
    } catch {
      toggleMic();
    }
  };

  // Swap the live mic track when Original Sound changes (only meaningful while
  // unmuted; a muted mic picks the preference up on its next unmute).
  const applyOriginalSound = async (on: boolean) => {
    if (!localMicOn) return;
    try {
      changeMic(await micTrackFor(on));
    } catch {
      /* keep the current track if rebuilding fails */
    }
  };

  // Switch device while honoring Original Sound (micId is already updated in
  // the store by the DeviceMenu before this fires).
  const applyMicDevice = async (id: string) => {
    if (!localMicOn) {
      changeMic(id);
      return;
    }
    try {
      changeMic(await micTrackFor(useSettingsStore.getState().originalSound));
    } catch {
      changeMic(id);
    }
  };

  const sendChat = async (text: string, files: File[]) => {
    if (chatBlocked) return;
    // Upload each attachment to VideoSDK temporary storage; only the small
    // fileUrl + metadata travel over the socket (never the base64 bytes).
    const uploaded: ChatAttachment[] = [];
    for (const file of files) {
      try {
        const base64Data = await fileToBase64(file);
        const url = await uploadBase64File({
          base64Data,
          token: mediaToken,
          fileName: file.name,
        });
        if (url) {
          uploaded.push({ name: file.name, size: file.size, mime: file.type, url });
        }
      } catch {
        /* skip a file that failed to read/upload */
      }
    }
    send({
      type: "chat",
      text: uploaded.length > 0 ? JSON.stringify({ text, files: uploaded }) : text,
    });
  };

  const handleDownloadFile = async (file: ChatAttachment) => {
    const base64 = await fetchBase64File({ url: file.url, token: mediaToken });
    if (!base64) return;
    const objectUrl = base64ToObjectUrl(base64, file.mime);
    triggerDownload(objectUrl, file.name);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  };

  // Guest-side unmute block at the source (the button/chevron are also disabled).
  useMeetingHotkeys(
    () => handleToggleMic(),
    () => toggleWebcam(),
  );

  // Host unmute enforcement: when revoked, immediately mute every unmuted
  // remote (handles anyone already talking). MicEnforcer children keep them
  // muted continuously if they try to unmute again. disableMic() is SFU-enforced
  // and only host tokens carry the permission to call it.
  useEffect(() => {
    if (!isHost || controls.permissions.unmute) return;
    participants.forEach((p) => {
      if (p.id !== localParticipant?.id && p.micOn) {
        try {
          p.disableMic();
        } catch {
          /* already gone */
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, controls.permissions.unmute]);

  // Share enforcement: when the host revokes sharing, anyone presenting stops their own
  // share (there is no native remote stop). Driven by the server-held permission.
  useEffect(() => {
    if (!shareBlocked || !presenterId || presenterId !== localId) return;
    try {
      disableScreenShare();
    } catch {
      /* not sharing */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareBlocked, presenterId, localId]);

  const panelVMs: ParticipantVM[] = [...participants.values()].map((p) => ({
    id: p.id,
    name: p.displayName || "Guest",
    isLocal: p.id === localParticipant?.id,
    isHost: rosterById.get(p.id)?.role === "host",
    micOn: !!p.micOn,
    webcamOn: !!p.webcamOn,
    handRaised: raisedHands.has(p.id),
    color: colorForId(p.id),
  }));

  const waitingVMs = room.waiting.map((w) => ({ id: String(w.id), name: w.name }));
  const admitWaiting = (id: string) => send({ type: "admit", participant_id: Number(id) });
  const denyWaiting = (id: string) => send({ type: "deny", participant_id: Number(id) });

  const openPanel = (panel: PanelType) => {
    setActivePanel((cur) => (cur === panel ? null : panel));
  };

  // Real Leave click: tag it so onMeetingLeft treats the exit as intentional.
  const handleLeave = () => {
    intentionalLeave.current = true;
    try {
      leave();
    } catch {
      onLeave();
    }
  };

  const handleEnd = () => {
    intentionalLeave.current = true;
    // The server verifies the host, ends the meeting for the record and tells everyone.
    // If the socket is down, fall back to the REST endpoint with the stored host token.
    if (!send({ type: "end-meeting" })) {
      api.endMeeting(meetingId, getHostToken(meetingId)).catch(() => {});
    }
    try {
      end();
    } catch {
      onLeave();
    }
  };

  // Composite cloud recording (host). `recordingState` drives the button; a
  // failure (e.g. recording not enabled on the account) surfaces via onError
  // and the status reverts to stopped.
  const recordingActive = recordingStatus === "RECORDING_STARTED";
  const recordingBusy =
    recordingStatus === "RECORDING_STARTING" ||
    recordingStatus === "RECORDING_STOPPING";
  const handleToggleRecording = () => {
    if (recordingActive || recordingStatus === "RECORDING_STARTING") {
      stopRecording();
    } else {
      startRecording(undefined, undefined, {
        layout: { type: "GRID", priority: "SPEAKER", gridSize: 4 },
        orientation: "landscape",
        quality: "high",
        mode: "video-and-audio",
      });
    }
  };

  // Host "Mute All" -- force-mute every remote participant (SFU-enforced).
  const muteAll = () => {
    participants.forEach((p) => {
      if (p.id !== localParticipant?.id) {
        try {
          p.disableMic();
        } catch {
          /* participant may have already left */
        }
      }
    });
  };

  return (
    <div className="relative flex h-screen w-screen flex-col bg-stage">
      <RecordingIndicator active={recordingActive} />
      {joinError && (
        <div className="absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-leave px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{joinError}</span>
          <button
            onClick={() => onLeave()}
            className="rounded bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
          >
            Back to Home
          </button>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="absolute left-1/2 top-14 z-30 -translate-x-1/2 rounded-lg bg-panel-2 px-4 py-2.5 text-sm text-text-primary shadow-lg ring-1 ring-panel-border"
        >
          {notice}
        </div>
      )}
      <TopBar
        meetingId={meetingId}
        meetingTitle={meetingTitle}
        elapsed={elapsed}
        view={view}
        onSetView={setView}
        onOriginalSoundChange={applyOriginalSound}
      />

      <div className="relative flex min-h-0 flex-1">
        <div ref={stageRef} className="min-w-0 flex-1">
          {(() => {
            const liveTiles = participantIds.map((id) => (
              <LiveParticipantTile
                key={id}
                participantId={id}
                handRaised={raisedHands.has(id)}
              />
            ));
            // Whiteboard → main area, participants as filmstrip.
            if (whiteboardUrl) {
              return (
                <SpeakerView
                  filmstrip={liveTiles}
                  main={
                    <iframe
                      title="Whiteboard"
                      src={whiteboardUrl}
                      className="h-full w-full border-0 bg-white"
                      allow="camera; microphone; display-capture"
                    />
                  }
                />
              );
            }
            // Screen share → main area, participants as filmstrip.
            if (presenterId) {
              return (
                <SpeakerView
                  filmstrip={liveTiles}
                  main={
                    <div className="h-full w-full bg-black">
                      <VideoPlayer
                        participantId={presenterId}
                        type="share"
                        containerStyle={{ height: "100%", width: "100%" }}
                        videoStyle={{
                          height: "100%",
                          width: "100%",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                  }
                />
              );
            }
            // Speaker view → active speaker large + filmstrip of the rest.
            if (view === "speaker") {
              const mainId = activeSpeakerId || participantIds[0];
              return (
                <SpeakerView
                  filmstrip={participantIds
                    .filter((id) => id !== mainId)
                    .map((id) => (
                      <LiveParticipantTile
                        key={id}
                        participantId={id}
                        handRaised={raisedHands.has(id)}
                      />
                    ))}
                  main={
                    mainId ? (
                      <div
                        className="h-full max-w-full"
                        style={{ aspectRatio: "16 / 9" }}
                      >
                        <LiveParticipantTile
                          participantId={mainId}
                          handRaised={raisedHands.has(mainId)}
                        />
                      </div>
                    ) : null
                  }
                />
              );
            }
            // Single participant: centered 16:9 tile sized by height.
            if (participantIds.length === 1) {
              return (
                <div className="flex h-full w-full items-center justify-center p-4">
                  <div className="h-full max-w-full" style={{ aspectRatio: "16 / 9" }}>
                    <LiveParticipantTile
                      participantId={participantIds[0]}
                      handRaised={raisedHands.has(participantIds[0])}
                    />
                  </div>
                </div>
              );
            }
            // Gallery → responsive flex-wrap sized to fit every row (centered
            // trailing rows); see useGalleryTileSize.
            return (
              <div className="flex h-full w-full items-center justify-center p-4">
                <div
                  ref={gallery.ref}
                  className="flex h-full w-full flex-wrap content-center items-center justify-center gap-2"
                >
                  {participantIds.map((id) => (
                    <div key={id} style={gallery.tileStyle}>
                      <LiveParticipantTile
                        participantId={id}
                        handRaised={raisedHands.has(id)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {activePanel === "participants" && (
          <ParticipantsPanel
            participants={panelVMs}
            isHost={isHost}
            waiting={waitingVMs}
            onAdmit={admitWaiting}
            onDeny={denyWaiting}
            onClose={() => setActivePanel(null)}
            onMuteAll={muteAll}
            onRaiseHand={raiseHand}
            renderRowActions={(id) => (
              <LiveParticipantRowActions
                participantId={id}
                onRemove={() => send({ type: "remove", participant_id: Number(id) })}
              />
            )}
          />
        )}
        {activePanel === "chat" && (
          <ChatPanel
            messages={chatVMs}
            onSend={sendChat}
            onDownloadFile={handleDownloadFile}
            onClose={() => setActivePanel(null)}
            disabled={chatBlocked}
          />
        )}
        {activePanel === "polls" && (
          <PollsPanel
            isHost={isHost}
            polls={polls.polls}
            results={polls.results}
            myVotes={polls.myVotes}
            onCreate={polls.createPoll}
            onVote={polls.vote}
            onClose={() => setActivePanel(null)}
          />
        )}
      </div>

      <FloatingReactions reactions={floating} />

      {/* Host-side continuous unmute backstop (render-null, one per remote). */}
      {isHost &&
        participantIds
          .filter((id) => id !== localParticipant?.id)
          .map((id) => (
            <MicEnforcer
              key={id}
              participantId={id}
              enforced={!controls.permissions.unmute}
            />
          ))}

      <ControlBar
        micOn={!!localMicOn}
        webcamOn={!!localWebcamOn}
        isHost={isHost}
        participantCount={participantIds.length}
        activePanel={activePanel}
        onToggleMic={() => handleToggleMic()}
        onToggleWebcam={() => toggleWebcam()}
        onShareScreen={async () => {
          if (shareBlocked) return;
          // Already presenting -> toggle off (no track needed).
          if (presenterId && presenterId === localParticipant?.id) {
            toggleScreenShare();
            return;
          }
          // Start a fresh share at 1080p30. `text` optimization keeps shared
          // documents/code crisp; VideoSDK default is only h720p_15fps.
          try {
            const track = await createScreenShareVideoTrack({
              encoderConfig: "h1080p_30fps",
              optimizationMode: "text",
              withAudio: "enable",
            });
            toggleScreenShare(track);
          } catch (e) {
            // User cancelled the picker or capture failed; stay silent to
            // match the rest of the screenshare error handling.
            if (isScreenShareError(e as { code?: string | number; message?: string })) return;
          }
        }}
        onWhiteboard={toggleWhiteboard}
        onTogglePip={togglePip}
        pipActive={pipActive}
        pipSupported={pipSupported}
        onToggleRecording={handleToggleRecording}
        recordingActive={recordingActive}
        recordingBusy={recordingBusy}
        onOpenPanel={openPanel}
        onLeave={handleLeave}
        onEnd={isHost ? handleEnd : undefined}
        onReact={sendReaction}
        onRaiseHand={raiseHand}
        onApplyMic={(id) => applyMicDevice(id)}
        onApplyCamera={(id) => changeWebcam?.(id)}
        controls={controls}
        onToggleLock={toggleLock}
        onToggleWaitingRoom={toggleWaitingRoom}
        onTogglePermission={togglePermission}
      />
    </div>
  );
}
