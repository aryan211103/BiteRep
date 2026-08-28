"""Backend tests for new BiteRep features: AI photo food, label scan, barcode,
saved-foods, recipes, weekly-recap, object storage uploads, and regression checks
on foods/search, onboarding, summary, me, logs/food, logs/workout, buddy/chat."""
import base64
import io
import os
import uuid

import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get('EXPO_BACKEND_URL').rstrip('/')


def make_test_image_b64() -> str:
    """Generate a small, real-featured JPEG (not blank/uniform) for AI vision tests."""
    img = Image.new('RGB', (400, 300), color=(200, 150, 100))
    d = ImageDraw.Draw(img)
    d.ellipse((50, 50, 350, 250), fill=(255, 200, 50))
    d.rectangle((100, 100, 300, 200), fill=(100, 50, 20))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=85)
    return base64.b64encode(buf.getvalue()).decode('utf-8')


@pytest.fixture(scope="module")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def user_id(api_client):
    """Create a fresh onboarded test user via anon auth + onboarding."""
    device_id = f"TEST_{uuid.uuid4()}"
    r = api_client.post(f"{BASE_URL}/api/auth/anon", json={"device_id": device_id})
    assert r.status_code == 200
    uid = r.json()["user_id"]
    api_client.headers.update({"X-User-Id": uid})
    onboarding_payload = {
        "name": "TEST_User",
        "sex": "male",
        "age": 28,
        "height_cm": 175,
        "weight_kg": 75,
        "activity": "moderate",
        "goal": "maintain",
        "unit_system": "metric",
        "faith": "none",
        "diet_type": "omnivore",
        "diet_flags": {"beef": True, "pork": True, "chicken": True, "seafood": True, "eggs": True, "dairy": True},
    }
    r2 = api_client.post(f"{BASE_URL}/api/onboarding", json=onboarding_payload)
    assert r2.status_code == 200
    return uid


