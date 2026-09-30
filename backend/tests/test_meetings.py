import re
from datetime import datetime, timedelta, timezone


def _future(days=1):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def test_instant_meeting_is_live_and_returns_host_token(client):
    res = client.post("/api/meetings/instant")
    assert res.status_code == 200
    body = res.json()
    # Meeting ID must be numeric Zoom-style: ddd-ddd-ddd
    assert re.fullmatch(r"\d{3}-\d{3}-\d{3}", body["id"]), f"Bad ID format: {body['id']}"
    assert body["status"] == "live"
    assert body["is_instant"] is True
    assert body["host_token"]


def test_get_meeting_hides_host_token_and_404s_when_missing(client):
    meeting_id = client.post("/api/meetings/instant").json()["id"]

    found = client.get(f"/api/meetings/{meeting_id}")
    assert found.status_code == 200
    assert "host_token" not in found.json()

    assert client.get("/api/meetings/nope-nope-nop").status_code == 404


def test_schedule_meeting_appears_in_upcoming_sorted(client):
    client.post("/api/meetings/schedule", json={"title": "Later", "scheduled_at": _future(3), "duration": 30})
    client.post("/api/meetings/schedule", json={"title": "Sooner", "scheduled_at": _future(1), "duration": 60})

    upcoming = client.get("/api/meetings/upcoming").json()
    assert [m["title"] for m in upcoming] == ["Sooner", "Later"]
    assert upcoming[0]["duration"] == 60


def test_past_and_instant_meetings_not_upcoming(client):
    # The API now rejects scheduling in the past with 422.
    past_res = client.post("/api/meetings/schedule", json={"title": "Past", "scheduled_at": _future(-1)})
    assert past_res.status_code == 422
    # Instant meetings are live, not scheduled — they never appear in upcoming.
    client.post("/api/meetings/instant")
    assert client.get("/api/meetings/upcoming").json() == []


def test_schedule_validates_input(client):
    assert client.post("/api/meetings/schedule", json={"title": "", "scheduled_at": _future()}).status_code == 422
    assert client.post("/api/meetings/schedule", json={"title": "x"}).status_code == 422
    assert client.post(
        "/api/meetings/schedule", json={"title": "x", "scheduled_at": _future(), "duration": 0}
    ).status_code == 422
    # Server-side past-date guard (client-side check is not enough).
    assert client.post(
        "/api/meetings/schedule", json={"title": "x", "scheduled_at": _future(-2)}
    ).status_code == 422


def _host_headers(meeting):
    return {"X-Host-Token": meeting["host_token"]}


def test_ending_meeting_moves_it_to_recent(client):
    meeting = client.post("/api/meetings/instant").json()
    meeting_id = meeting["id"]

    res = client.post(f"/api/meetings/{meeting_id}/end", json={"duration_minutes": 25}, headers=_host_headers(meeting))
    assert res.status_code == 200

    recent = client.get("/api/meetings/recent").json()
    assert len(recent) == 1
    assert recent[0]["meeting_id"] == meeting_id
    assert recent[0]["duration_minutes"] == 25
    assert client.get(f"/api/meetings/{meeting_id}").json()["status"] == "ended"


def test_end_and_delete_require_the_host_token(client):
    meeting_id = client.post("/api/meetings/instant").json()["id"]

    assert client.post(f"/api/meetings/{meeting_id}/end", json={}).status_code == 403
    assert client.post(f"/api/meetings/{meeting_id}/end", json={}, headers={"X-Host-Token": "wrong"}).status_code == 403
    assert client.delete(f"/api/meetings/{meeting_id}").status_code == 403
    assert client.get(f"/api/meetings/{meeting_id}").json()["status"] == "live"


def test_end_unknown_meeting_is_404(client):
    assert client.post("/api/meetings/missing/end", json={}).status_code == 404


def test_delete_meeting(client):
    meeting = client.post("/api/meetings/instant").json()
    meeting_id = meeting["id"]
    assert client.delete(f"/api/meetings/{meeting_id}", headers=_host_headers(meeting)).status_code == 200
    assert client.get(f"/api/meetings/{meeting_id}").status_code == 404


def test_timestamps_are_tagged_utc_so_browsers_dont_read_them_as_local(client):
    created = client.post(
        "/api/meetings/schedule", json={"title": "TZ", "scheduled_at": "2999-01-01T10:00:00+05:30"}
    ).json()

    assert created["scheduled_at"] == "2999-01-01T04:30:00Z"
    assert created["created_at"].endswith("Z")
