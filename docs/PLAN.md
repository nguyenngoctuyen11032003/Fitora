# Fitora — AI Nutrition & Fitness Coach · Kế hoạch & hợp đồng kỹ thuật

> Tài liệu này là **hợp đồng chung** cho mọi người/agent cùng làm. Không đổi tên bảng, route, tên file sở hữu
> hoặc chữ ký service mà không cập nhật tài liệu này.

## 1. Kiến trúc

```
Fitora (repo riêng, CHỈ frontend)          Note_mytasks (repo backend dùng chung)
React + TS + Vite + Tailwind               supabase/migrations/*_fitora_*.sql   (bảng fit_*)
GitHub Actions → GitHub Pages              supabase/functions/fitora-food-ai    (Edge Function AI)
        │  supabase-js (anon key + JWT)              │ deploy.yml: db push + functions deploy
        ▼                                            ▼
                 CÙNG MỘT project Supabase (Auth · PostgREST · Storage · Edge Functions)
```

- **Tài khoản dùng chung**: cùng `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ⇒ cùng `auth.users`. Đăng nhập Fitora bằng
  email/mật khẩu của Note_mytasks. Fitora đọc `public.profiles` (display_name, avatar_url) có sẵn.
- `storageKey: 'fitora.auth'` (khác `nm.auth`) — hai app cùng origin `*.github.io` nên tách key để đăng xuất app này không đá app kia.
- Auth flow PKCE + **HashRouter** (GitHub Pages không rewrite SPA). Redirect email dùng `?flow=recovery` / `?flow=signup` giống Note_mytasks.
- Migration Fitora nằm trong repo Note_mytasks vì `supabase db push` yêu cầu thư mục migration local chứa **toàn bộ** lịch sử của project.
- AI nhận diện món ăn: Edge Function `fitora-food-ai` (Deno) gọi Claude vision; khóa `ANTHROPIC_API_KEY` là Supabase secret, không bao giờ vào FE.

## 2. Database (Note_mytasks/supabase/migrations/20261009001400_fitora_schema.sql, …001500_fitora_storage.sql)

Quy ước giống Note_mytasks: `user_id uuid not null default auth.uid() references auth.users on delete cascade`, enum = `text + CHECK`,
RLS bật, policy chỉ chủ sở hữu (select/insert/update/delete cho `authenticated`, USING + WITH CHECK), `revoke all … from anon`,
composite FK `(x_id, user_id) → parent(id, user_id)`, trigger `public.set_updated_at()`.

| Bảng | Cột chính |
|---|---|
| `fit_profiles` (PK `user_id`) | `sex` ('male','female'), `birth_date` date, `height_cm` numeric 80–250, `activity_level` ('sedentary','light','moderate','active','very_active'), `goal` ('lose','gain','maintain','recomp'), `goal_pace` ('slow','medium','fast') null, `start_weight_kg`, `target_weight_kg` numeric null, `calorie_target` int 800–6000, `protein_g`/`carbs_g`/`fat_g` int 0–1000, `macro_custom` bool default false, `water_target_ml` int default 2000, `step_target` int default 8000, `onboarded_at` timestamptz null, timestamps |
| `fit_custom_foods` | `id`, `user_id`, `name` 1–120, `brand` null, `serving_label` text default '1 phần', `serving_grams` numeric >0, `kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g`, `fiber_100g` numeric ≥0, timestamps, `unique(id,user_id)` |
| `fit_meal_entries` | `id`, `user_id`, `eaten_on` date, `meal` ('breakfast','lunch','dinner','snack'), `name` 1–120, `quantity` numeric >0, `unit` text 1–20, `grams` numeric ≥0, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g` numeric ≥0, `source` ('ai','search','custom','manual'), `custom_food_id` null (composite FK, SET NULL), `photo_path` text null, `ai_meta` jsonb null, timestamps; index `(user_id, eaten_on)` |
| `fit_workout_templates` | `id`, `user_id`, `name` 1–80, `category`, `activity` text, `met` numeric 1–25, `duration_min` int 1–1440, `notes` null, timestamps, `unique(id,user_id)` |
| `fit_workouts` | `id`, `user_id`, `workout_on` date, `start_time` time null, `category` ('gym','cardio','yoga','running','swimming','cycling','team_sport','walking','other'), `activity` text (key trong `src/data/activities.ts` hoặc tự do), `title` 1–80, `met` numeric 1–25, `duration_min` int 1–1440, `kcal` numeric ≥0, `status` ('planned','done') default 'done', `template_id` null (composite FK, SET NULL), `notes` null, timestamps; index `(user_id, workout_on)` |
| `fit_daily_logs` (PK `user_id, log_date`) | `water_ml` int ≥0 default 0, `steps` int ≥0 default 0, `updated_at` |
| `fit_body_measurements` | `id`, `user_id`, `measured_on` date, `weight_kg`, `body_fat_pct`, `chest_cm`, `waist_cm`, `hip_cm`, `thigh_cm`, `arm_cm` (numeric null, ít nhất 1 cột khác null), `note`, timestamps, `unique(user_id, measured_on)` |
| `fit_progress_photos` | `id`, `user_id`, `taken_on` date, `pose` ('front','side','back','other') default 'front', `storage_path` text, `note` null, `created_at` |
| `fit_ai_usage` (PK `user_id, used_on`) | `count` int — chỉ ghi qua RPC |

