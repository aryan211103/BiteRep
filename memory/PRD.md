# BiteRep — Product Requirements

Free, mobile-first calorie & fitness tracker (Expo React Native + FastAPI + MongoDB).

## Features
- Anonymous auth: server-side user created on first launch via `device_id` (persisted in AsyncStorage). No signup friction. Optional email/Google linking later.
- Multi-step onboarding: name → sex → age → height/weight (imperial default, metric toggle) → activity → goal → faith (tappable cards) → diet type (Omnivore/Eggetarian/Vegetarian/Vegan/Pescatarian) → per-food diet toggles → summary. Live BMR → maintenance → adjustment → target math preview using Mifflin-St Jeor, plus a personalized "your protein sources" chip list.
- Cultural/religious diet personalization: faith (None/Hindu/Muslim/Jain/Christian/Jewish/Buddhist/Sikh) + diet type jointly seed sensible default toggles for beef/pork/chicken/mutton/seafood/eggs/dairy/root_veg/onion_garlic (e.g. Hindu→beef off, Jain→auto-vegetarian + no root veg/onion-garlic, vegan→also no dairy). User can override any toggle. Server computes `profile.avoided_foods` and `profile.protein_sources`; `/api/foods/search` filters out matching results (word-boundary keyword match), Buddy chat uses the protein-source list for suggestions, and Profile tab displays a "Diet & preferences" summary card.
- Dashboard: sticky header, horizontal date strip, calorie ring (remaining vs target), 3 macro cards, meal sections (Breakfast 25% / Lunch 35% / Snacks 10% / Dinner 30%) with progress bars & add buttons.
- Food search: Open Food Facts Search-a-licious proxy. De-duplicated results, kcal > 0 filter, per-100g nutrition. Measure picker (serving/cup/bowl/plate/grams), meal picker, live macro calc.
- AI photo food logging: Gemini 3 Flash vision via Emergent Universal Key. Returns items with grams and per-100g macros; "AI estimate" badge; log all to a meal.
- Buddy tab: Claude Sonnet 4.5 streamed chat, context-aware (goal, remaining kcal/macros, faith, diet exclusions). Prompt suggestions.
- Trends: adaptive TDEE (avg intake vs weight delta over log window), 30-day weight chart (SVG polyline), weight entry.
- Workout logger: exercises with per-set reps/weight, progression stats (top weight, est. 1RM, total volume).
- Profile: view profile, override daily kcal target, unit toggle (kg/lb & cm/ft), reset.

## Tech
- Backend: FastAPI, Motor (Mongo), httpx, emergentintegrations (Claude, Gemini).
- Frontend: Expo Router, react-native-svg, expo-camera/expo-image-picker, AsyncStorage.
- Endpoints (all /api-prefixed): auth/anon, me, onboarding, profile (PATCH), foods/search, logs/food (CRUD), logs/weight, logs/workout, trends/adaptive-tdee, buddy/chat (SSE), ai/photo-food, summary.

## Not yet
- Google/email linking, native push notifications, background sync, barcode scan.
