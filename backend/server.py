"""BiteRep backend: anonymous auth, food/weight/workout logs, Open Food Facts search, AI buddy, photo food."""
from fastapi import FastAPI, APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime, timezone, timedelta
from starlette.concurrency import run_in_threadpool
import os
import re
import json
import uuid
import asyncio
import logging
import httpx
import requests
import base64

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, TextDelta, StreamDone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ==================== OBJECT STORAGE (Emergent managed) ====================
APP_NAME = "biterep"
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
_storage_key: Optional[str] = None


def _init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    global _storage_key
    key = _init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                             headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _get_object_sync(path: str) -> tuple:
    global _storage_key
    key = _init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ==================== HELPERS ====================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.on_event("startup")
async def _startup_storage():
    try:
        await run_in_threadpool(_init_storage)
    except Exception as e:
        logger.warning(f"Object storage init deferred/failed at startup: {e}")


# ==================== DIET / CULTURAL PERSONALIZATION ====================
DIET_ITEMS = ["beef", "pork", "chicken", "mutton", "seafood", "eggs", "dairy", "root_veg", "onion_garlic"]

# Keywords (word-boundary matched) used to detect a food item as containing an avoided ingredient.
FOOD_KEYWORDS: Dict[str, List[str]] = {
    "beef": ["beef", "steak", "veal", "brisket"],
    "pork": ["pork", "bacon", "ham", "prosciutto", "pepperoni", "salami", "lard", "sausage", "chorizo"],
    "chicken": ["chicken", "poultry"],
    "mutton": ["mutton", "lamb", "goat"],
    "seafood": ["fish", "seafood", "shrimp", "shrimps", "prawn", "prawns", "salmon", "tuna", "crab",
                "lobster", "squid", "octopus", "anchovy", "anchovies", "sardine", "sardines", "cod",
                "tilapia", "shellfish"],
    "eggs": ["egg", "eggs"],
    "dairy": ["milk", "cheese", "yogurt", "yoghurt", "butter", "cream", "paneer", "ghee", "curd", "dairy"],
    "root_veg": ["potato", "potatoes", "carrot", "carrots", "beet", "beets", "radish", "turnip", "yam", "sweet potato"],
    "onion_garlic": ["onion", "onions", "garlic"],
}

# Labels used to build a personalized "your protein sources" list.
PROTEIN_LABELS: Dict[str, str] = {
    "chicken": "Chicken",
    "mutton": "Mutton & lamb",
    "seafood": "Fish & seafood",
    "beef": "Beef",
    "pork": "Pork",
    "eggs": "Eggs",
    "dairy": "Paneer & dairy",
}
PLANT_PROTEINS = ["Lentils (dal)", "Chickpeas", "Beans", "Tofu", "Soy", "Peanuts"]


def compute_avoided_foods(diet_flags: Dict[str, bool]) -> List[str]:
    """Return the list of food keys the user has toggled OFF."""
    return [k for k in DIET_ITEMS if diet_flags.get(k) is False]


def compute_protein_sources(diet_flags: Dict[str, bool]) -> List[str]:
    """Build a warm, personalized list of protein sources the user actually eats."""
    sources: List[str] = []
    for key in ["chicken", "mutton", "seafood", "eggs", "dairy", "beef", "pork"]:
        if diet_flags.get(key, True):
            sources.append(PROTEIN_LABELS[key])
    sources.extend(PLANT_PROTEINS)
    return sources


def food_matches_avoided(name: str, brand: str, avoided: List[str]) -> bool:
    """Word-boundary keyword match to detect if a food item contains an avoided ingredient."""
    text = f"{name} {brand}".lower()
    for a in avoided:
        for kw in FOOD_KEYWORDS.get(a, []):
            if re.search(rf"\b{re.escape(kw)}\b", text):
                return True
    return False


def compute_targets(profile: Dict[str, Any]) -> Dict[str, Any]:
    """Compute BMR, maintenance, target calories & macros using Mifflin-St Jeor."""
    sex = profile.get("sex", "male")
    age = float(profile.get("age", 30))
    kg = float(profile.get("weight_kg", 70))
    cm = float(profile.get("height_cm", 170))
    activity = profile.get("activity", "moderate")
    goal = profile.get("goal", "maintain")
    rp = profile.get("rate_pct")
    if rp is None:
        rp = 0.5 if goal == "lose_fat" else (0.25 if goal == "build_muscle" else 0)
    rate_pct = float(rp)

    bmr = 10 * kg + 6.25 * cm - 5 * age + (5 if sex == "male" else -161)
    activity_map = {"sedentary": 1.2, "light": 1.375, "moderate": 1.48, "active": 1.6, "athlete": 1.75}
    factor = activity_map.get(activity, 1.48)
    maintenance = bmr * factor

    per_day_adj = (rate_pct / 100 * kg * 7700) / 7
    if goal == "lose_fat":
        target = maintenance - per_day_adj
    elif goal == "build_muscle":
        target = maintenance + per_day_adj
    else:
        target = maintenance

    protein_g = kg * (2.2 if goal == "lose_fat" else 2.0)
    fat_g = (target * 0.25) / 9
    carbs_g = (target - protein_g * 4 - fat_g * 9) / 4

    return {
        "bmr": round(bmr),
        "maintenance": round(maintenance),
        "adjustment": round(per_day_adj if goal != "maintain" else 0),
        "target_calories": round(target),
        "protein_g": round(protein_g),
        "fat_g": round(fat_g),
        "carbs_g": round(max(carbs_g, 0)),
        "rate_pct": rate_pct,
    }


