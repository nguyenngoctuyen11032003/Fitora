// Activity catalogue for the workout logger (owner: Workout agent).
// MET values: 2011 Compendium of Physical Activities (Ainsworth et al.), code in comments.
// `fit_workouts.activity` stores the activity `key`; the chosen variant's MET is stored in `met`.
import type { WorkoutCategory } from '@/types/db';

/** Icon keys — mapped to lucide icons in src/features/workout/ActivityIcon.tsx. */
export type ActivityIconKey =
  | 'dumbbell'
  | 'flame'
  | 'heart'
  | 'zap'
  | 'flower'
  | 'wind'
  | 'run'
  | 'footprints'
  | 'waves'
  | 'bike'
  | 'trophy'
  | 'volleyball'
  | 'target'
  | 'mountain'
  | 'music'
  | 'swords'
  | 'sprout'
  | 'home'
  | 'sailboat'
  | 'timer'
  | 'activity';

export interface ActivityVariant {
  /** Stable id within the activity ('light', '8kmh', …). */
  id: string;
  /** Short Vietnamese label ("Vừa", "8 km/h"). */
  label: string;
  met: number;
  /** Typical speed (km/h) of speed-based variants (running, walking, road cycling) — converts distance ↔ duration. */
  kmh?: number;
}

export interface ActivityDef {
  key: string;
  name: string;
  category: WorkoutCategory;
  icon: ActivityIconKey;
  /** Intensity variants (≥ 1). */
  variants: ActivityVariant[];
  /** Index of the default variant. */
  defaultVariant: number;
  /** Extra search terms (no diacritics needed). */
  aliases?: string[];
}

type RawVariant = [id: string, label: string, met: number, kmh?: number];
type Raw = [key: string, name: string, icon: ActivityIconKey, variants: RawVariant[], def?: number, aliases?: string[]];