**RPC** (`security invoker`, chỉ `authenticated` được execute):
- `fit_day_summary(p_date date) → jsonb` `{kcal_in, protein_g, carbs_g, fat_g, fiber_g, workout_kcal, water_ml, steps}`
- `fit_range_summary(p_from date, p_to date) → table(day date, kcal_in, protein_g, carbs_g, fat_g, fiber_g, workout_kcal, water_ml, steps, weight_kg)` — mỗi ngày trong khoảng một dòng (generate_series), khoảng ≤ 366 ngày; `weight_kg` = số đo của đúng ngày đó hoặc null; `workout_kcal` chỉ tính `status='done'`.
- `fit_ai_quota_consume(p_limit int default 40) → boolean` (`security definer`, `search_path=''`): tăng `fit_ai_usage` hôm nay của `auth.uid()`, trả false nếu vượt hạn mức.

**Storage**: bucket **private** `fitora`, 5 MB, `image/webp|jpeg|png`. Đường dẫn `<uid>/meals/<uuid>.webp`, `<uid>/progress/<uuid>.webp`.
Policy chỉ trong thư mục của chính mình (giống `avatars`). Hiển thị bằng `createSignedUrl` (1 giờ).

## 3. Edge Function `fitora-food-ai`

`POST {SUPABASE_URL}/functions/v1/fitora-food-ai` (JWT người dùng, `verify_jwt` mặc định bật; FE gọi `supabase.functions.invoke`).

Request: `{ "image": "data:image/jpeg;base64,…" (≤ ~1.5 MB sau nén), "hint"?: string, "mode"?: "photo" | "live" }`

Response 200:
```json
{ "dishes": [ { "name": "Phở bò", "ingredients": ["bánh phở","thịt bò","hành"], "quantity": 1, "unit": "bát",
                "grams": 500, "kcal": 450, "protein_g": 25, "carbs_g": 55, "fat_g": 12, "fiber_g": 2, "confidence": 0.82 } ],
  "is_food": true, "notes": "…" }
```
Lỗi: `{ "error": "not_food" | "quota_exceeded" | "bad_request" | "ai_unavailable", "message": "…" }` với status 4xx/5xx.
Function gọi `fit_ai_quota_consume` bằng client mang JWT của user trước khi gọi AI. Model mặc định qua env `FITORA_AI_MODEL`.

## 4. Frontend

### Stack
React 18 + TypeScript + Vite, Tailwind 3, `react-router-dom` (HashRouter), `@supabase/supabase-js`, `lucide-react`, `recharts`, `clsx`.
Vitest cho unit test logic. `base: './'`.