# ==================== MODELS ====================
class AnonAuthRequest(BaseModel):
    device_id: Optional[str] = None


class OnboardingData(BaseModel):
    name: str
    sex: str  # "male" | "female"
    age: int
    height_cm: float
    weight_kg: float
    activity: str
    goal: str  # "lose_fat" | "maintain" | "build_muscle"
    rate_pct: Optional[float] = None
    unit_system: str = "imperial"  # or "metric"
    faith: Optional[str] = "none"
    diet_type: Optional[str] = "omnivore"  # omnivore|eggetarian|vegetarian|vegan|pescatarian
    diet_flags: Dict[str, bool] = Field(default_factory=dict)  # e.g. {"beef": False, "pork": False}


class TargetsOverride(BaseModel):
    target_calories: Optional[int] = None
    protein_g: Optional[int] = None
    carbs_g: Optional[int] = None
    fat_g: Optional[int] = None


class FoodLogCreate(BaseModel):
    date: str  # YYYY-MM-DD
    meal: str  # breakfast|lunch|snacks|dinner
    name: str
    brand: Optional[str] = ""
    grams: float
    calories: float
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    source: str = "manual"  # "openfoodfacts" | "ai" | "manual" | "saved" | "recipe"
    off_code: Optional[str] = None
    photo_path: Optional[str] = None


class WeightLogCreate(BaseModel):
    date: str
    weight_kg: float


class WorkoutSet(BaseModel):
    reps: int
    weight_kg: float
    done: bool = True


class WorkoutExercise(BaseModel):
    name: str
    sets: List[WorkoutSet]


class WorkoutCreate(BaseModel):
    date: str
    exercises: List[WorkoutExercise]


class ChatMessage(BaseModel):
    text: str


class PhotoFoodRequest(BaseModel):
    image_base64: str


class PhotoLabelRequest(BaseModel):
    image_base64: str


class PhotoUploadRequest(BaseModel):
    image_base64: str
    content_type: str = "image/jpeg"


class SavedFoodCreate(BaseModel):
    name: str
    brand: Optional[str] = ""
    serving_grams: float = 100
    kcal_100g: float
    protein_100g: float = 0
    carbs_100g: float = 0
    fat_100g: float = 0


class RecipeItem(BaseModel):
    name: str
    brand: Optional[str] = ""
    grams: float
    calories: float
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0


class RecipeCreate(BaseModel):
    name: str
    items: List[RecipeItem]


class RecipeRelog(BaseModel):
    date: str
    meal: str


# ==================== AUTH DEPENDENCY ====================
async def get_user_id(x_user_id: Optional[str] = Header(None)) -> str:
    if not x_user_id:
        raise HTTPException(401, "Missing X-User-Id header")
    return x_user_id


# ==================== AUTH ====================
@api_router.post("/auth/anon")
async def anon_auth(req: AnonAuthRequest):
    """Create or fetch anonymous user by device_id."""
    device_id = req.device_id or str(uuid.uuid4())
    user = await db.users.find_one({"device_id": device_id}, {"_id": 0})
    if not user:
        user = {
            "id": str(uuid.uuid4()),
            "device_id": device_id,
            "created_at": now_iso(),
            "onboarded": False,
            "profile": {},
            "targets": {},
        }
        await db.users.insert_one(dict(user))
    return {"user_id": user["id"], "device_id": device_id, "onboarded": user.get("onboarded", False), "profile": user.get("profile", {}), "targets": user.get("targets", {})}


@api_router.get("/me")
async def me(user_id: str = None, x_user_id: Optional[str] = Header(None)):
    uid = x_user_id or user_id
    if not uid:
        raise HTTPException(401, "Missing user id")
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    if not user:
        raise HTTPException(404, "User not found")
    return user


