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
import os
import uuid
import logging
import httpx
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


# ==================== HELPERS ====================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    source: str = "manual"  # "openfoodfacts" | "ai" | "manual"
    off_code: Optional[str] = None


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
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "onboarded": True,
            "profile": data.dict(),
            "targets": targets,
            "updated_at": now_iso(),
        }},
    )
    return {"targets": targets, "profile": data.dict()}


@api_router.patch("/profile")
async def update_profile(payload: Dict[str, Any], user_id: str = Header(..., alias="X-User-Id")):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(404)
    profile = {**user.get("profile", {}), **payload.get("profile", {})}
    targets_override = payload.get("targets") or {}
    computed = compute_targets(profile)
    final_targets = {**computed, **{k: v for k, v in targets_override.items() if v is not None}}
    await db.users.update_one({"id": user_id}, {"$set": {"profile": profile, "targets": final_targets}})
    return {"profile": profile, "targets": final_targets}


# ==================== FOOD SEARCH (Open Food Facts) ====================
@api_router.get("/foods/search")
async def food_search(q: str, country: Optional[str] = None):
    if not q or len(q) < 2:
        return {"results": []}
    params: Dict[str, Any] = {"q": q, "page_size": 30, "fields": "code,product_name,brands,serving_size,serving_quantity,nutriments,quantity,countries_tags"}
    if country:
        params["countries_tags"] = f"en:{country.lower()}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.get("https://search.openfoodfacts.org/search", params=params)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        logger.warning(f"OFF search failed: {e}")
        return {"results": []}

    seen_keys = set()
    results = []
    for hit in data.get("hits", []) or data.get("products", []):
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
        nutr = hit.get("nutriments") or {}
        # normalize kcal per 100g
        kcal_100 = nutr.get("energy-kcal_100g") or nutr.get("energy-kcal") or 0
        if isinstance(kcal_100, str):
            try:
                kcal_100 = float(kcal_100)
            except Exception:
                kcal_100 = 0
        if not name or not kcal_100 or kcal_100 <= 0:
            continue
        key = f"{name.lower()}|{brand.lower()}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        prot = nutr.get("proteins_100g") or 0
        carbs = nutr.get("carbohydrates_100g") or 0
        fat = nutr.get("fat_100g") or 0
        serving = hit.get("serving_size") or hit.get("quantity") or "100 g"
        results.append({
            "code": hit.get("code"),
            "name": name,
            "brand": brand,
            "serving": serving,
            "kcal_100g": round(float(kcal_100), 1),
            "protein_100g": round(float(prot), 1),
            "carbs_100g": round(float(carbs), 1),
            "fat_100g": round(float(fat), 1),
        })
        if len(results) >= 20:
            break
    return {"results": results}


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

    system = (
        f"You are Buddy, a friendly, concise BiteRep AI food coach. "
        f"User: {profile.get('name','friend')}, goal={profile.get('goal','maintain')}, "
        f"faith={profile.get('faith','none')}. Excluded foods: {', '.join(excluded) if excluded else 'none'}. "
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
    """Identify dishes from an image and estimate grams + per-100g macros."""
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
        import json, re
        m = re.search(r"\{.*\}", text_buf, re.DOTALL)
        if not m:
            raise ValueError("No JSON in response")
        parsed = json.loads(m.group(0))
        return parsed
    except Exception as e:
        logger.exception("photo food failed")
        raise HTTPException(500, f"AI photo food failed: {e}")


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