const RAW: Record<WorkoutCategory, Raw[]> = {
  gym: [
    // 02054 resistance training moderate 3.5 · 02050 vigorous 6.0
    ['weight_training', 'Tập tạ', 'dumbbell', [['moderate', 'Vừa', 3.5], ['vigorous', 'Nặng', 6.0]], 0, ['gym', 'ta', 'weights', 'boc ta']],
    // 02020 calisthenics light 2.8 · 02022 moderate 3.8 · 02024 vigorous 8.0
    ['bodyweight', 'Bài tập với trọng lượng cơ thể', 'activity', [['light', 'Nhẹ', 2.8], ['moderate', 'Vừa', 3.8], ['vigorous', 'Nặng', 8.0]], 1, ['calisthenics', 'hit dat', 'chong day', 'plank', 'gap bung']],
    // 02040 circuit training general 8.0 · 02045 moderate 4.3
    ['circuit_training', 'Circuit training', 'timer', [['moderate', 'Vừa', 4.3], ['vigorous', 'Mạnh', 8.0]], 1, ['vong', 'crossfit']],
    // 02048 elliptical trainer moderate 5.0
    ['elliptical', 'Máy elliptical', 'activity', [['moderate', 'Vừa', 5.0]], 0, ['may tap']],
    // 02071 rowing ergometer moderate 4.8 · 02072 100W 7.0 · 02073 150W 8.5
    ['rowing_machine', 'Máy chèo thuyền', 'sailboat', [['light', 'Nhẹ', 4.8], ['moderate', '100 W', 7.0], ['vigorous', '150 W', 8.5]], 1, ['rowing', 'cheo']],
    // 02065 stair-treadmill ergometer 9.0
    ['stair_machine', 'Máy leo cầu thang', 'mountain', [['general', 'Chung', 9.0]], 0, ['stairmaster', 'stepmill']],
    // 02101 stretching mild 2.3 (gym cool-down)
    ['gym_cooldown', 'Giãn cơ sau tập', 'wind', [['mild', 'Nhẹ', 2.3]], 0, ['stretching', 'gian co', 'cool down']],
  ],
  cardio: [
    // 02040 circuit, vigorous / HIIT 8.0 · 02024 calisthenics vigorous 8.0
    ['hiit', 'HIIT', 'zap', [['vigorous', 'Mạnh', 8.0]], 0, ['interval', 'tabata', 'cuong do cao']],
    // 03020 aerobic low impact 5.0 · 03015 general 7.3 · 03022 step 10-12in 9.5
    ['aerobic', 'Aerobic', 'heart', [['low', 'Nhẹ nhàng', 5.0], ['high', 'Cường độ cao', 7.3], ['step', 'Step aerobic', 9.5]], 0, ['thể dục nhịp điệu', 'the duc nhip dieu']],
    // 03038 ballroom slow 3.0 · 03031 ballroom fast 6.8 · 03025 general (salsa, hula…) 7.8
    ['dance', 'Nhảy / khiêu vũ', 'music', [['slow', 'Chậm', 3.0], ['fast', 'Nhanh', 6.8], ['dance', 'Zumba, salsa', 7.8]], 2, ['zumba', 'salsa', 'khieu vu', 'dance', 'nhay']],
    // 15551 jump rope slow 8.8 · 15552 moderate 11.8 · 15550 fast 12.3
    ['jump_rope', 'Nhảy dây', 'activity', [['slow', 'Chậm', 8.8], ['moderate', 'Vừa', 11.8], ['fast', 'Nhanh', 12.3]], 0, ['jump rope', 'nhay day']],
    // 15100 boxing punching bag 5.5 · 15110 sparring 7.8
    ['boxing', 'Boxing', 'swords', [['bag', 'Đấm bao', 5.5], ['sparring', 'Đấu tập', 7.8]], 0, ['quyen anh', 'kickboxing', 'dam boc']],
    // 15425 martial arts slower 5.3 · 15430 moderate 10.3
    ['martial_arts', 'Võ thuật', 'swords', [['light', 'Nhẹ', 5.3], ['moderate', 'Vừa', 10.3]], 0, ['vo', 'karate', 'taekwondo', 'vovinam', 'judo']],
  ],
  yoga: [
    // 02150 yoga hatha 2.5 · 02170 power 4.0 · 02180 Surya Namaskar 3.3 · 02175 Nadisodhana 2.0
    ['yoga_hatha', 'Yoga Hatha', 'flower', [['general', 'Chung', 2.5]], 0, ['yoga']],
    ['yoga_power', 'Power yoga / Vinyasa', 'flower', [['general', 'Chung', 4.0]], 0, ['yoga', 'vinyasa', 'ashtanga']],
    ['yoga_sun', 'Chào mặt trời', 'flower', [['general', 'Chung', 3.3]], 0, ['surya namaskar', 'yoga']],
    ['yoga_breath', 'Yoga thở', 'wind', [['general', 'Chung', 2.0]], 0, ['nadisodhana', 'tho', 'pranayama']],
    // 02105 Pilates general 3.0
    ['pilates', 'Pilates', 'activity', [['general', 'Chung', 3.0]], 0],
    // 02101 stretching mild 2.3
    ['stretching', 'Giãn cơ', 'wind', [['mild', 'Nhẹ', 2.3]], 0, ['stretching', 'keo gian']],
    // 15670 tai chi, qi gong general 3.0
    ['tai_chi', 'Thái cực quyền / khí công', 'wind', [['general', 'Chung', 3.0]], 0, ['tai chi', 'thai cuc', 'khi cong', 'duong sinh']],
  ],
  running: [
    // 12020 jogging general 7.0
    ['jogging', 'Chạy bộ nhẹ (jogging)', 'run', [['general', 'Chung', 7.0]], 0, ['jog', 'chay cham']],
    // 12029 4 mph (6.4 km/h) 6.0 · 12030 5 mph (8 km/h) 8.3 · 12050 6 mph (9.7 km/h) 9.8 · 12070 7 mph (11.3 km/h) 11.0
    // 12090 8 mph (12.9 km/h) 11.8 · 12110 9 mph (14.5 km/h) 12.8 · 12120 10 mph (16 km/h) 14.5
    [
      'running',
      'Chạy bộ',
      'run',
      [
        ['6kmh', '6,4 km/h', 6.0, 6.4],
        ['8kmh', '8 km/h', 8.3, 8],
        ['10kmh', '9,7 km/h', 9.8, 9.7],
        ['11kmh', '11,3 km/h', 11.0, 11.3],
        ['13kmh', '12,9 km/h', 11.8, 12.9],
        ['14kmh', '14,5 km/h', 12.8, 14.5],
        ['16kmh', '16 km/h', 14.5, 16],
      ],
      1,
      ['run', 'chay', 'treadmill', 'may chay'],
    ],
    // 12140 cross country 9.0
    ['trail_running', 'Chạy địa hình / trail', 'mountain', [['general', 'Chung', 9.0]], 0, ['trail', 'cross country', 'chay nui']],
    // running, stairs, up 15.0
    ['stair_running', 'Chạy lên cầu thang', 'mountain', [['general', 'Chung', 15.0]], 0, ['cau thang']],
    // 12180 running on a track, team practice 10.0
    ['track_interval', 'Chạy biến tốc (sân điền kinh)', 'timer', [['general', 'Chung', 10.0]], 0, ['interval', 'bien toc', 'track']],
  ],
  swimming: [
    // 18250 freestyle slow, light/moderate 5.8 · 18240 freestyle fast, vigorous 9.8
    ['swim_freestyle', 'Bơi tự do (sải)', 'waves', [['moderate', 'Vừa', 5.8], ['fast', 'Nhanh', 9.8]], 0, ['freestyle', 'boi sai', 'crawl']],
    // 18265 breaststroke recreational 5.3 · 18260 training 10.3
    ['swim_breaststroke', 'Bơi ếch', 'waves', [['leisure', 'Thư giãn', 5.3], ['training', 'Luyện tập', 10.3]], 0, ['breaststroke', 'boi ech']],
    // 18205 backstroke recreational 4.8 · 18200 training 9.5
    ['swim_backstroke', 'Bơi ngửa', 'waves', [['leisure', 'Thư giãn', 4.8], ['training', 'Luyện tập', 9.5]], 0, ['backstroke']],
    // 18220 butterfly general 13.8
    ['swim_butterfly', 'Bơi bướm', 'waves', [['general', 'Chung', 13.8]], 0, ['butterfly']],
    // 18310 swimming leisurely, not laps 6.0
    ['swim_leisure', 'Bơi thư giãn', 'waves', [['general', 'Chung', 6.0]], 0, ['boi', 'swim', 'ho boi']],
    // 18355 water aerobics 5.5
    ['water_aerobics', 'Aerobic dưới nước', 'waves', [['general', 'Chung', 5.5]], 0, ['aqua']],
    // 18366 treading water moderate 3.5
    ['treading_water', 'Đạp nước', 'waves', [['moderate', 'Vừa', 3.5]], 0, ['treading']],
  ],
  cycling: [
    // 01010 < 10 mph leisure 4.0 · 01020 10–11.9 mph 6.8 · 01030 12–13.9 mph 8.0 · 01040 14–15.9 mph 10.0 · 01050 16–19 mph 12.0
    // bicycling: leisure <16 km/h 4.0 · 16-19 km/h 6.8 · 19-22 km/h 8.0 · 22-25 km/h 10.0 · 25-30 km/h 12.0
    [
      'cycling_road',
      'Đạp xe',
      'bike',
      [
        ['leisure', '< 16 km/h', 4.0, 13],
        ['16_19', '16–19 km/h', 6.8, 17.5],
        ['19_22', '19–22 km/h', 8.0, 20.5],
        ['22_25', '22–25 km/h', 10.0, 23.5],
        ['25_30', '25–30 km/h', 12.0, 27.5],
      ],
      1,
      ['bike', 'xe dap', 'cycling'],
    ],
    // 01011 bicycling to/from work, self selected pace 6.8
    ['cycling_commute', 'Đạp xe đi làm / đi học', 'bike', [['general', 'Tự chọn', 6.8]], 0, ['commute', 'xe dap']],
    // 01015 mountain bike general 8.5
    ['mountain_bike', 'Xe đạp địa hình (MTB)', 'mountain', [['general', 'Chung', 8.5]], 0, ['mtb', 'dia hinh']],
    // 02010 stationary 30-50 W 3.5 · 02011 90-100 W 6.8 · 02012 101-160 W 8.8 · 02013 161-200 W 11.0
    [
      'stationary_bike',
      'Xe đạp tập tại chỗ',
      'bike',
      [
        ['light', 'Nhẹ (30–50 W)', 3.5],
        ['moderate', 'Vừa (90–100 W)', 6.8],
        ['vigorous', 'Mạnh (101–160 W)', 8.8],
        ['very', 'Rất mạnh (161–200 W)', 11.0],
      ],
      1,
      ['xe dap tap', 'stationary'],
    ],
    // 02014 stationary RPM/spin bike class 8.5
    ['spinning', 'Spinning', 'bike', [['class', 'Lớp spin', 8.5]], 0, ['spin', 'rpm']],
  ],
  team_sport: [
    // 15610 soccer casual 7.0 · 15605 competitive 10.0
    ['football', 'Bóng đá', 'trophy', [['casual', 'Giao hữu', 7.0], ['competitive', 'Thi đấu', 10.0]], 0, ['da bong', 'soccer', 'futsal', 'bong da']],
    // 15055 basketball general 6.5 · 15050 game 8.0 · 15070 shooting baskets 4.5
    ['basketball', 'Bóng rổ', 'trophy', [['shooting', 'Ném rổ', 4.5], ['general', 'Chung', 6.5], ['game', 'Thi đấu', 8.0]], 1, ['basketball', 'bong ro']],
    // 15711 volleyball non-competitive 3.0 · 15710 competitive gym 6.0 · 15725 beach 8.0
    ['volleyball', 'Bóng chuyền', 'volleyball', [['casual', 'Giao hữu', 3.0], ['competitive', 'Thi đấu', 6.0], ['beach', 'Bãi biển', 8.0]], 0, ['volleyball', 'bong chuyen']],
    // 15030 badminton social 5.5 · 15020 competitive 7.0
    ['badminton', 'Cầu lông', 'target', [['social', 'Giao lưu', 5.5], ['competitive', 'Thi đấu', 7.0]], 0, ['badminton', 'cau long']],
    // 15675 tennis general 7.3 · 15680 doubles 6.0 · 15690 singles 8.0
    ['tennis', 'Quần vợt (tennis)', 'target', [['doubles', 'Đánh đôi', 6.0], ['general', 'Chung', 7.3], ['singles', 'Đánh đơn', 8.0]], 1, ['tennis', 'quan vot']],
    // 15660 table tennis 4.0
    ['table_tennis', 'Bóng bàn', 'target', [['general', 'Chung', 4.0]], 0, ['ping pong', 'bong ban']],
    // 15200 hacky sack 4.0 (đá cầu)
    ['shuttlecock_kick', 'Đá cầu', 'target', [['general', 'Chung', 4.0]], 0, ['da cau']],
    // 15360 team handball 8.0
    ['handball', 'Bóng ném', 'trophy', [['general', 'Chung', 8.0]], 0, ['handball', 'bong nem']],
  ],
  walking: [
    // 17150 < 2 mph 2.0 · 17152 2.5 mph (4 km/h) 3.0 · 17170 3 mph (4.8 km/h) 3.5 · 17190 3.5 mph (5.6 km/h) 4.3
    // 17200 4 mph (6.4 km/h) 5.0 · 17220 4.5 mph (7.2 km/h) 7.0
    [
      'walking',
      'Đi bộ',
      'footprints',
      [
        ['slow', 'Chậm < 3 km/h', 2.0, 2.5],
        ['4kmh', '4 km/h', 3.0, 4],
        ['5kmh', '4,8 km/h', 3.5, 4.8],
        ['6kmh', '5,6 km/h', 4.3, 5.6],
        ['brisk', 'Nhanh 6,4 km/h', 5.0, 6.4],
        ['very_brisk', 'Rất nhanh 7,2 km/h', 7.0, 7.2],
      ],
      2,
      ['walk', 'di bo', 'tan bo'],
    ],
    // 17080 hiking cross country 6.0
    ['hiking', 'Leo núi / trekking', 'mountain', [['general', 'Chung', 6.0]], 0, ['hiking', 'trekking', 'leo nui']],
    // 17010 backpacking general 7.0
    ['backpacking', 'Đi bộ đường dài mang balo', 'mountain', [['general', 'Chung', 7.0]], 0, ['backpacking', 'balo']],
    // 17133 stair climbing slow 4.0 · 17134 fast 8.8
    ['stair_climbing', 'Leo cầu thang bộ', 'mountain', [['slow', 'Chậm', 4.0], ['fast', 'Nhanh', 8.8]], 0, ['cau thang', 'stairs']],
    // 17165 walking the dog 3.0
    ['dog_walking', 'Dắt chó đi dạo', 'footprints', [['general', 'Chung', 3.0]], 0, ['dat cho', 'dog']],
  ],
  other: [
    // 15535 rock or mountain climbing 8.0 · 15537 climbing wall/bouldering 5.8
    ['climbing', 'Leo vách / bouldering', 'mountain', [['wall', 'Tường leo', 5.8], ['rock', 'Vách đá', 8.0]], 0, ['leo vach', 'bouldering', 'climbing']],
    // 15255 golf general 4.8
    ['golf', 'Golf', 'target', [['general', 'Chung', 4.8]], 0],
    // 18020 canoeing/kayak moderate 5.0 · 18365 SUP moderate 6.0
    ['kayak', 'Chèo kayak / SUP', 'sailboat', [['kayak', 'Kayak', 5.0], ['sup', 'SUP', 6.0]], 0, ['cheo thuyen', 'kayak', 'sup']],
    // 15590 roller skating general 7.0 · 15580 skateboarding general 5.0
    ['skating', 'Trượt patin / ván', 'activity', [['skateboard', 'Trượt ván', 5.0], ['roller', 'Patin', 7.0]], 1, ['patin', 'skate', 'truot']],
    // 08245 gardening general moderate 3.8
    ['gardening', 'Làm vườn', 'sprout', [['general', 'Chung', 3.8]], 0, ['lam vuon']],
    // 05021 cleaning, general moderate 3.5
    ['housework', 'Dọn dẹp nhà cửa', 'home', [['moderate', 'Vừa', 3.5]], 0, ['don nha', 'lau nha', 'viec nha']],
    // 18350 surfing body or board general 3.0
    ['surfing', 'Lướt sóng', 'waves', [['general', 'Chung', 3.0]], 0, ['surf', 'luot song']],
  ],
};