@api_router.post("/onboarding")
async def onboarding(data: OnboardingData, user_id: str = Header(..., alias="X-User-Id")):
    targets = compute_targets(data.dict())
    profile = data.dict()
    profile["avoided_foods"] = compute_avoided_foods(profile.get("diet_flags", {}))
    profile["protein_sources"] = compute_protein_sources(profile.get("diet_flags", {}))
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "onboarded": True,
            "profile": profile,
            "targets": targets,
            "updated_at": now_iso(),
        }},
    )
    return {"targets": targets, "profile": profile}


@api_router.patch("/profile")
async def update_profile(payload: Dict[str, Any], user_id: str = Header(..., alias="X-User-Id")):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404)
    profile = {**user.get("profile", {}), **payload.get("profile", {})}
    if "diet_flags" in (payload.get("profile") or {}):
        profile["avoided_foods"] = compute_avoided_foods(profile.get("diet_flags", {}))
        profile["protein_sources"] = compute_protein_sources(profile.get("diet_flags", {}))
    targets_override = payload.get("targets") or {}
    computed = compute_targets(profile)
    final_targets = {**computed, **{k: v for k, v in targets_override.items() if v is not None}}
    await db.users.update_one({"id": user_id}, {"$set": {"profile": profile, "targets": final_targets}})
    return {"profile": profile, "targets": final_targets}


# ==================== FOOD SEARCH (Open Food Facts) ====================
def _parse_size_grams(serving_size: Any, serving_quantity: Any, quantity: Any) -> float:
    """Best-effort parse of a real serving size (in grams/ml) from OFF fields."""
    if serving_quantity:
        try:
            v = float(str(serving_quantity).replace(",", "."))
            if v > 0:
                return v
        except Exception:
            pass
    for raw in (serving_size, quantity):
        if not raw:
            continue
        m = re.search(r"([\d]+(?:[.,]\d+)?)\s*(kg|kilo|ml|millilitre|milliliter|l|litre|liter|g|gram)\b", str(raw).lower())
        if m:
            try:
                val = float(m.group(1).replace(",", "."))
            except Exception:
                continue
            unit = m.group(2)
            if unit.startswith("kg") or unit.startswith("kilo") or unit.startswith("l") or unit.startswith("litre") or unit.startswith("liter"):
                val *= 1000
            if val > 0:
                return val
    return 100.0


def _serving_label(serving_size: Any, grams: float) -> str:
    if serving_size and str(serving_size).strip():
        return str(serving_size).strip()
    return f"{int(round(grams))} g"


async def _off_query(q: str, country: Optional[str], page_size: int = 40) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {
        "q": q,
        "page_size": page_size,
        "fields": "code,product_name,brands,serving_size,serving_quantity,nutriments,quantity,countries_tags,unique_scans_n,scans_n",
    }
    if country:
        params["countries_tags"] = f"en:{country.lower()}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.get("https://search.openfoodfacts.org/search", params=params)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning(f"OFF search failed (country={country}): {e}")
        return []
    return data.get("hits", []) or data.get("products", [])


def _process_hits(hits: List[Dict[str, Any]], query_tokens: List[str], avoided: List[str]) -> tuple:
    """Filter/score/normalize raw OFF hits into candidate result dicts. Returns (candidates, hidden_count)."""
    candidates = []
    hidden_count = 0
    for hit in hits:
        pn = hit.get("product_name") or ""
        if isinstance(pn, list):
            pn = next((x for x in pn if x), "")
        if isinstance(pn, dict):
            pn = pn.get("en") or next(iter(pn.values()), "")
        name = str(pn or "").strip()
        br = hit.get("brands") or ""
        if isinstance(br, list):
            br = ", ".join(str(x) for x in br if x)
        brand = str(br or "").strip()
        if not name:
            continue

        nutr = hit.get("nutriments") or {}
        kcal_100 = nutr.get("energy-kcal_100g") or nutr.get("energy-kcal") or 0
        if isinstance(kcal_100, str):
            try:
                kcal_100 = float(kcal_100)
            except Exception:
                kcal_100 = 0
        kcal_100 = float(kcal_100 or 0)
        if kcal_100 <= 0:
            continue  # drop zero-calorie / missing-data entries

        if avoided and food_matches_avoided(name, brand, avoided):
            hidden_count += 1
            continue

        text = f"{name} {brand}".lower()
        relevance = sum(1 for t in query_tokens if t and t in text)
        if query_tokens and relevance == 0:
            continue  # not actually relevant to the search terms

        grams = _parse_size_grams(hit.get("serving_size"), hit.get("serving_quantity"), hit.get("quantity"))
        label = _serving_label(hit.get("serving_size"), grams)
        prot = float(nutr.get("proteins_100g") or 0)
        carbs = float(nutr.get("carbohydrates_100g") or 0)
        fat = float(nutr.get("fat_100g") or 0)
        popularity = hit.get("unique_scans_n") or hit.get("scans_n") or 0
        try:
            popularity = int(popularity)
        except Exception:
            popularity = 0

        candidates.append({
            "code": hit.get("code"),
            "name": name,
            "brand": brand,
            "serving_label": label,
            "serving_grams": round(grams, 1),
            "serving_kcal": round(kcal_100 * grams / 100),
            "serving_protein": round(prot * grams / 100, 1),
            "serving_carbs": round(carbs * grams / 100, 1),
            "serving_fat": round(fat * grams / 100, 1),
            "kcal_100g": round(kcal_100, 1),
            "protein_100g": round(prot, 1),
            "carbs_100g": round(carbs, 1),
            "fat_100g": round(fat, 1),
            "_relevance": relevance,
            "_popularity": popularity,
        })
    return candidates, hidden_count


