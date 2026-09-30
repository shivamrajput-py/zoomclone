import { useState } from "react";
import { ScreenShare, Presentation, PictureInPicture2, MoreHorizontal } from "lucide-react";
import ControlBarButton from "./ControlBarButton";
import ReactionsFlyout from "@/components/panels/ReactionsFlyout";
import SecurityMenu from "./SecurityMenu";
import DeviceMenu from "./DeviceMenu";
import MoreToolsSheet from "./MoreToolsSheet";
import { useMediaDevices } from "./useMediaDevices";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSettingsStore } from "@/store/useSettingsStore";
import type { Permission } from "@/lib/controls";
import {
  ZMute,
  ZUnmute,
  ZStartVideo,
  ZStopVideo,
  ZSecurity,
  ZParticipants,
  ZChat,
  ZShareScreen,
  ZPolling,
  ZRecord,
  ZReaction,
} from "@/components/icons/ZoomIcons";
import type { PanelType } from "./types";

/**
 * Below this width the full control bar (media + security + panels + reactions) no longer
 * fits without its centred group running into the mic/camera group, so we switch to the
 * compact bar with a "More" sheet. Measured, not the generic `md` breakpoint.
 */
const COMPACT_BAR_QUERY = "(max-width: 1099px)";

interface ControlBarProps {
  micOn: boolean;
  webcamOn: boolean;
  isHost: boolean;
  participantCount: number;
  activePanel: PanelType;
  onToggleMic: () => void;
  onToggleWebcam: () => void;
  onOpenPanel: (panel: PanelType) => void;
  onLeave: () => void;
  onShareScreen?: () => void;
  onWhiteboard?: () => void;
  onEnd?: () => void;
  /** Picture-in-Picture toggle (live mode; hidden when the browser lacks support). */
  onTogglePip?: () => void;
  pipActive?: boolean;
  pipSupported?: boolean;
  /** Recording toggle (host). `recordingBusy` covers the starting/stopping states. */
  onToggleRecording?: () => void;
  recordingActive?: boolean;
  recordingBusy?: boolean;
  /** Apply a device selection to the ongoing call (live mode). */
  onApplyMic?: (deviceId: string) => void;
  onApplyCamera?: (deviceId: string) => void;
  onReact?: (emoji: string) => void;
  onRaiseHand?: () => void;
  /** Host meeting controls for the Security menu. */
  controls?: {
    locked: boolean;
    waitingRoomEnabled: boolean;
    permissions: Record<Permission, boolean>;
  };
  onToggleLock?: () => void;
  onToggleWaitingRoom?: () => void;
  onTogglePermission?: (p: Permission) => void;
}