function build(): ActivityDef[] {
  const out: ActivityDef[] = [];
  for (const [category, rows] of Object.entries(RAW) as [WorkoutCategory, Raw[]][]) {
    for (const [key, name, icon, vs, def = 0, aliases] of rows) {
      out.push({
        key,
        name,
        category,
        icon,
        variants: vs.map(([id, label, met, kmh]) => (kmh ? { id, label, met, kmh } : { id, label, met })),
        defaultVariant: Math.min(def, vs.length - 1),
        aliases,
      });
    }
  }
  return out;
}

/** All activities, grouped by category in WORKOUT_CATEGORIES order. */
export const ACTIVITIES: ActivityDef[] = build();

export const ACTIVITY_BY_KEY: Record<string, ActivityDef> = Object.fromEntries(ACTIVITIES.map((a) => [a.key, a]));

const foldKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();

/** Alias / name (folded) → first activity that declares it. Lets older or hand-typed keys ("yoga", "chay bo") resolve. */
const ALIAS_INDEX: Map<string, ActivityDef> = (() => {
  const m = new Map<string, ActivityDef>();
  for (const a of ACTIVITIES) {
    for (const k of [a.key, a.name, ...(a.aliases ?? [])]) {
      const f = foldKey(k);
      if (f && !m.has(f)) m.set(f, a);
    }
  }
  return m;
})();