class TestRegressionCore:
    """Spot-check existing endpoints are unaffected by the new feature build."""

    def test_me(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/me")
        assert r.status_code == 200
        assert r.json()["id"] == user_id

    def test_summary(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/summary", params={"date": "2026-01-01"})
        assert r.status_code == 200
        data = r.json()
        assert "totals" in data and "by_meal" in data

    def test_food_search_basic(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/foods/search", params={"q": "chicken breast"})
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) > 0
        for item in results:
            assert item["serving_kcal"] > 0 or item.get("source") == "saved"

    def test_logs_food_create_and_get(self, api_client, user_id):
        payload = {"date": "2026-01-01", "meal": "lunch", "name": "TEST_Food", "grams": 100, "calories": 200}
        r = api_client.post(f"{BASE_URL}/api/logs/food", json=payload)
        assert r.status_code == 200
        log_id = r.json()["id"]
        r2 = api_client.get(f"{BASE_URL}/api/logs/food", params={"date": "2026-01-01"})
        assert any(l["id"] == log_id for l in r2.json()["logs"])
        # cleanup
        api_client.delete(f"{BASE_URL}/api/logs/food/{log_id}")

    def test_logs_workout(self, api_client, user_id):
        payload = {"date": "2026-01-01", "exercises": [{"name": "TEST_Bench", "sets": [{"reps": 10, "weight_kg": 50}]}]}
        r = api_client.post(f"{BASE_URL}/api/logs/workout", json=payload)
        assert r.status_code == 200


class TestBarcodeLookup:
    """GET /api/foods/barcode/{code}"""

    @pytest.mark.parametrize("code", ["3017620422003", "5449000000996"])
    def test_known_barcode(self, api_client, user_id, code):
        r = api_client.get(f"{BASE_URL}/api/foods/barcode/{code}")
        assert r.status_code == 200
        data = r.json()
        assert data["code"] == code or data.get("code") is not None
        assert "name" in data and data["name"]
        for key in ["serving_label", "serving_kcal", "serving_protein", "serving_carbs", "serving_fat"]:
            assert key in data

    def test_invalid_barcode(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/foods/barcode/000000000000")
        assert r.status_code == 404


class TestSavedFoodsAndSearchIntegration:
    """POST /api/saved-foods, GET /api/saved-foods, and search prepend behavior."""

    def test_create_and_list_saved_food(self, api_client, user_id):
        payload = {
            "name": "TEST_UniqueSnackXYZ",
            "brand": "TEST_Brand",
            "serving_grams": 50,
            "kcal_100g": 400,
            "protein_100g": 10,
            "carbs_100g": 50,
            "fat_100g": 15,
        }
        r = api_client.post(f"{BASE_URL}/api/saved-foods", json=payload)
        assert r.status_code == 200
        created = r.json()
        assert created["name"] == payload["name"]

        r2 = api_client.get(f"{BASE_URL}/api/saved-foods")
        assert r2.status_code == 200
        assert any(f["name"] == payload["name"] for f in r2.json()["foods"])

    def test_saved_food_appears_first_in_search(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/foods/search", params={"q": "UniqueSnackXYZ"})
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) > 0
        assert results[0]["source"] == "saved"
        assert results[0]["name"] == "TEST_UniqueSnackXYZ"


class TestRecipes:
    """POST/GET/DELETE /api/recipes and POST /api/recipes/{id}/relog"""

    def test_create_list_relog_delete_recipe(self, api_client, user_id):
        payload = {
            "name": "TEST_Recipe1",
            "items": [
                {"name": "Rice", "grams": 150, "calories": 200, "protein_g": 4, "carbs_g": 45, "fat_g": 1},
                {"name": "Chicken", "grams": 100, "calories": 165, "protein_g": 31, "carbs_g": 0, "fat_g": 4},
            ],
        }
        r = api_client.post(f"{BASE_URL}/api/recipes", json=payload)
        assert r.status_code == 200
        recipe = r.json()
        assert recipe["totals"]["calories"] == 365
        recipe_id = recipe["id"]

        r2 = api_client.get(f"{BASE_URL}/api/recipes")
        assert any(x["id"] == recipe_id for x in r2.json()["recipes"])

        r3 = api_client.post(f"{BASE_URL}/api/recipes/{recipe_id}/relog", json={"date": "2026-01-02", "meal": "dinner"})
        assert r3.status_code == 200
        logs = r3.json()["logs"]
        assert len(logs) == 2
        assert all(l["source"] == "recipe" for l in logs)

        r4 = api_client.get(f"{BASE_URL}/api/logs/food", params={"date": "2026-01-02"})
        food_logs = r4.json()["logs"]
        assert sum(1 for l in food_logs if l.get("source") == "recipe") >= 2

        r5 = api_client.delete(f"{BASE_URL}/api/recipes/{recipe_id}")
        assert r5.status_code == 200
        assert r5.json()["deleted"] == 1
        r6 = api_client.get(f"{BASE_URL}/api/recipes")
        assert not any(x["id"] == recipe_id for x in r6.json()["recipes"])


class TestWeeklyRecap:
    def test_weekly_recap_shape(self, api_client, user_id):
        r = api_client.get(f"{BASE_URL}/api/trends/weekly-recap")
        assert r.status_code == 200
        data = r.json()
        assert len(data["days"]) == 7
        for d in data["days"]:
            assert "date" in d and "calories" in d and "protein_g" in d
        assert "avg_calories" in data
        assert "target_calories" in data
        assert "adherence_pct" in data
        assert "logged_days" in data


class TestObjectStorageUpload:
    def test_upload_photo_and_fetch(self, api_client, user_id):
        b64 = make_test_image_b64()
        r = api_client.post(f"{BASE_URL}/api/uploads/photo", json={"image_base64": b64, "content_type": "image/jpeg"})
        assert r.status_code == 200
        path = r.json()["path"]
        assert user_id in path

        r2 = api_client.get(f"{BASE_URL}/api/files/{path}")
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("image")


class TestAIPhotoFood:
    def test_ai_photo_food(self, api_client, user_id):
        b64 = make_test_image_b64()
        r = api_client.post(f"{BASE_URL}/api/ai/photo-food", json={"image_base64": b64})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        for it in data["items"]:
            assert "matched" in it
            assert "source" in it and it["source"] in ("openfoodfacts", "ai")
            assert "brand" in it
            assert "off_code" in it
            assert "kcal_100g" in it


class TestAIPhotoLabel:
    def test_ai_photo_label(self, api_client, user_id):
        b64 = make_test_image_b64()
        r = api_client.post(f"{BASE_URL}/api/ai/photo-label", json={"image_base64": b64})
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ["name", "brand", "serving_grams", "kcal_100g", "protein_100g", "carbs_100g", "fat_100g"]:
            assert key in data
