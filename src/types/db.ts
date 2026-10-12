// Row types for the Fitora tables (Note_mytasks/supabase/migrations/20261009001400_fitora_schema.sql)
// and the shared `public.profiles` row owned by Note_mytasks. Contract: docs/PLAN.md §2.
// Dates are 'YYYY-MM-DD'; PostgREST returns numeric columns as numbers; `time` is 'HH:MM:SS'.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'gain' | 'maintain' | 'recomp';
export type GoalPace = 'slow' | 'medium' | 'fast';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type MealSource = 'ai' | 'search' | 'custom' | 'manual';
export type WorkoutCategory =
  | 'gym' | 'cardio' | 'yoga' | 'running' | 'swimming' | 'cycling' | 'team_sport' | 'walking' | 'other';
export type WorkoutStatus = 'planned' | 'done';
export type PhotoPose = 'front' | 'side' | 'back' | 'other';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const WORKOUT_CATEGORIES: WorkoutCategory[] = [
  'gym', 'cardio', 'yoga', 'running', 'swimming', 'cycling', 'team_sport', 'walking', 'other',
];

/** Shared with Note_mytasks (public.profiles, 1:1 with auth.users). Fitora only edits display_name / avatar_url. */
export interface SharedProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  locale: string;
}

/**
 * public.fit_profiles (PK user_id). Columns are nullable so onboarding can save
 * step by step; once onboarded_at is set the DB guarantees the core fields are filled
 * (check fit_profiles_complete).
 */
export interface FitProfile {
  user_id: string;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  activity_level: ActivityLevel | null;
  goal: Goal | null;
  goal_pace: GoalPace | null;
  start_weight_kg: number | null;
  target_weight_kg: number | null;
  calorie_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  macro_custom: boolean;
  water_target_ml: number;
  step_target: number;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}
export type FitProfilePatch = Partial<Omit<FitProfile, 'user_id' | 'created_at' | 'updated_at'>>;

/** Where a saved food came from: typed by hand, confirmed after an AI scan, or saved from a logged meal entry. */
export type CustomFoodSource = 'manual' | 'ai' | 'meal';
export const CUSTOM_FOOD_SOURCE_LABELS: Record<CustomFoodSource, string> = {
  manual: 'Tự tạo',
  ai: 'Từ ảnh quét',
  meal: 'Từ nhật ký',
};

/**
 * public.fit_custom_foods = "Món của tôi / món đã lưu" (nutrition per 100 g + one default serving).
 * Migrations 001400 + 20261012000100 + 20261012000300. Usage columns are written only by the
 * `fit_mark_food_used` RPC (services: markCustomFoodUsed / logCustomFood / saveScannedDishes;
 * undo: unmarkCustomFoodUsed → `fit_unmark_food_used`).
 */
export interface CustomFood {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  serving_label: string;
  serving_grams: number;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fiber_100g: number;
  source: CustomFoodSource;
  /** '<uid>/meals/<uuid>.webp' (own folder) or null. Shown with mealPhotoUrl(). */
  photo_path: string | null;
  use_count: number;
  /** ISO timestamp of the last time it was logged; null = never. */
  last_used_at: string | null;
  /** Meal it is usually eaten at (pre-selects the meal when re-logging). */
  default_meal: MealType | null;
  /**
   * How many servings the user usually eats (scanned "2 cái" → serving "1 cái" + 2); null = 1.
   * Optional so rows loaded before migration 20261012000300 stay valid. Use usualServings().
   */
  default_servings?: number | null;
  created_at: string;
  updated_at: string;
}
export type NewCustomFood = Pick<CustomFood, 'name' | 'serving_grams' | 'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g'> &
  Partial<Pick<CustomFood, 'brand' | 'serving_label' | 'fiber_100g' | 'source' | 'photo_path' | 'default_meal' | 'default_servings'>> & {
    /** normalizeFoodName(name); only the "remember a dish" path sets it (unique per user in the DB). */
    name_key?: string | null;
  };
/** Editable fields. use_count / last_used_at are bumped only through markCustomFoodUsed(). */
export type CustomFoodPatch = Partial<
  Omit<CustomFood, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'use_count' | 'last_used_at'>
> & { name_key?: string | null };

