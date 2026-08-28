"""BiteRep backend API tests."""
import os
import base64
import json
import re
import time
import httpx
import pytest
import requests

BASE_URL = "https://calorie-tracker-1048.preview.emergentagent.com".rstrip("/")


@pytest.fixture(scope="module")
def user():
    """Anonymous auth, reused for module."""
    device_id = f"TEST_{int(time.time())}"
    r = requests.post(f"{BASE_URL}/api/auth/anon", json={"device_id": device_id}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "user_id" in data and data["device_id"] == device_id
    # Reuse same device_id => same user
    r2 = requests.post(f"{BASE_URL}/api/auth/anon", json={"device_id": device_id}, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["user_id"] == data["user_id"], "user_id must be stable per device_id"
    return {"user_id": data["user_id"], "device_id": device_id, "h": {"X-User-Id": data["user_id"]}}


# ---------- auth ----------
def test_root():
    r = requests.get(f"{BASE_URL}/api/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


def test_me_requires_header():
    r = requests.get(f"{BASE_URL}/api/me", timeout=10)
    assert r.status_code == 401


# ---------- onboarding & targets ----------
def test_onboarding_mifflin(user):
    payload = {
        "name": "Tester", "sex": "male", "age": 30,
        "height_cm": 180.0, "weight_kg": 80.0,
        "activity": "moderate", "goal": "lose_fat", "rate_pct": 0.5,
        "unit_system": "metric", "faith": "none", "diet_flags": {"pork": False},
    }
    r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=user["h"], timeout=15)
    assert r.status_code == 200, r.text
    t = r.json()["targets"]
    # Mifflin: 10*80 + 6.25*180 - 5*30 + 5 = 800+1125-150+5 = 1780
    assert t["bmr"] == 1780
    # maintenance = 1780*1.48 = 2634.4 -> round 2634
    assert t["maintenance"] == 2634
    # per-day adjustment: 0.5/100 * 80 * 7700 / 7 = 440
    assert t["adjustment"] == 440
    assert t["target_calories"] == 2634 - 440
    # protein_g at lose_fat = 80*2.2 = 176
    assert t["protein_g"] == 176
    assert t["fat_g"] > 0 and t["carbs_g"] > 0


# ---------- food search ----------
def test_food_search_yogurt():
    r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "yogurt"}, timeout=15)
    assert r.status_code == 200
    res = r.json()["results"]
    assert isinstance(res, list) and len(res) > 0, "expected search results"
    # kcal > 0 and de-duped by name+brand
    keys = set()
    for it in res:
        assert it["kcal_100g"] > 0, it
        k = (it["name"].lower(), it["brand"].lower())
        assert k not in keys, f"duplicate: {k}"
        keys.add(k)


# ---------- food logs ----------
def test_food_log_crud(user):
    date = "2026-01-15"
    payload = {"date": date, "meal": "lunch", "name": "TEST_Chicken",
               "brand": "", "grams": 200, "calories": 330,
               "protein_g": 60, "carbs_g": 0, "fat_g": 8, "source": "manual"}
    r = requests.post(f"{BASE_URL}/api/logs/food", json=payload, headers=user["h"], timeout=15)
    assert r.status_code == 200
    log = r.json()
    assert log["id"] and log["calories"] == 330

    r2 = requests.get(f"{BASE_URL}/api/logs/food", params={"date": date}, headers=user["h"], timeout=15)
    assert r2.status_code == 200
    ids = [x["id"] for x in r2.json()["logs"]]
    assert log["id"] in ids

    r3 = requests.delete(f"{BASE_URL}/api/logs/food/{log['id']}", headers=user["h"], timeout=15)
    assert r3.status_code == 200 and r3.json()["deleted"] == 1

    r4 = requests.get(f"{BASE_URL}/api/logs/food", params={"date": date}, headers=user["h"], timeout=15)
    assert log["id"] not in [x["id"] for x in r4.json()["logs"]]