async def _ground_item(name: str) -> Optional[Dict[str, Any]]:
    """Try to ground an AI-detected dish name against real Open Food Facts data."""
    name = (name or "").strip()
    if not name:
        return None
    tokens = [t for t in re.split(r"\s+", name.lower()) if len(t) > 1]
    if not tokens:
        return None
    hits = await _off_query(name, "united-states", page_size=10)
    candidates, _ = _process_hits(hits, tokens, [])
    if not candidates:
        hits2 = await _off_query(name, None, page_size=10)
        candidates, _ = _process_hits(hits2, tokens, [])
    if not candidates:
        return None
    best = sorted(candidates, key=lambda c: (c["_relevance"], c["_popularity"]), reverse=True)[0]
    if best["_relevance"] < 1:
        return None
    return best


@api_router.get("/foods/search")
async def food_search(q: str, country: Optional[str] = None, x_user_id: Optional[str] = Header(None)):
    if not q or len(q) < 2:
        return {"results": []}

    avoided: List[str] = []
    if x_user_id:
        user = await db.users.find_one({"id": x_user_id}, {"_id": 0, "profile": 1})
        if user:
            avoided = user.get("profile", {}).get("avoided_foods", []) or []

    query_tokens = [t for t in re.split(r"\s+", q.lower().strip()) if len(t) > 1]
    bias_country = country or "united-states"

    # Saved foods (from label scans etc.) always show first, per user request.
    saved_matches: List[Dict[str, Any]] = []
    if x_user_id:
        saved = await db.saved_foods.find({"user_id": x_user_id}, {"_id": 0}).to_list(200)
        qlow = q.lower().strip()
        for sf in saved:
            text = f"{sf.get('name','')} {sf.get('brand','')}".lower()
            if qlow in text or any(t in text for t in query_tokens):
                grams = sf.get("serving_grams", 100)
                saved_matches.append({
                    "code": None,
                    "name": sf.get("name", ""),
                    "brand": sf.get("brand", ""),
                    "serving_label": f"{int(round(grams))} g",
                    "serving_grams": grams,
                    "serving_kcal": round(sf.get("kcal_100g", 0) * grams / 100),
                    "serving_protein": round(sf.get("protein_100g", 0) * grams / 100, 1),
                    "serving_carbs": round(sf.get("carbs_100g", 0) * grams / 100, 1),
                    "serving_fat": round(sf.get("fat_100g", 0) * grams / 100, 1),
                    "kcal_100g": sf.get("kcal_100g", 0),
                    "protein_100g": sf.get("protein_100g", 0),
                    "carbs_100g": sf.get("carbs_100g", 0),
                    "fat_100g": sf.get("fat_100g", 0),
                    "source": "saved",
                    "saved_id": sf.get("id"),
                })
        if avoided:
            saved_matches = [m for m in saved_matches if not food_matches_avoided(m["name"], m["brand"], avoided)]

    hits = await _off_query(q, bias_country)
    candidates, hidden_count = _process_hits(hits, query_tokens, avoided)

    # Fallback to a global (non-country-biased) query if too few good matches
    if len(candidates) < 8:
        global_hits = await _off_query(q, None)
        seen_codes = {c.get("code") for c in candidates if c.get("code")}
        extra_hits = [h for h in global_hits if h.get("code") not in seen_codes]
        extra_candidates, extra_hidden = _process_hits(extra_hits, query_tokens, avoided)
        candidates.extend(extra_candidates)
        hidden_count += extra_hidden

    # De-duplicate near-identical products (same name + brand + serving size), keeping the most-scanned
    best: Dict[str, Dict[str, Any]] = {}
    for c in candidates:
        key = f"{c['name'].lower()}|{c['brand'].lower()}|{round(c['serving_grams'])}"
        existing = best.get(key)
        if not existing or c["_popularity"] > existing["_popularity"]:
            best[key] = c

    ranked = sorted(best.values(), key=lambda c: (c["_relevance"], c["_popularity"]), reverse=True)
    results = list(saved_matches)
    for c in ranked:
        if len(results) >= 20:
            break
        c = dict(c)
        c.pop("_relevance", None)
        c.pop("_popularity", None)
        c["source"] = c.get("source", "openfoodfacts")
        results.append(c)

    return {"results": results, "hidden_count": hidden_count}