/**
 * Catalogue entry for a stored `activity`. Exact key first; then legacy keys
 * that carry a variant suffix ("running_8kmh" → running); then an exact
 * alias/name match ("yoga" → Yoga Hatha). Free-text activities → undefined.
 */
export function findActivity(key: string | null | undefined): ActivityDef | undefined {
  if (!key) return undefined;
  const exact = ACTIVITY_BY_KEY[key];
  if (exact) return exact;
  if (/^[a-z0-9_]+$/.test(key)) {
    const parts = key.split('_');
    for (let n = parts.length - 1; n >= 1; n--) {
      const hit = ACTIVITY_BY_KEY[parts.slice(0, n).join('_')];
      if (hit) return hit;
    }
  }
  return ALIAS_INDEX.get(foldKey(key));
}

export function activitiesByCategory(category: WorkoutCategory): ActivityDef[] {
  return ACTIVITIES.filter((a) => a.category === category);
}

/** Default MET for a free-text activity per category (used when the user types their own). */
export const CATEGORY_DEFAULT_MET: Record<WorkoutCategory, number> = {
  gym: 3.5,
  cardio: 6.0,
  yoga: 2.5,
  running: 8.3,
  swimming: 5.8,
  cycling: 6.8,
  team_sport: 6.5,
  walking: 3.5,
  other: 4.0,
};
