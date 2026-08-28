"""Backend tests for Dietary & Religious Personalization feature.
Covers: POST /api/onboarding (diet_flags/avoided_foods/protein_sources computation),
GET /api/foods/search (avoided-food filtering), PATCH /api/profile (recompute on flag change).
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://calorie-tracker-1048.preview.emergentagent.com").rstrip("/")

ALL_ITEMS = ["beef", "pork", "chicken", "mutton", "seafood", "eggs", "dairy", "root_veg", "onion_garlic"]


def new_user(tag):
    device_id = f"TEST_diet_{tag}_{int(time.time()*1000)}"
    r = requests.post(f"{BASE_URL}/api/auth/anon", json={"device_id": device_id}, timeout=15)
    assert r.status_code == 200
    uid = r.json()["user_id"]
    return {"user_id": uid, "h": {"X-User-Id": uid}}


def base_onboarding_payload(faith="none", diet_type="omnivore", diet_flags=None):
    flags = {k: True for k in ALL_ITEMS}
    if diet_flags:
        flags.update(diet_flags)
    return {
        "name": "Test User",
        "sex": "male",
        "age": 30,
        "height_cm": 175,
        "weight_kg": 70,
        "activity": "moderate",
        "goal": "maintain",
        "unit_system": "metric",
        "faith": faith,
        "diet_type": diet_type,
        "diet_flags": flags,
    }


class TestOnboardingDietComputation:
    def test_hindu_beef_off_avoided_and_protein(self):
        u = new_user("hindu")
        payload = base_onboarding_payload(faith="Hindu", diet_type="omnivore", diet_flags={"beef": False})
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        profile = data["profile"]
        assert "beef" in profile["avoided_foods"]
        assert "Beef" not in profile["protein_sources"]
        assert "Chicken" in profile["protein_sources"]
        assert "Lentils (dal)" in profile["protein_sources"]
        # verify persisted via GET /me
        me = requests.get(f"{BASE_URL}/api/me", headers=u["h"], timeout=15)
        assert me.status_code == 200
        assert me.json()["profile"]["avoided_foods"] == profile["avoided_foods"]

    def test_vegan_all_animal_off(self):
        u = new_user("vegan")
        flags = {k: True for k in ALL_ITEMS}
        for k in ["beef", "pork", "chicken", "mutton", "seafood", "eggs", "dairy"]:
            flags[k] = False
        payload = base_onboarding_payload(faith="none", diet_type="vegan", diet_flags=flags)
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200
        profile = r.json()["profile"]
        for label in ["Chicken", "Mutton & lamb", "Fish & seafood", "Beef", "Pork", "Eggs", "Paneer & dairy"]:
            assert label not in profile["protein_sources"], f"{label} should not be present for vegan"
        for plant in ["Lentils (dal)", "Chickpeas", "Beans", "Tofu", "Soy", "Peanuts"]:
            assert plant in profile["protein_sources"]
        assert set(profile["avoided_foods"]) == {"beef", "pork", "chicken", "mutton", "seafood", "eggs", "dairy"}

    def test_missing_diet_flags_defaults_empty(self):
        """diet_flags omitted -> defaults to {} -> avoided_foods empty, protein_sources = all (default True)."""
        u = new_user("nodiet")
        payload = base_onboarding_payload()
        payload.pop("diet_flags")
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200, r.text
        profile = r.json()["profile"]
        assert profile["avoided_foods"] == []
        assert "Chicken" in profile["protein_sources"]


class TestFoodSearchFiltering:
    def test_beef_restricted_user_excludes_beef_items(self):
        u = new_user("searchbeef")
        payload = base_onboarding_payload(faith="Hindu", diet_type="omnivore", diet_flags={"beef": False})
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "beef"}, headers=u["h"], timeout=15)
        assert r2.status_code == 200
        results = r2.json().get("results", [])
        for item in results:
            text = f"{item['name']} {item['brand']}".lower()
            import re
            assert not re.search(r"\bbeef\b", text), f"beef item leaked: {item}"

    def test_unrestricted_search_rice_normal(self):
        u = new_user("searchrice")
        payload = base_onboarding_payload()  # omnivore, all True
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "rice"}, headers=u["h"], timeout=15)
        assert r2.status_code == 200
        assert isinstance(r2.json().get("results", []), list)


class TestPatchProfileRecompute:
    def test_patch_diet_flags_recomputes_avoided_and_protein(self):
        u = new_user("patch")
        payload = base_onboarding_payload()  # omnivore all True
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200
        profile0 = r.json()["profile"]
        assert profile0["avoided_foods"] == []

        new_flags = {k: True for k in ALL_ITEMS}
        new_flags["pork"] = False
        new_flags["seafood"] = False
        r2 = requests.patch(f"{BASE_URL}/api/profile", json={"profile": {"diet_flags": new_flags}}, headers=u["h"], timeout=15)
        assert r2.status_code == 200, r2.text
        profile1 = r2.json()["profile"]
        assert set(profile1["avoided_foods"]) == {"pork", "seafood"}
        assert "Pork" not in profile1["protein_sources"]
        assert "Fish & seafood" not in profile1["protein_sources"]
        assert "Chicken" in profile1["protein_sources"]

        # verify persisted
        me = requests.get(f"{BASE_URL}/api/me", headers=u["h"], timeout=15)
        assert me.status_code == 200
        assert set(me.json()["profile"]["avoided_foods"]) == {"pork", "seafood"}


class TestRegression:
    def test_summary_unaffected(self):
        u = new_user("regsummary")
        payload = base_onboarding_payload()
        r = requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/summary", params={"date": "2026-01-01"}, headers=u["h"], timeout=15)
        assert r2.status_code == 200
        body = r2.json()
        assert "totals" in body and "by_meal" in body

    def test_me_unaffected(self):
        u = new_user("regme")
        payload = base_onboarding_payload()
        requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        r = requests.get(f"{BASE_URL}/api/me", headers=u["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["onboarded"] is True

    def test_food_log_unaffected(self):
        u = new_user("reglog")
        payload = base_onboarding_payload()
        requests.post(f"{BASE_URL}/api/onboarding", json=payload, headers=u["h"], timeout=15)
        entry = {
            "date": "2026-01-01", "meal": "lunch", "name": "TEST_food", "grams": 100,
            "calories": 200, "protein_g": 10, "carbs_g": 20, "fat_g": 5, "source": "manual",
        }
        r = requests.post(f"{BASE_URL}/api/logs/food", json=entry, headers=u["h"], timeout=15)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_food"