@api_router.get("/foods/barcode/{code}")
async def food_barcode(code: str):
    """Look up a single product by barcode via Open Food Facts."""
    fields = "code,product_name,brands,serving_size,serving_quantity,nutriments,quantity"
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.get(f"https://world.openfoodfacts.org/api/v2/product/{code}.json", params={"fields": fields})
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning(f"barcode lookup failed: {e}")
        raise HTTPException(502, "Lookup failed")
    if data.get("status") != 1 or not data.get("product"):
        raise HTTPException(404, "Product not found for this barcode")
    hit = dict(data["product"])
    hit.setdefault("code", code)
    candidates, _ = _process_hits([hit], [], [])
    if not candidates:
        raise HTTPException(404, "No nutrition data available for this product")
    c = dict(candidates[0])
    c.pop("_relevance", None)
    c.pop("_popularity", None)
    c["source"] = "openfoodfacts"
    return c


# ==================== SAVED FOODS (from label scans) ====================
@api_router.post("/saved-foods")
async def create_saved_food(data: SavedFoodCreate, user_id: str = Header(..., alias="X-User-Id")):
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": now_iso(), "use_count": 0, **data.dict()}
    await db.saved_foods.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/saved-foods")
async def list_saved_foods(user_id: str = Header(..., alias="X-User-Id")):
    cursor = db.saved_foods.find({"user_id": user_id}, {"_id": 0}).sort([("use_count", -1), ("created_at", -1)])
    return {"foods": await cursor.to_list(200)}


# ==================== RECIPES ====================
@api_router.post("/recipes")
async def create_recipe(data: RecipeCreate, user_id: str = Header(..., alias="X-User-Id")):
    items = [it.dict() for it in data.items]
    totals = {
        "calories": round(sum(i["calories"] for i in items)),
        "protein_g": round(sum(i["protein_g"] for i in items)),
        "carbs_g": round(sum(i["carbs_g"] for i in items)),
        "fat_g": round(sum(i["fat_g"] for i in items)),
    }
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "name": data.name, "items": items, "totals": totals, "created_at": now_iso()}
    await db.recipes.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/recipes")
async def list_recipes(user_id: str = Header(..., alias="X-User-Id")):
    cursor = db.recipes.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1)
    return {"recipes": await cursor.to_list(200)}


@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user_id: str = Header(..., alias="X-User-Id")):
    r = await db.recipes.delete_one({"id": recipe_id, "user_id": user_id})
    return {"deleted": r.deleted_count}


@api_router.post("/recipes/{recipe_id}/relog")
async def relog_recipe(recipe_id: str, data: RecipeRelog, user_id: str = Header(..., alias="X-User-Id")):
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(404, "Recipe not found")
    created = []
    for it in recipe.get("items", []):
        doc = {
            "id": str(uuid.uuid4()), "user_id": user_id, "created_at": now_iso(),
            "date": data.date, "meal": data.meal,
            "name": it.get("name", ""), "brand": it.get("brand", ""), "grams": it.get("grams", 0),
            "calories": it.get("calories", 0), "protein_g": it.get("protein_g", 0),
            "carbs_g": it.get("carbs_g", 0), "fat_g": it.get("fat_g", 0),
            "source": "recipe", "off_code": None, "photo_path": None,
        }
        await db.food_logs.insert_one(dict(doc))
        doc.pop("_id", None)
        created.append(doc)
    return {"logs": created}


# ==================== OBJECT STORAGE ENDPOINTS ====================
@api_router.post("/uploads/photo")
async def upload_photo(req: PhotoUploadRequest, user_id: str = Header(..., alias="X-User-Id")):
    b64 = req.image_base64
    if "," in b64 and b64.startswith("data:"):
        b64 = b64.split(",", 1)[1]
    try:
        data = base64.b64decode(b64)
    except Exception:
        raise HTTPException(400, "Invalid image data")
    ext = "png" if "png" in (req.content_type or "") else "jpg"
    path = f"{APP_NAME}/uploads/{user_id}/{uuid.uuid4()}.{ext}"
    try:
        await run_in_threadpool(_put_object_sync, path, data, req.content_type or "image/jpeg")
    except Exception as e:
        logger.exception("photo upload failed")
        raise HTTPException(502, f"Upload failed: {e}")
    return {"path": path}


