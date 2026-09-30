import secrets
from datetime import timedelta

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.models import (
    Meeting,
    MeetingStatus,
    Message,
    Participant,
    ParticipantRole,
    Poll,
    PollOption,
    PollVote,
)

HOST = settings.default_host_name

# Fixed IDs for sample data — all-numeric Zoom-style (ddd-ddd-ddd).
SAMPLE_IDS = {
    "weekly_sync":      "892-573-401",
    "roadmap":          "134-820-675",
    "client_demo":      "567-238-910",
    "sprint_planning":  "301-994-822",
    "design_review":    "771-002-443",
    "all_hands":        "654-118-330",
    "one_on_one":       "489-762-051",
}


def _upcoming(now):
    specs = [
        (SAMPLE_IDS["weekly_sync"],     "Weekly Team Sync",                "Our regular Monday stand-up.",                     timedelta(days=1, hours=2), 60),
        (SAMPLE_IDS["roadmap"],         "Product Roadmap Review",          "Q4 planning session with all stakeholders.",        timedelta(days=2),         90),
        (SAMPLE_IDS["client_demo"],     "Client Presentation - Acme Corp", "Demo of the new dashboard features.",               timedelta(days=3, hours=5), 45),
        (SAMPLE_IDS["sprint_planning"], "Engineering Sprint Planning",     None,                                                timedelta(days=5),         60),
    ]
    return [
        Meeting(
            id=meeting_id,
            title=title,
            description=description,
            host_name=HOST,
            host_token=secrets.token_urlsafe(24),
            status=MeetingStatus.SCHEDULED,
            scheduled_at=now + offset,
            duration_minutes=duration,
        )
        for meeting_id, title, description, offset, duration in specs
    ]


def _ended(now):
    specs = [
        (SAMPLE_IDS["design_review"], "Design Review",     timedelta(hours=2), 40, ["Priya Sharma", "Sam Lee"]),
        (SAMPLE_IDS["all_hands"],     "All-Hands Meeting", timedelta(days=1),  90, ["Priya Sharma", "Sam Lee", "Jordan Kim"]),
        (SAMPLE_IDS["one_on_one"],    "1:1 with Manager",  timedelta(days=2),  30, ["Jordan Kim"]),
    ]
    meetings = []
    for meeting_id, title, ago, duration, guests in specs:
        ended_at = now - ago
        started_at = ended_at - timedelta(minutes=duration)
        meeting = Meeting(
            id=meeting_id,
            title=title,
            host_name=HOST,
            host_token=secrets.token_urlsafe(24),
            status=MeetingStatus.ENDED,
            started_at=started_at,
            ended_at=ended_at,
            duration_minutes=duration,
            scheduled_at=started_at,
        )
        meeting.participants = [
            Participant(display_name=HOST, role=ParticipantRole.HOST, joined_at=started_at, left_at=ended_at),
            *(
                Participant(display_name=name, joined_at=started_at, left_at=ended_at)
                for name in guests
            ),
        ]
        meetings.append(meeting)
    return meetings


def _add_chat_and_poll(meeting: Meeting) -> None:
    meeting.messages = [
        Message(sender_name=HOST, text="Thanks everyone for joining.", sent_at=meeting.started_at),
        Message(sender_name="Priya Sharma", text="Happy to be here!", sent_at=meeting.started_at + timedelta(minutes=1)),
    ]
    poll = Poll(question="Which day works best for the follow-up?", is_open=False, created_at=meeting.started_at)
    options = [PollOption(text="Tuesday"), PollOption(text="Thursday")]
    poll.options = options
    meeting.polls = [poll]
    voters = {p.display_name: p for p in meeting.participants}
    poll.votes = [
        PollVote(participant=voters["Priya Sharma"], option=options[0]),
        PollVote(participant=voters["Sam Lee"], option=options[1]),
    ]


def seed_db() -> None:
    # Create tables if they don't exist yet — never drop existing data.
    Base.metadata.create_all(bind=engine)

    now = utcnow()
    ended = _ended(now)
    _add_chat_and_poll(ended[0])


    with SessionLocal() as db:
        # Only insert sample rows that are not already in the database.
        sample_id_list = list(SAMPLE_IDS.values())
        existing_ids = {
            row for row in db.scalars(
                select(Meeting.id).where(Meeting.id.in_(sample_id_list))
            )
        }
        new_meetings = [
            m for m in (_upcoming(now) + ended)
            if m.id not in existing_ids
        ]
        if new_meetings:
            db.add_all(new_meetings)
            db.commit()
            print(f"Seeded {len(new_meetings)} new sample meeting(s).")
        else:
            print("Sample data already present — nothing to insert.")

    print("Database ready.")


if __name__ == "__main__":
    seed_db()
