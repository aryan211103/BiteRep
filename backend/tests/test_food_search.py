"""Tests for GET /api/foods/search - relevance ranking, dedup, serving info, country bias fallback."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def user():
    device_id = f"TEST_search_{int(time.time())}"
    r = requests.post(f"{BASE_URL}/api/auth/anon", json={"device_id": device_id}, timeout=15)
    assert r.status_code == 200
    return r.json()["user_id"]


QUERIES = ["butter chicken", "chicken breast", "yogurt", "apple"]


@pytest.mark.parametrize("q", QUERIES)
def test_search_relevance_and_fields(q, user):
    r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": q}, headers={"X-User-Id": user}, timeout=25)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "results" in data
    results = data["results"]
    assert len(results) > 0, f"No results for query '{q}'"

    tokens = [t for t in q.lower().split() if len(t) > 1]
    seen_keys = set()
    for item in results:
        # required fields present
        for field in ["name", "brand", "serving_label", "serving_grams", "serving_kcal",
                      "serving_protein", "serving_carbs", "serving_fat",
                      "kcal_100g", "protein_100g", "carbs_100g", "fat_100g"]:
            assert field in item, f"Missing field {field} in result for '{q}': {item}"

        # relevance: at least one query token in name/brand
        text = f"{item['name']} {item.get('brand','')}".lower()
        assert any(t in text for t in tokens), f"Irrelevant result for '{q}': {item['name']} / {item.get('brand')}"

        # no 0-kcal items
        assert item["kcal_100g"] > 0, f"Zero-kcal item leaked for '{q}': {item}"
        assert item["serving_kcal"] is not None

        # dedup key: name+brand+serving_grams rounded
        key = (item["name"].lower(), item.get("brand", "").lower(), round(item["serving_grams"]))
        assert key not in seen_keys, f"Duplicate result leaked for '{q}': {key}"
        seen_keys.add(key)

        # serving_label populated
        assert item["serving_label"], f"Empty serving_label for '{q}': {item}"


def test_search_short_query_returns_empty():
    r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "a"}, timeout=10)
    assert r.status_code == 200
    assert r.json()["results"] == []


def test_search_country_param_accepted(user):
    r = requests.get(f"{BASE_URL}/api/foods/search", params={"q": "chicken breast", "country": "india"},
                      headers={"X-User-Id": user}, timeout=25)
    assert r.status_code == 200
    assert isinstance(r.json().get("results"), list)