@api_router.get("/files/{path:path}")
async def get_file(path: str, x_user_id: Optional[str] = Header(None), token: Optional[str] = None):
    uid = x_user_id or token
    if not uid or f"/{uid}/" not in f"/{path}":
        raise HTTPException(403, "Forbidden")
    try:
        data, content_type = await run_in_threadpool(_get_object_sync, path)
    except Exception:
        raise HTTPException(404, "File not found")
    return StreamingResponse(iter([data]), media_type=content_type)


# ==================== FOOD LOGS ====================
@api_router.post("/logs/food")
async def add_food_log(entry: FoodLogCreate, user_id: str = Header(..., alias="X-User-Id")):
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": now_iso(), **entry.dict()}
    await db.food_logs.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/logs/food")
async def list_food_logs(date: str, user_id: str = Header(..., alias="X-User-Id")):
    cursor = db.food_logs.find({"user_id": user_id, "date": date}, {"_id": 0}).sort("created_at", 1)
    return {"logs": await cursor.to_list(500)}


@api_router.delete("/logs/food/{log_id}")
async def delete_food_log(log_id: str, user_id: str = Header(..., alias="X-User-Id")):
    r = await db.food_logs.delete_one({"id": log_id, "user_id": user_id})
    return {"deleted": r.deleted_count}


# ==================== WEIGHT LOGS ====================
@api_router.post("/logs/weight")
async def add_weight(entry: WeightLogCreate, user_id: str = Header(..., alias="X-User-Id")):
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": now_iso(), **entry.dict()}
    await db.weight_logs.update_one({"user_id": user_id, "date": entry.date}, {"$set": doc}, upsert=True)
    doc.pop("_id", None)
    return doc


@api_router.get("/logs/weight")
async def list_weights(user_id: str = Header(..., alias="X-User-Id")):
    cursor = db.weight_logs.find({"user_id": user_id}, {"_id": 0}).sort("date", 1)
    return {"logs": await cursor.to_list(500)}