export default function ControlBar({
  micOn,
  webcamOn,
  isHost,
  participantCount,
  activePanel,
  onToggleMic,
  onToggleWebcam,
  onOpenPanel,
  onLeave,
  onShareScreen,
  onWhiteboard,
  onEnd,
  onTogglePip,
  pipActive,
  pipSupported,
  onToggleRecording,
  recordingActive,
  recordingBusy,
  onApplyMic,
  onApplyCamera,
  onReact,
  onRaiseHand,
  controls,
  onToggleLock,
  onToggleWaitingRoom,
  onTogglePermission,
}: ControlBarProps) {
  const [leaveMenu, setLeaveMenu] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const [reactionsMenu, setReactionsMenu] = useState(false);
  const [securityMenu, setSecurityMenu] = useState(false);
  const [micMenu, setMicMenu] = useState(false);
  const [camMenu, setCamMenu] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);

  const isCompact = useMediaQuery(COMPACT_BAR_QUERY);
  const { cameras, mics, speakers } = useMediaDevices();
  const { micId, cameraId, speakerId, setMicId, setCameraId, setSpeakerId } =
    useSettingsStore();

  // Live enforcement: a non-host loses a control when the host disables it.
  const perm = controls?.permissions;
  const chatBlocked = !isHost && perm ? !perm.chat : false;
  const shareBlocked = !isHost && perm ? !perm.share : false;
  const unmuteBlocked = !isHost && perm ? !perm.unmute : false;

  return (
    <div className="relative flex h-20 shrink-0 items-center justify-between bg-controlbar px-4 text-white">
      {/* Left: media controls (fixed widths so the label swap doesn't shift the bar) */}
      <div className="flex items-center gap-1">
        <div className="relative">
          <ControlBarButton
            icon={micOn ? ZMute : ZUnmute}
            label={micOn ? "Mute" : "Unmute"}
            danger={!micOn}
            hasMenu
            minWidth={72}
            disabled={unmuteBlocked && !micOn}
            menuDisabled={unmuteBlocked && !micOn}
            title={
              unmuteBlocked && !micOn
                ? "The host has disabled unmuting for participants"
                : undefined
            }
            onMenuClick={() => setMicMenu((v) => !v)}
            onClick={onToggleMic}
          />
          {micMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMicMenu(false)}
              />
              <div className="absolute bottom-full left-0 z-20 mb-3">
                <DeviceMenu
                  sections={[
                    {
                      title: "Select a Microphone",
                      devices: mics,
                      selectedId: micId,
                      fallback: "Microphone",
                      onSelect: (id) => {
                        setMicId(id);
                        onApplyMic?.(id);
                        setMicMenu(false);
                      },
                    },
                    {
                      title: "Select a Speaker",
                      devices: speakers,
                      selectedId: speakerId,
                      fallback: "Speaker",
                      onSelect: (id) => {
                        setSpeakerId(id);
                        setMicMenu(false);
                      },
                    },
                  ]}
                />
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <ControlBarButton
            icon={webcamOn ? ZStopVideo : ZStartVideo}
            label="Video"
            danger={!webcamOn}
            hasMenu
            minWidth={84}
            onMenuClick={() => setCamMenu((v) => !v)}
            onClick={onToggleWebcam}
          />
          {camMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setCamMenu(false)}
              />
              <div className="absolute bottom-full left-0 z-20 mb-3">
                <DeviceMenu
                  sections={[
                    {
                      title: "Select a Camera",
                      devices: cameras,
                      selectedId: cameraId,
                      fallback: "Camera",
                      onSelect: (id) => {
                        setCameraId(id);
                        onApplyCamera?.(id);
                        setCamMenu(false);
                      },
                    },
                  ]}
                />
              </div>
            </>
          )}
        </div>
        {/* Mobile: everything else collapses into a "More" bottom sheet. Kept in
            normal flow (not the absolute-centered group) so it can't collide. */}
        {isCompact && (
          <ControlBarButton
            icon={MoreHorizontal}
            label="More"
            active={moreOpen}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </div>

      {/* Center: meeting features -- absolutely centered so side groups can't shift it.
          Desktop only; on mobile these live in the More sheet. */}
      {!isCompact && (
      // Centered without a CSS transform: a transformed ancestor turns the menus'
      // `fixed inset-0` click-away backdrops into small boxes instead of full-screen ones.
      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-1">
        <ControlBarButton
          icon={ZParticipants}
          label="Participants"
          badge={participantCount}
          hasMenu
          active={activePanel === "participants"}
          onClick={() => onOpenPanel("participants")}
          onMenuClick={() => onOpenPanel("participants")}
        />
        <ControlBarButton
          icon={ZChat}
          label="Chat"
          hasMenu
          active={activePanel === "chat"}
          disabled={chatBlocked}
          menuDisabled={chatBlocked}
          title={chatBlocked ? "The host has disabled chat for participants" : undefined}
          onClick={() => !chatBlocked && onOpenPanel("chat")}
          onMenuClick={() => !chatBlocked && onOpenPanel("chat")}
        />

        <div className="relative">
          <ControlBarButton
            icon={ZReaction}
            label="React"
            active={reactionsMenu}
            onClick={() => setReactionsMenu((v) => !v)}
          />
          {reactionsMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setReactionsMenu(false)}
              />
              <div className="absolute bottom-full left-1/2 z-20 mb-3 -translate-x-1/2">
                <ReactionsFlyout
                  onReact={(emoji) => {
                    onReact?.(emoji);
                    setReactionsMenu(false);
                  }}
                  onRaiseHand={() => {
                    onRaiseHand?.();
                    setReactionsMenu(false);
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* Share Screen + chevron menu with Whiteboard */}
        <div className="relative">
          <ControlBarButton
            icon={ZShareScreen}
            label="Share"
            // Chevron stays available even when sharing is blocked so Whiteboard
            // (which lives in this menu) remains reachable; only the main
            // Share-Screen action and its menu row are disabled.
            hasMenu
            disabled={shareBlocked}
            title={
              shareBlocked
                ? "The host has disabled screen sharing for participants"
                : undefined
            }
            onClick={() => !shareBlocked && onShareScreen?.()}
            onMenuClick={() => setShareMenu((v) => !v)}
          />
          {shareMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShareMenu(false)}
              />
              <div className="absolute bottom-16 left-0 z-20 w-52 overflow-hidden rounded-lg bg-panel-2 py-1 shadow-lg ring-1 ring-panel-border">
                <button
                  onClick={() => {
                    setShareMenu(false);
                    onShareScreen?.();
                  }}
                  disabled={shareBlocked}
                  title={
                    shareBlocked
                      ? "The host has disabled screen sharing for participants"
                      : undefined
                  }
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ScreenShare className="h-4 w-4" /> Share Screen
                </button>
                <button
                  onClick={() => {
                    setShareMenu(false);
                    onWhiteboard?.();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-hover"
                >
                  <Presentation className="h-4 w-4" /> Whiteboard
                </button>
              </div>
            </>
          )}
        </div>

        {isHost && (
          <div className="relative">
            <ControlBarButton
              icon={ZSecurity}
              label="Host tools"
              active={securityMenu}
              onClick={() => setSecurityMenu((v) => !v)}
            />
            {securityMenu && controls && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setSecurityMenu(false)}
                />
                <div className="absolute bottom-full left-0 z-20 mb-3">
                  <SecurityMenu
                    locked={controls.locked}
                    waitingRoomEnabled={controls.waitingRoomEnabled}
                    permissions={controls.permissions}
                    onToggleLock={() => onToggleLock?.()}
                    onToggleWaitingRoom={() => onToggleWaitingRoom?.()}
                    onTogglePermission={(p) => onTogglePermission?.(p)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* More: the remaining tools (polls, record, picture-in-picture) */}
        <div className="relative">
          <ControlBarButton
            icon={MoreHorizontal}
            label="More"
            active={moreMenu}
            onClick={() => setMoreMenu((v) => !v)}
          />
          {moreMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMoreMenu(false)} />
              <div className="absolute bottom-16 right-0 z-20 w-56 overflow-hidden rounded-lg bg-panel-2 py-1 shadow-lg ring-1 ring-panel-border">
                <button
                  onClick={() => {
                    setMoreMenu(false);
                    onOpenPanel("polls");
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-hover"
                >
                  <ZPolling className="h-4 w-4" /> Polls
                </button>
                {isHost && (
                  <button
                    onClick={() => {
                      setMoreMenu(false);
                      onToggleRecording?.();
                    }}
                    disabled={recordingBusy}
                    title={recordingBusy ? "Recording is starting/stopping..." : undefined}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ZRecord className={recordingActive ? "h-4 w-4 text-leave-hover" : "h-4 w-4"} />
                    {recordingActive ? "Stop Recording" : "Record"}
                  </button>
                )}
                {pipSupported && (
                  <button
                    onClick={() => {
                      setMoreMenu(false);
                      onTogglePip?.();
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-text-primary hover:bg-hover"
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                    {pipActive ? "Exit Picture in Picture" : "Picture in Picture"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>
      )}

      {/* Right: leave / end — matches Zoom's round red ✕ button */}
      <div className="relative flex items-center gap-2">
        {onEnd ? (
          <>
            {/* Leave button (text-only, secondary) */}
            <button
              onClick={() => setLeaveMenu((v) => !v)}
              className="flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Leave
            </button>
            {/* Round red End circle — matches Zoom exactly */}
            <button
              onClick={() => onEnd()}
              title="End meeting for all"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-leave text-white transition-colors hover:bg-leave-hover"
              aria-label="End meeting"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {leaveMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLeaveMenu(false)} />
                <div className="absolute bottom-14 right-0 z-20 w-52 overflow-hidden rounded-lg bg-panel-2 py-1 shadow-lg ring-1 ring-panel-border">
                  <button
                    onClick={() => { setLeaveMenu(false); onEnd(); }}
                    className="block w-full px-4 py-2 text-left text-sm font-medium text-leave-hover hover:bg-hover"
                  >
                    End Meeting for All
                  </button>
                  <button
                    onClick={() => { setLeaveMenu(false); onLeave(); }}
                    className="block w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-hover"
                  >
                    Leave Meeting
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          /* Guest: single Leave button */
          <button
            onClick={onLeave}
            className="rounded-md bg-leave px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-leave-hover"
          >
            Leave
          </button>
        )}
      </div>

      {isCompact && (
        <MoreToolsSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          isHost={isHost}
          participantCount={participantCount}
          activePanel={activePanel}
          chatBlocked={chatBlocked}
          shareBlocked={shareBlocked}
          onOpenPanel={onOpenPanel}
          onShareScreen={onShareScreen}
          onWhiteboard={onWhiteboard}
          onTogglePip={onTogglePip}
          pipActive={pipActive}
          pipSupported={pipSupported}
          onToggleRecording={onToggleRecording}
          recordingActive={recordingActive}
          recordingBusy={recordingBusy}
          onReact={onReact}
          onRaiseHand={onRaiseHand}
          controls={controls}
          onToggleLock={onToggleLock}
          onToggleWaitingRoom={onToggleWaitingRoom}
          onTogglePermission={onTogglePermission}
        />
      )}
    </div>
  );
}