### Cấu trúc & quyền sở hữu file (agent chỉ sửa file mình sở hữu)

| Owner | Files |
|---|---|
| Foundation | `package.json`, configs, `index.html`, `src/main.tsx`, `src/App.tsx` (routes), `src/styles/**`, `src/lib/**` (supabase, config, date, format, energy, image), `src/types/**`, `src/services/**`, `src/components/**` (UI kit + shell), `src/features/auth/**`, `src/context/**`, `.github/**`, `README.md`, `public/**` |
| Onboarding & mục tiêu | `src/features/onboarding/**` |
| AI Scan | `src/features/scan/**` |
| Nhật ký ăn & tìm món | `src/features/food/**`, `src/data/foods.ts` |
| Tập luyện | `src/features/workout/**`, `src/data/activities.ts` |
| Hôm nay (dashboard) | `src/features/today/**` |
| Báo cáo | `src/features/reports/**` |
| Cơ thể, ảnh, hồ sơ | `src/features/body/**`, `src/features/profile/**` |

Feature agent cần hàm service mới ⇒ tạo trong thư mục feature của mình (vd. `src/features/food/api.ts`) dùng `supabase` từ `src/lib/supabase.ts`.

### Routes (HashRouter)
| Route | Component (default export) |
|---|---|
| `/login`, `/register`, `/forgot`, `/reset` | `src/features/auth/*Page.tsx` |
| `/onboarding` | `src/features/onboarding/OnboardingPage.tsx` |
| `/goals` | `src/features/onboarding/GoalSettingsPage.tsx` |
| `/` | `src/features/today/TodayPage.tsx` |
| `/diary` (`?date=YYYY-MM-DD`) | `src/features/food/DiaryPage.tsx` |
| `/food/search` (`?meal=&date=`) | `src/features/food/FoodSearchPage.tsx` |
| `/scan` (`?meal=&date=`) | `src/features/scan/ScanPage.tsx` |
| `/workout` | `src/features/workout/WorkoutPage.tsx` |
| `/progress` | `src/features/reports/ReportsPage.tsx` |
| `/body` | `src/features/body/BodyPage.tsx` |
| `/profile` | `src/features/profile/ProfilePage.tsx` |

Guard: chưa đăng nhập → `/login`; đăng nhập nhưng `fit_profiles.onboarded_at` null → `/onboarding`.
Bottom nav (5): Hôm nay `/` · Nhật ký `/diary` · **Scan** (nút tròn nổi giữa) `/scan` · Tập luyện `/workout` · Tiến trình `/progress`.
`/body`, `/profile`, `/goals` vào từ menu overlay (nút glass 2 vạch) và avatar trên TopBar.

### Shared API (Foundation tạo, mọi người import)
- `src/lib/supabase.ts`: `export const supabase`.
- `src/types/db.ts`: kiểu dòng cho mọi bảng ở §2 (`FitProfile`, `MealEntry`, `NewMealEntry`, `CustomFood`, `Workout`, `WorkoutTemplate`, `DailyLog`, `BodyMeasurement`, `ProgressPhoto`, `DaySummary`, `RangeSummaryRow`, `MealType`, `Goal`, `GoalPace`, `ActivityLevel`, `WorkoutCategory`, `Sex`), và `AiDish`, `AiScanResponse`.
- `src/services/*.ts` — CRUD mỏng, ném `Error` có message tiếng Việt:
  - `profile.ts`: `getSharedProfile()`, `getFitProfile()`, `upsertFitProfile(patch)`
  - `meals.ts`: `listMeals(date)`, `addMealEntries(entries: NewMealEntry[])`, `updateMeal(id, patch)`, `deleteMeal(id)`, `uploadMealPhoto(blob) → path`
  - `foods.ts`: `listCustomFoods()`, `createCustomFood`, `updateCustomFood`, `deleteCustomFood`
  - `workouts.ts`: `listWorkouts(from,to)`, `addWorkout`, `updateWorkout`, `deleteWorkout`, `listTemplates`, `createTemplate`, `deleteTemplate`
  - `daily.ts`: `getDailyLog(date)`, `setWater(date, ml)`, `addWater(date, deltaMl)`, `setSteps(date, steps)`
  - `body.ts`: `listMeasurements(from?,to?)`, `upsertMeasurement`, `deleteMeasurement`, `listPhotos()`, `uploadProgressPhoto(blob, meta)`, `deletePhoto(id)`, `signedPhotoUrl(path)`
  - `summary.ts`: `getDaySummary(date)`, `getRangeSummary(from,to)`
  - `ai.ts`: `scanFood(dataUrl, opts) → AiScanResponse` (map lỗi sang tiếng Việt)