# ---------- weight ----------
def test_weight_log(user):
    r = requests.post(f"{BASE_URL}/api/logs/weight", json={"date": "2026-01-10", "weight_kg": 80.0}, headers=user["h"], timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/logs/weight", headers=user["h"], timeout=15)
    assert r2.status_code == 200
    logs = r2.json()["logs"]
    assert any(l["date"] == "2026-01-10" and l["weight_kg"] == 80.0 for l in logs)


# ---------- workout ----------
def test_workout_log(user):
    payload = {"date": "2026-01-15", "exercises": [
        {"name": "Bench", "sets": [{"reps": 8, "weight_kg": 60, "done": True},
                                    {"reps": 6, "weight_kg": 65, "done": True}]}
    ]}
    r = requests.post(f"{BASE_URL}/api/logs/workout", json=payload, headers=user["h"], timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{BASE_URL}/api/logs/workout", headers=user["h"], timeout=15)
    assert r2.status_code == 200
    logs = r2.json()["logs"]
    assert any(l["date"] == "2026-01-15" and len(l["exercises"]) == 1 for l in logs)


# ---------- summary ----------
def test_summary_by_meal(user):
    date = "2026-01-16"
    for meal, kcal in [("breakfast", 300), ("lunch", 500)]:
        requests.post(f"{BASE_URL}/api/logs/food", json={
            "date": date, "meal": meal, "name": f"TEST_{meal}", "grams": 100,
            "calories": kcal, "protein_g": 20, "carbs_g": 30, "fat_g": 10, "source": "manual"
        }, headers=user["h"], timeout=15)
    r = requests.get(f"{BASE_URL}/api/summary", params={"date": date}, headers=user["h"], timeout=15)
    assert r.status_code == 200
    js = r.json()
    assert js["totals"]["calories"] == 800
    assert len(js["by_meal"]["breakfast"]) >= 1
    assert len(js["by_meal"]["lunch"]) >= 1


# ---------- adaptive tdee no data ----------
def test_adaptive_tdee_no_data():
    # Fresh user with no weights => reason returned
    r = requests.post(f"{BASE_URL}/api/auth/anon", json={"device_id": f"TEST_tdee_{int(time.time())}"}, timeout=15)
    uid = r.json()["user_id"]
    r2 = requests.get(f"{BASE_URL}/api/trends/adaptive-tdee", headers={"X-User-Id": uid}, timeout=15)
    assert r2.status_code == 200
    js = r2.json()
    assert js["adaptive_tdee"] is None
    assert "reason" in js


# ---------- buddy chat SSE ----------
def test_buddy_chat_sse(user):
    with httpx.stream("POST", f"{BASE_URL}/api/buddy/chat",
                      json={"text": "Say hi in 5 words."},
                      headers={**user["h"], "Content-Type": "application/json"},
                      timeout=60.0) as r:
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "text/event-stream" in ct, ct
        got_data = False
        got_done = False
        buf = ""
        for chunk in r.iter_text():
            buf += chunk
            if "data:" in buf:
                got_data = True
            if "[DONE]" in buf:
                got_done = True
                break
            if "[ERROR]" in buf:
                pytest.fail(f"SSE error: {buf[:300]}")
        assert got_data, "no data: chunks streamed"
        assert got_done, "stream did not terminate with [DONE]"


# ---------- photo food ----------
def test_photo_food(user):
    """Use a small real JPEG (an apple photo) encoded to base64."""
    # Fetch a small food image from a reliable source (jpeg)
    url = "https://picsum.photos/id/292/400/300.jpg"  # real food photo (burger)
    try:
        img = requests.get(url, timeout=15).content
    except Exception:
        pytest.skip("cannot fetch test image")
    if len(img) < 500:
        pytest.skip("test image too small")
    b64 = base64.b64encode(img).decode()
    r = requests.post(f"{BASE_URL}/api/ai/photo-food", json={"image_base64": b64},
                      headers=user["h"], timeout=90)
    assert r.status_code == 200, r.text
    js = r.json()
    assert "items" in js and isinstance(js["items"], list)
    if js["items"]:
        it = js["items"][0]
        assert "name" in it
        # grams or kcal_100g
        assert "grams" in it or "kcal_100g" in it