# ==================== WORKOUTS ====================
@api_router.post("/logs/workout")
async def add_workout(entry: WorkoutCreate, user_id: str = Header(..., alias="X-User-Id")):
    doc = {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": now_iso(), **entry.dict()}
    await db.workouts.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@api_router.get("/logs/workout")
async def list_workouts(user_id: str = Header(..., alias="X-User-Id"), date: Optional[str] = None):
    q: Dict[str, Any] = {"user_id": user_id}
    if date:
        q["date"] = date
    cursor = db.workouts.find(q, {"_id": 0}).sort("date", -1)
    return {"logs": await cursor.to_list(200)}


# ==================== ADAPTIVE TDEE ====================
@api_router.get("/trends/adaptive-tdee")
async def adaptive_tdee(user_id: str = Header(..., alias="X-User-Id")):
    """Estimate real maintenance from avg intake vs weight trend over ~14 days."""
    weights = await db.weight_logs.find({"user_id": user_id}, {"_id": 0}).sort("date", 1).to_list(200)
    if len(weights) < 2:
        return {"adaptive_tdee": None, "days": 0, "reason": "Need at least 2 weight logs"}
    first, last = weights[0], weights[-1]
    days = (datetime.fromisoformat(last["date"]) - datetime.fromisoformat(first["date"])).days or 1
    # avg calories over that window
    cursor = db.food_logs.find(
        {"user_id": user_id, "date": {"$gte": first["date"], "$lte": last["date"]}},
        {"_id": 0, "calories": 1, "date": 1},
    )
    logs = await cursor.to_list(5000)
    if not logs or days < 3:
        return {"adaptive_tdee": None, "days": days, "reason": "Need more data (>=3 days of logs)"}
    total_kcal = sum(l.get("calories", 0) for l in logs)
    avg_intake = total_kcal / days
    delta_kg = last["weight_kg"] - first["weight_kg"]
    surplus_per_day = (delta_kg * 7700) / days
    adaptive = avg_intake - surplus_per_day
    return {
        "adaptive_tdee": round(adaptive),
        "avg_intake": round(avg_intake),
        "delta_kg": round(delta_kg, 2),
        "days": days,
    }


@api_router.get("/trends/weekly-recap")
async def weekly_recap(user_id: str = Header(..., alias="X-User-Id")):
    """Rolling 7-day recap: average calories vs target, adherence, and the top-protein day."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
    target = (user.get("targets", {}) or {}).get("target_calories", 0)
    today = datetime.now(timezone.utc).date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]

    cursor = db.food_logs.find(
        {"user_id": user_id, "date": {"$in": days}},
        {"_id": 0, "date": 1, "calories": 1, "protein_g": 1},
    )
    logs = await cursor.to_list(5000)
    by_day: Dict[str, Dict[str, float]] = {d: {"calories": 0.0, "protein_g": 0.0} for d in days}
    for l in logs:
        d = l.get("date")
        if d in by_day:
            by_day[d]["calories"] += l.get("calories", 0)
            by_day[d]["protein_g"] += l.get("protein_g", 0)

    logged_days = [d for d in days if by_day[d]["calories"] > 0]
    avg_calories = round(sum(by_day[d]["calories"] for d in logged_days) / len(logged_days)) if logged_days else 0
    if target > 0 and logged_days:
        adherence = round(sum(min(by_day[d]["calories"], target) / target for d in logged_days) / len(logged_days) * 100)
    else:
        adherence = 0
    top_day = max(logged_days, key=lambda d: by_day[d]["protein_g"]) if logged_days else None

    return {
        "days": [{"date": d, "calories": round(by_day[d]["calories"]), "protein_g": round(by_day[d]["protein_g"])} for d in days],
        "avg_calories": avg_calories,
        "target_calories": target,
        "adherence_pct": adherence,
        "top_protein_day": {"date": top_day, "protein_g": round(by_day[top_day]["protein_g"])} if top_day and by_day[top_day]["protein_g"] > 0 else None,
        "logged_days": len(logged_days),
    }


# ==================== AI BUDDY (streaming) ====================
@api_router.post("/buddy/chat")
async def buddy_chat(msg: ChatMessage, user_id: str = Header(..., alias="X-User-Id")):
    user = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
    profile = user.get("profile", {})
    targets = user.get("targets", {})
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    logs = await db.food_logs.find({"user_id": user_id, "date": today}, {"_id": 0}).to_list(200)
    eaten_kcal = sum(l.get("calories", 0) for l in logs)
    eaten_p = sum(l.get("protein_g", 0) for l in logs)
    eaten_c = sum(l.get("carbs_g", 0) for l in logs)
    eaten_f = sum(l.get("fat_g", 0) for l in logs)
    diet_flags = profile.get("diet_flags", {})
    excluded = [k for k, v in diet_flags.items() if v is False]
    protein_sources = profile.get("protein_sources") or compute_protein_sources(diet_flags)

    system = (
        f"You are Buddy, a friendly, concise BiteRep AI food coach. "
        f"User: {profile.get('name','friend')}, goal={profile.get('goal','maintain')}, "
        f"faith={profile.get('faith','none')}, diet_type={profile.get('diet_type','omnivore')}. "
        f"Excluded foods: {', '.join(excluded) if excluded else 'none'}. "
        f"Their usual protein sources: {', '.join(protein_sources)}. Prefer suggesting from this list. "
        f"Daily targets: {targets.get('target_calories',0)} kcal, "
        f"{targets.get('protein_g',0)}g protein, {targets.get('carbs_g',0)}g carbs, {targets.get('fat_g',0)}g fat. "
        f"Eaten today: {round(eaten_kcal)} kcal, {round(eaten_p)}g P / {round(eaten_c)}g C / {round(eaten_f)}g F. "
        f"Remaining: {round(targets.get('target_calories',0)-eaten_kcal)} kcal, "
        f"{round(targets.get('protein_g',0)-eaten_p)}g protein. "
        f"Be specific with food suggestions and portions. Respect their dietary exclusions absolutely. Keep replies under 120 words."
    )

    async def event_gen():
        try:
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"buddy-{user_id}",
                system_message=system,
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            async for ev in chat.stream_message(UserMessage(text=msg.text)):
                if isinstance(ev, TextDelta):
                    yield f"data: {ev.content}\n\n"
                elif isinstance(ev, StreamDone):
                    yield "data: [DONE]\n\n"
                    break
        except Exception as e:
            logger.exception("buddy stream failed")
            yield f"data: [ERROR] {str(e)[:200]}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ==================== AI PHOTO FOOD ====================
@api_router.post("/ai/photo-food")
async def ai_photo_food(req: PhotoFoodRequest, user_id: str = Header(..., alias="X-User-Id")):
    """Identify dishes from an image, estimate grams + per-100g macros, and ground against Open Food Facts."""
    try:
        # ensure b64 strips data URI prefix
        b64 = req.image_base64
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"photo-{user_id}-{uuid.uuid4()}",
            system_message=(
                "You are a nutrition vision expert. Identify each visible food item and respond ONLY with valid JSON. "
                "Format: {\"items\":[{\"name\":\"...\",\"grams\":<int>,\"kcal_100g\":<num>,\"protein_100g\":<num>,\"carbs_100g\":<num>,\"fat_100g\":<num>,\"confidence\":<0-1>}]}. "
                "No markdown, no prose. Estimate grams from typical portion size visible."
            ),
        ).with_model("gemini", "gemini-3-flash-preview")

        text_buf = ""
        async for ev in chat.stream_message(UserMessage(
            text="Identify all food items in this image. Return JSON only.",
            file_contents=[ImageContent(image_base64=b64)],
        )):
            if isinstance(ev, TextDelta):
                text_buf += ev.content
            elif isinstance(ev, StreamDone):
                break

        # extract JSON
        m = re.search(r"\{.*\}", text_buf, re.DOTALL)
        if not m:
            raise ValueError("No JSON in response")
        parsed = json.loads(m.group(0))
        items = parsed.get("items", [])

        # Ground each detected item against real Open Food Facts data where a confident match exists
        grounded = await asyncio.gather(*[_ground_item(it.get("name", "")) for it in items], return_exceptions=True)
        for it, g in zip(items, grounded):
            if isinstance(g, dict):
                it["matched"] = True
                it["source"] = "openfoodfacts"
                it["brand"] = g.get("brand", "")
                it["off_code"] = g.get("code")
                it["kcal_100g"] = g.get("kcal_100g", it.get("kcal_100g", 0))
                it["protein_100g"] = g.get("protein_100g", it.get("protein_100g", 0))
                it["carbs_100g"] = g.get("carbs_100g", it.get("carbs_100g", 0))
                it["fat_100g"] = g.get("fat_100g", it.get("fat_100g", 0))
            else:
                it["matched"] = False
                it["source"] = "ai"
                it.setdefault("brand", "")
                it.setdefault("off_code", None)

        return {"items": items}
    except Exception as e:
        logger.exception("photo food failed")
        raise HTTPException(500, f"AI photo food failed: {e}")


# ==================== AI PHOTO LABEL (packaged food nutrition panel) ====================
@api_router.post("/ai/photo-label")
async def ai_photo_label(req: PhotoLabelRequest, user_id: str = Header(..., alias="X-User-Id")):
    """Read a Nutrition Facts panel + packaging photo and extract structured per-100g nutrition."""
    try:
        b64 = req.image_base64
        if "," in b64 and b64.startswith("data:"):
            b64 = b64.split(",", 1)[1]

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"label-{user_id}-{uuid.uuid4()}",
            system_message=(
                "You are a nutrition label reading expert. Read the Nutrition Facts panel and product packaging in the image. "
                "Respond ONLY with valid JSON in this exact format: "
                "{\"name\":\"...\",\"brand\":\"...\",\"serving_grams\":<num>,\"kcal_100g\":<num>,\"protein_100g\":<num>,\"carbs_100g\":<num>,\"fat_100g\":<num>,\"confidence\":<0-1>}. "
                "If the label shows per-serving values, convert them to per-100g using the serving size shown. "
                "If you cannot read a field confidently, make your best estimate rather than omitting it. No markdown, no prose."
            ),
        ).with_model("gemini", "gemini-3-flash-preview")

        text_buf = ""
        async for ev in chat.stream_message(UserMessage(
            text="Read this nutrition label and the product name/brand. Return JSON only.",
            file_contents=[ImageContent(image_base64=b64)],
        )):
            if isinstance(ev, TextDelta):
                text_buf += ev.content
            elif isinstance(ev, StreamDone):
                break

        m = re.search(r"\{.*\}", text_buf, re.DOTALL)
        if not m:
            raise ValueError("No JSON in response")
        return json.loads(m.group(0))
    except Exception as e:
        logger.exception("photo label failed")
        raise HTTPException(500, f"Label read failed: {e}")


# ==================== SUMMARY ====================
@api_router.get("/summary")
async def day_summary(date: str, user_id: str = Header(..., alias="X-User-Id")):
    user = await db.users.find_one({"id": user_id}, {"_id": 0}) or {}
    logs = await db.food_logs.find({"user_id": user_id, "date": date}, {"_id": 0}).to_list(500)
    totals = {"calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
    by_meal: Dict[str, list] = {"breakfast": [], "lunch": [], "snacks": [], "dinner": []}
    for l in logs:
        totals["calories"] += l.get("calories", 0)
        totals["protein_g"] += l.get("protein_g", 0)
        totals["carbs_g"] += l.get("carbs_g", 0)
        totals["fat_g"] += l.get("fat_g", 0)
        by_meal.setdefault(l.get("meal", "snacks"), []).append(l)
    return {
        "date": date,
        "targets": user.get("targets", {}),
        "totals": {k: round(v, 1) for k, v in totals.items()},
        "by_meal": by_meal,
    }


@api_router.get("/")
async def root():
    return {"app": "BiteRep", "ok": True}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