/** One item of a meal template (values are the TOTAL for the item, like a MealEntry). */
export interface MealTemplateItem {
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  /** Linked saved food (re-logged as source 'custom'); not a DB foreign key, may be stale. */
  custom_food_id: string | null;
}

/** public.fit_meal_templates = "Bữa mẫu": a named set of items re-logged with one tap. */
export interface MealTemplate {
  id: string;
  user_id: string;
  name: string;
  /** Preferred meal; null = choose when logging. */
  meal: MealType | null;
  items: MealTemplateItem[];
  total_kcal: number;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}
export type MealTemplatePatch = Partial<Pick<MealTemplate, 'name' | 'meal' | 'items'>>;

export interface MealEntry {
  id: string;
  user_id: string;
  eaten_on: string;
  meal: MealType;
  name: string;
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  source: MealSource;
  custom_food_id: string | null;
  photo_path: string | null;
  ai_meta: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
/** Insert shape: eaten_on, meal, name required; everything else has a DB default. */
export type NewMealEntry = Pick<MealEntry, 'eaten_on' | 'meal' | 'name'> &
  Partial<Omit<MealEntry, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'eaten_on' | 'meal' | 'name'>>;
export type MealEntryPatch = Partial<Omit<MealEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  name: string;
  category: WorkoutCategory;
  activity: string;
  met: number;
  duration_min: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type NewWorkoutTemplate = Pick<WorkoutTemplate, 'name' | 'activity' | 'met' | 'duration_min'> &
  Partial<Pick<WorkoutTemplate, 'category' | 'notes'>>;

export interface Workout {
  id: string;
  user_id: string;
  workout_on: string;
  start_time: string | null;
  category: WorkoutCategory;
  activity: string;
  title: string;
  met: number;
  duration_min: number;
  kcal: number;
  status: WorkoutStatus;
  template_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type NewWorkout = Pick<Workout, 'workout_on' | 'activity' | 'title' | 'met' | 'duration_min'> &
  Partial<Pick<Workout, 'start_time' | 'category' | 'kcal' | 'status' | 'template_id' | 'notes'>>;
export type WorkoutPatch = Partial<Omit<Workout, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface DailyLog {
  user_id: string;
  log_date: string;
  water_ml: number;
  steps: number;
  updated_at: string;
}

export interface BodyMeasurement {
  id: string;
  user_id: string;
  measured_on: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}
export type MeasurementInput = Pick<BodyMeasurement, 'measured_on'> &
  Partial<Pick<BodyMeasurement, 'weight_kg' | 'body_fat_pct' | 'chest_cm' | 'waist_cm' | 'hip_cm' | 'thigh_cm' | 'arm_cm' | 'note'>>;

export interface ProgressPhoto {
  id: string;
  user_id: string;
  taken_on: string;
  pose: PhotoPose;
  storage_path: string;
  note: string | null;
  created_at: string;
}
export interface ProgressPhotoMeta {
  taken_on: string;
  pose?: PhotoPose;
  note?: string | null;
}

export interface DaySummary {
  kcal_in: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  workout_kcal: number;
  water_ml: number;
  steps: number;
}

export interface RangeSummaryRow extends DaySummary {
  day: string;
  weight_kg: number | null;
}

export interface AiDish {
  name: string;
  ingredients: string[];
  quantity: number;
  unit: string;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  confidence: number;
}

export interface AiScanResponse {
  dishes: AiDish[];
  is_food: boolean;
  notes?: string;
}

export type AiErrorCode = 'not_food' | 'quota_exceeded' | 'bad_request' | 'ai_unavailable' | 'network' | 'unauthorized';

/* ---- Vietnamese labels (UI) ---- */
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
  snack: 'Ăn vặt',
};
export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Giảm cân',
  gain: 'Tăng cân',
  maintain: 'Giữ cân',
  recomp: 'Giảm mỡ tăng cơ',
};
export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Ít vận động',
  light: 'Vận động nhẹ',
  moderate: 'Vận động vừa',
  active: 'Năng động',
  very_active: 'Rất năng động',
};
export const WORKOUT_CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  gym: 'Gym',
  cardio: 'Cardio',
  yoga: 'Yoga',
  running: 'Chạy bộ',
  swimming: 'Bơi',
  cycling: 'Đạp xe',
  team_sport: 'Thể thao đồng đội',
  walking: 'Đi bộ',
  other: 'Khác',
};
