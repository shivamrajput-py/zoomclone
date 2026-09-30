import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.clock import utcnow
from app.core.database import Base

if TYPE_CHECKING:
    from app.models.message import Message
    from app.models.participant import Participant
    from app.models.poll import Poll


class MeetingStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    ENDED = "ended"


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[str] = mapped_column(String(11), primary_key=True)  # Zoom-style: ddd-ddd-ddd
    title: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    host_name: Mapped[str] = mapped_column(String(100))
    # Secret handed only to the creator; proves host identity for privileged actions.
    host_token: Mapped[str] = mapped_column(String(64))
    videosdk_room_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    status: Mapped[MeetingStatus] = mapped_column(
        Enum(MeetingStatus, native_enum=False, length=16),
        default=MeetingStatus.SCHEDULED,
        index=True,
    )
    is_instant: Mapped[bool] = mapped_column(Boolean, default=False)
    waiting_room: Mapped[bool] = mapped_column(Boolean, default=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    # What non-host participants may do.
    allow_share: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_chat: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_unmute: Mapped[bool] = mapped_column(Boolean, default=True)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    participants: Mapped[list["Participant"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    polls: Mapped[list["Poll"]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )

    @property
    def duration(self) -> int | None:
        return self.duration_minutes
