// Giáo án tập tuần (cùng nội dung với app Vyora, bỏ video / hướng dẫn kỹ thuật).
// Fitora chỉ dùng danh sách bài + số hiệp để tập theo và tích dấu; kcal tính bằng MET của 'weight_training'.

export interface PlanExercise {
  id: string;
  name: string;
  vietnameseName: string;
  muscleGroups: string[];
  sets: number;
  reps: string;
  note?: string;
}

export interface PlanDay {
  id: string;
  /** 0 = Chủ nhật … 6 = Thứ 7 (Date#getDay). */
  dayNumber: number;
  shortLabel: string;
  fullLabel: string;
  title: string;
  muscleGroups: string[];
  isRestDay: boolean;
  /** Cường độ mặc định của 'weight_training' khi tính kcal. */
  defaultVariant: 'moderate' | 'vigorous';
  exercises: PlanExercise[];
}

/** Hoạt động trong catalogue dùng cho mọi buổi tập theo giáo án. */
export const PLAN_ACTIVITY_KEY = 'weight_training';

export const WORKOUT_PLAN: PlanDay[] = [
  {
    id: "monday", dayNumber: 1, shortLabel: "Thứ 2", fullLabel: "Thứ 2",
    title: "Ngực, vai và tay sau",
    muscleGroups: ["Ngực","Vai","Tay sau"],
    isRestDay: false, defaultVariant: "moderate",
    exercises: [
      { id: "bench-press", name: "Bench Press", vietnameseName: "Đẩy ngực thanh đòn", muscleGroups: ["Ngực"], sets: 5, reps: "14 / 12 / 10 / 8 / 6" },
      { id: "incline-bench-press", name: "Incline Bench Press", vietnameseName: "Đẩy ngực dốc lên", muscleGroups: ["Ngực trên"], sets: 4, reps: "14 / 12 / 10 / 8" },
      { id: "dip", name: "Dip", vietnameseName: "Xà kép", muscleGroups: ["Ngực","Tay sau"], sets: 3, reps: "Tối đa", note: "Mục tiêu khoảng 8 rep mỗi set nếu thể lực cho phép." },
      { id: "dumbbell-front-raise", name: "Dumbbell Front Raise", vietnameseName: "Nâng tạ trước", muscleGroups: ["Vai trước"], sets: 3, reps: "15 mỗi set" },
      { id: "dumbbell-lateral-raise", name: "Dumbbell Lateral Raise", vietnameseName: "Nâng tạ ngang", muscleGroups: ["Vai giữa"], sets: 3, reps: "15 mỗi set" },
      { id: "dumbbell-reverse-raise", name: "Dumbbell Reverse Raise", vietnameseName: "Nâng tạ vai sau", muscleGroups: ["Vai sau"], sets: 3, reps: "15 mỗi set" },
      { id: "cable-tricep-pushdown", name: "Cable Tricep Pushdown", vietnameseName: "Kéo cáp tay sau", muscleGroups: ["Tay sau"], sets: 4, reps: "15 mỗi set" },
    ],
  },
  {
    id: "tuesday", dayNumber: 2, shortLabel: "Thứ 3", fullLabel: "Thứ 3",
    title: "Chân, mông và core",
    muscleGroups: ["Chân","Mông","Core"],
    isRestDay: false, defaultVariant: "vigorous",
    exercises: [
      { id: "squat", name: "Squat", vietnameseName: "Gánh đùi", muscleGroups: ["Đùi","Mông"], sets: 5, reps: "14 / 12 / 10 / 8 / 6" },
      { id: "walking-lunges-tuesday", name: "Walking Lunges", vietnameseName: "Chùng chân bước tới", muscleGroups: ["Đùi","Mông"], sets: 4, reps: "14 / 12 / 10 / 8 mỗi chân" },
      { id: "hip-thrust-tuesday", name: "Hip Thrust", vietnameseName: "Đẩy hông", muscleGroups: ["Mông"], sets: 4, reps: "14 / 12 / 10 / 8" },
      { id: "leg-extension-tuesday", name: "Leg Extension", vietnameseName: "Duỗi chân máy", muscleGroups: ["Đùi trước"], sets: 3, reps: "14 / 12 / 10" },
      { id: "leg-curl-tuesday", name: "Leg Curl", vietnameseName: "Cuốn chân máy", muscleGroups: ["Đùi sau"], sets: 3, reps: "14 / 12 / 10" },
      { id: "leg-press-tuesday", name: "Leg Press", vietnameseName: "Đạp đùi máy", muscleGroups: ["Đùi","Mông"], sets: 4, reps: "15 mỗi set" },
      { id: "v-sit-up-tuesday", name: "V Sit-up", vietnameseName: "Gập bụng chữ V", muscleGroups: ["Core"], sets: 4, reps: "15 mỗi set" },
    ],
  },
  {
    id: "wednesday", dayNumber: 3, shortLabel: "Thứ 4", fullLabel: "Thứ 4",
    title: "Lưng, xô và tay trước",
    muscleGroups: ["Lưng","Xô","Tay trước"],
    isRestDay: false, defaultVariant: "moderate",
    exercises: [
      { id: "pull-up", name: "Pull-up", vietnameseName: "Hít xà", muscleGroups: ["Xô","Lưng"], sets: 5, reps: "Tối đa" },
      { id: "barbell-bent-over-row", name: "Barbell Bent-over Row", vietnameseName: "Kéo thanh đòn gập người", muscleGroups: ["Lưng"], sets: 4, reps: "14 / 12 / 10 / 8" },
      { id: "dumbbell-bent-over-row", name: "Dumbbell Bent-over Row", vietnameseName: "Kéo tạ đơn gập người", muscleGroups: ["Lưng","Xô"], sets: 4, reps: "14 / 12 / 10 / 8 mỗi bên" },
      { id: "seated-row", name: "Seated Row", vietnameseName: "Kéo cáp ngồi", muscleGroups: ["Lưng giữa"], sets: 3, reps: "15 mỗi set" },
      { id: "lat-pulldown", name: "Lat Pulldown", vietnameseName: "Kéo xô", muscleGroups: ["Xô"], sets: 3, reps: "15 mỗi set" },
      { id: "cable-bicep-curl", name: "Cable Bicep Curl", vietnameseName: "Cuốn tay trước cáp", muscleGroups: ["Tay trước"], sets: 4, reps: "15 mỗi set" },
      { id: "back-extension", name: "Back Extension", vietnameseName: "Duỗi lưng", muscleGroups: ["Lưng dưới"], sets: 4, reps: "15 mỗi set" },
    ],
  },
  {
    id: "thursday", dayNumber: 4, shortLabel: "Thứ 5", fullLabel: "Thứ 5",
    title: "Deadlift và chân",
    muscleGroups: ["Lưng dưới","Chân","Mông"],
    isRestDay: false, defaultVariant: "vigorous",
    exercises: [
      { id: "deadlift", name: "Deadlift", vietnameseName: "Kéo tạ", muscleGroups: ["Lưng dưới","Mông","Đùi sau"], sets: 5, reps: "14 / 12 / 10 / 8 / 6" },
      { id: "walking-lunges-thursday", name: "Walking Lunges", vietnameseName: "Chùng chân bước tới", muscleGroups: ["Đùi","Mông"], sets: 4, reps: "14 / 12 / 10 / 8 mỗi chân" },
      { id: "hip-thrust-thursday", name: "Hip Thrust", vietnameseName: "Đẩy hông", muscleGroups: ["Mông"], sets: 4, reps: "14 / 12 / 10 / 8" },
      { id: "leg-extension-thursday", name: "Leg Extension", vietnameseName: "Duỗi chân máy", muscleGroups: ["Đùi trước"], sets: 3, reps: "14 / 12 / 10" },
      { id: "leg-curl-thursday", name: "Leg Curl", vietnameseName: "Cuốn chân máy", muscleGroups: ["Đùi sau"], sets: 3, reps: "14 / 12 / 10" },
      { id: "leg-press-thursday", name: "Leg Press", vietnameseName: "Đạp đùi máy", muscleGroups: ["Đùi","Mông"], sets: 4, reps: "15 mỗi set" },
      { id: "v-sit-up-thursday", name: "V Sit-up", vietnameseName: "Gập bụng chữ V", muscleGroups: ["Core"], sets: 4, reps: "15 mỗi set" },
    ],
  },
  {
    id: "friday", dayNumber: 5, shortLabel: "Thứ 6", fullLabel: "Thứ 6",
    title: "Vai, ngực và tay sau",
    muscleGroups: ["Vai","Ngực","Tay sau"],
    isRestDay: false, defaultVariant: "moderate",
    exercises: [
      { id: "overhead-press", name: "Overhead Press (OHP)", vietnameseName: "Đẩy vai thanh đòn", muscleGroups: ["Vai"], sets: 5, reps: "14 / 12 / 10 / 8 / 6" },
      { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", vietnameseName: "Đẩy vai tạ đơn", muscleGroups: ["Vai"], sets: 4, reps: "14 / 12 / 10 / 8" },
      { id: "dumbbell-front-raise-friday", name: "Dumbbell Front Raise", vietnameseName: "Nâng tạ trước", muscleGroups: ["Vai trước"], sets: 4, reps: "15 mỗi set" },
      { id: "dumbbell-lateral-raise-friday", name: "Dumbbell Lateral Raise", vietnameseName: "Nâng tạ ngang", muscleGroups: ["Vai giữa"], sets: 4, reps: "15 mỗi set" },
      { id: "dumbbell-reverse-raise-friday", name: "Dumbbell Reverse Raise", vietnameseName: "Nâng tạ vai sau", muscleGroups: ["Vai sau"], sets: 4, reps: "15 mỗi set" },
      { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", vietnameseName: "Đẩy ngực tạ đơn", muscleGroups: ["Ngực"], sets: 3, reps: "15 mỗi set" },
      { id: "dumbbell-incline-bench-press", name: "Dumbbell Incline Bench Press", vietnameseName: "Đẩy ngực dốc lên tạ đơn", muscleGroups: ["Ngực trên"], sets: 3, reps: "15 mỗi set" },
      { id: "cable-tricep-extension", name: "Cable Tricep Extension", vietnameseName: "Duỗi tay sau với cáp", muscleGroups: ["Tay sau"], sets: 4, reps: "15 mỗi set" },
    ],
  },
  {
    id: "saturday", dayNumber: 6, shortLabel: "Thứ 7", fullLabel: "Thứ 7",
    title: "Ngày nghỉ phục hồi",
    muscleGroups: ["Phục hồi"],
    isRestDay: true, defaultVariant: "moderate",
    exercises: [],
  },
  {
    id: "sunday", dayNumber: 0, shortLabel: "CN", fullLabel: "Chủ nhật",
    title: "Ngày nghỉ phục hồi",
    muscleGroups: ["Phục hồi"],
    isRestDay: true, defaultVariant: "moderate",
    exercises: [],
  },
];

export function findPlanDay(id: string | null | undefined): PlanDay | undefined {
  return WORKOUT_PLAN.find((d) => d.id === id);
}

/** Ngày tập của một ngày trong tuần (theo Date#getDay), kể cả ngày nghỉ. */
export function planDayFor(date: Date = new Date()): PlanDay | undefined {
  return WORKOUT_PLAN.find((d) => d.dayNumber === date.getDay());
}

/** Các ngày có bài tập, theo thứ tự Thứ 2 → Thứ 6. */
export const TRAINING_DAYS: PlanDay[] = WORKOUT_PLAN.filter((d) => !d.isRestDay && d.exercises.length > 0);