- `src/lib/energy.ts` (+ test): `calcAge`, `calcBMI`, `bmiCategory` (chuẩn châu Á: <18.5 gầy, <23 bình thường, <25 thừa cân, ≥25 béo phì), `calcBMR` (Mifflin–St Jeor), `ACTIVITY_FACTORS`, `calcTDEE`, `goalCalories(tdee, goal, pace, sex)` (lose: −250/−500/−750, gain +300, recomp −10%, maintain 0; sàn 1200 nữ/1500 nam), `suggestMacros(kcal, goal, weightKg)` (protein g/kg: lose 2.0, recomp 2.2, gain 1.8, maintain 1.6; fat 25–30%; còn lại carbs), `metKcal(met, weightKg, minutes)` = MET·3.5·kg/200·phút, `stepsKcal(steps, weightKg)` = steps·0.04·kg/70, `remainingKcal(target, eaten, burned)` = target − eaten + burned.
- `src/lib/date.ts`: `todayISO()`, `addDays`, `startOfWeek` (thứ Hai), `formatDayVi`, `rangeDays`. Ngày luôn là chuỗi `YYYY-MM-DD` theo giờ địa phương.
- `src/lib/image.ts`: `compressImage(file|blob, {maxSide=1280, quality=0.82, type='image/webp'}) → {blob, dataUrl}`.
- `src/context/AuthContext.tsx` (`useAuth()` → `{session, user, loading, signOut}`), `src/context/ProfileContext.tsx` (`useProfile()` → `{fit, shared, refresh, loading}`).
- `src/components/ui/*`: `GlassCard`, `GlassButton` (variant `circle`|`pill`|`square`), `Button` (primary vàng / ghost), `Input`, `NumberField`, `Segmented`, `ProgressBar`, `Ring`, `MacroBar`, `CountUp`, `BigNumber` (số hiển thị lớn kiểu F1, gradient), `BottomSheet`, `Modal`, `Toast` (`useToast()`), `EmptyState`, `Skeleton`, `Chip`, `ScreenHeader` (eyebrow + tiêu đề lớn).
- `src/components/shell/*`: `AppFrame` (khung điện thoại trên desktop), `TopBar`, `BottomNav`, `MenuOverlay`, `Page` (vùng cuộn + padding an toàn cho bottom nav).

## 5. Hệ thống thiết kế — "Ember Glass"

Kết hợp ngôn ngữ F1 (chữ display cực lớn, tracking âm, số khổng lồ gradient, vàng `#EDB40B`, speed‑reveal) với màn profile cà phê
(nền ấm `#180a06`, thẻ glass `rgba(255,255,255,0.06)` bo 24px, nút liquid-glass, chữ kem `#ede4d8`).
**Không dùng** logo/ảnh thương hiệu F1, Ferrari, Hamilton — chỉ mượn phong cách.

