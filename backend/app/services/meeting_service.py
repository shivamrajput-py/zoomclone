import random
import secrets

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import to_naive_utc, utcnow
from app.core.config import settings
from app.core.exceptions import MeetingNotFoundError
from app.models import Meeting, MeetingStatus
from app.schemas import MeetingControlsUpdate, MeetingCreate, RecentMeetingResponse

RECENT_MEETINGS_LIMIT = 20


def _generate_meeting_id(db: Session) -> str:
    """Zoom-style numeric ID (ddd-ddd-ddd); retries on the unlikely collision."""
    while True:
        # 9 random decimal digits: cryptographically random, uniform distribution.
        digits = "".join(str(random.SystemRandom().randint(0, 9)) for _ in range(9))
        meeting_id = f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
        if db.get(Meeting, meeting_id) is None:
            return meeting_id


def _new_meeting(db: Session, **fields) -> Meeting:
    host_name = fields.pop("host_name", settings.default_host_name)
    meeting = Meeting(
        id=_generate_meeting_id(db),
        host_name=host_name,
        host_token=secrets.token_urlsafe(24),
        **fields,
    )
    db.add(meeting)
    db.commit()
    db.refresh(meeting)
    return meeting


def create_instant_meeting(db: Session) -> Meeting:
    now = utcnow()
    return _new_meeting(
        db,
        title="Instant Meeting",
        is_instant=True,
        status=MeetingStatus.LIVE,
        started_at=now,
    )


def schedule_meeting(db: Session, data: MeetingCreate) -> Meeting:
    # Server-side guard: reject scheduling in the past regardless of client-side checks.
    scheduled_utc = to_naive_utc(data.scheduled_at)
    if scheduled_utc <= utcnow():
        raise HTTPException(
            status_code=422,
            detail="scheduled_at must be a future date and time.",
        )
    return _new_meeting(
        db,
        title=data.title,
        description=data.description,
        scheduled_at=scheduled_utc,
        duration_minutes=data.duration,
        is_instant=False,
        status=MeetingStatus.SCHEDULED,
    )


def get_meeting(db: Session, meeting_id: str) -> Meeting:
    meeting = db.get(Meeting, meeting_id)
    if meeting is None:
        raise MeetingNotFoundError(meeting_id)
    return meeting


def list_meetings(db: Session) -> list[Meeting]:
    return list(db.scalars(select(Meeting).order_by(Meeting.scheduled_at)))


def list_upcoming(db: Session) -> list[Meeting]:
    stmt = (
        select(Meeting)
        .where(Meeting.status == MeetingStatus.SCHEDULED)
        .where(Meeting.scheduled_at >= utcnow())
        .order_by(Meeting.scheduled_at)
    )
    return list(db.scalars(stmt))


def list_recent(db: Session, limit: int = RECENT_MEETINGS_LIMIT) -> list[RecentMeetingResponse]:
    stmt = (
        select(Meeting)
        .where(Meeting.status == MeetingStatus.ENDED)
        .order_by(Meeting.ended_at.desc())
        .limit(limit)
    )
    return [
        RecentMeetingResponse(
            id=m.id,
            meeting_id=m.id,
            title=m.title,
            host_name=m.host_name,
            ended_at=m.ended_at,
            duration_minutes=m.duration_minutes,
        )
        for m in db.scalars(stmt)
    ]


def end_meeting(db: Session, meeting_id: str, duration_minutes: int | None) -> Meeting:
    meeting = get_meeting(db, meeting_id)
    if meeting.status == MeetingStatus.ENDED:
        return meeting

    now = utcnow()
    meeting.status = MeetingStatus.ENDED
    meeting.ended_at = now
    if duration_minutes is not None:
        meeting.duration_minutes = duration_minutes
    elif meeting.started_at is not None:
        meeting.duration_minutes = max(1, round((now - meeting.started_at).total_seconds() / 60))

    for participant in meeting.participants:
        if participant.left_at is None:
            participant.left_at = now
    db.commit()
    db.refresh(meeting)
    return meeting


def update_controls(db: Session, meeting: Meeting, update: MeetingControlsUpdate) -> Meeting:
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(meeting, field, value)
    db.commit()
    db.refresh(meeting)
    return meeting


def delete_meeting(db: Session, meeting_id: str) -> None:
    db.delete(get_meeting(db, meeting_id))
    db.commit()