- Font: **Albert Sans** 300–800. Headline `tracking-[-0.05em] leading-[0.9]`; số lớn 72–120px, `leading-[0.78]`, `tracking-[-0.06em]`.
- Token (CSS var trên `:root`, map vào Tailwind):
  `--bg #120906` · `--bg-2 #180a06` · `--card rgba(255,255,255,0.06)` · `--card-strong rgba(20,12,8,0.82)` · `--line rgba(255,255,255,0.10)` ·
  `--text #ede4d8` · `--muted rgba(235,220,205,0.55)` · `--gold #EDB40B` · `--ember #E1500A` · `--danger #E10600` ·
  macro: `--protein #FF7A59` · `--carbs #EDB40B` · `--fat #7FB2FF` · `--fiber #7FD18B` · `--water #5EC8F2` · `--burn #FF4D2E`.
- Nền trang: `#070402` + 4 radial-gradient ấm (theo spec cà phê). Trong app: `--bg` + vầng sáng ember mờ ở đỉnh.
- Glass: `.glass` (rgba .03 + inset highlight + `backdrop-filter: blur(2px) saturate(1.3)`, scale .96 khi active); `.glass-card` (`--card`, radius 24);
  `.glass-strong` (`rgba(20,20,30,0.8)` + border `--line` + blur 16px) cho bottom nav / sheet.
- Menu overlay: `linear-gradient(160deg,#1a0500 0%,#7a1d00 40%,#E1500A 100%)`, link 3xl bold, stagger slide-in, hover vàng.
- Animation (keyframes + delay utilities 100–1600): `fade-slide-up`, `fade-slide-down`, `fade-slide-left`, `scale-in`, `fade-in`, `speed-reveal`, `drop-in`;
  CountUp ease-out cubic 2200ms. Tôn trọng `prefers-reduced-motion`.
- Layout:
  - `< 768px`: app full màn hình, `100dvh`, safe-area insets, bottom nav cố định trong khung.
  - `≥ 768px`: nền ấm toàn trang; app nằm trong **khung điện thoại** (viền đen, bo 54px, ring white/15, dynamic island) cao `min(92vh, 900px)`,
    `aspect-ratio 390/844`, **không scale bằng transform** — nội dung render đúng kích thước khung. `≥ 1100px` thêm cột thương hiệu bên trái
    (wordmark "Fitora" cỡ lớn + tagline + 3 chỉ số hôm nay).
  - Mọi overlay (sheet, modal, toast, menu) render qua portal vào `#fitora-overlay-root` **bên trong** khung (position absolute), không fixed theo window.
- Ngôn ngữ UI: **tiếng Việt**. Touch target ≥ 44px. Nhập số dùng `inputMode="decimal"`.

## 6. Kế hoạch thực thi (10 agent)

| Pha | Agent | Việc |
|---|---|---|
| 1 | Foundation | Scaffold, design system, shell, auth, services, energy lib + test, CI/CD Pages, placeholder page |
| 1 | Backend | Migration + storage + RPC + test PGlite + Edge Function + deploy.yml (repo Note_mytasks) |
| 2 | Onboarding | Khảo sát 5 bước, BMI/BMR/TDEE, chọn mục tiêu, đề xuất & chỉnh macro, trang `/goals` |
| 2 | AI Scan | Camera chụp / tải ảnh / live scan, gọi AI, màn xác nhận chỉnh sửa, lưu bữa |
| 2 | Food | Nhật ký theo bữa, tìm món (≥150 món VN + phổ biến), món tùy chỉnh, đổi đơn vị tự tính lại |
| 2 | Workout | Lịch tuần, ghi buổi tập (MET), mẫu bài tập, bước chân |
| 2 | Today | Dashboard ngày: calo còn lại, vòng/thanh macro, nước, bước, bữa & tập |
| 2 | Reports | Tuần/tháng: calo nạp vs tiêu hao, cân nặng & BMI, đánh giá thâm hụt/dư |
| 2 | Body & Profile | Cân nặng & số đo, ảnh tiến trình + so sánh, hồ sơ/tài khoản |
| 3 | Integrator | `npm install`, typecheck, test, build; sửa lỗi tích hợp; README deploy |

## 7. Ngoài phạm vi v1
Đồng bộ thiết bị đeo (chỉ nhập bước tay), thông báo push, offline/PWA đầy đủ, xóa tài khoản.
