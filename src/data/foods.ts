// Curated food database for Fitora (owner: Food Diary & Search).
//
// Values are per 100 g of the food *as eaten* (soups include broth, dishes include
// their usual toppings). Sources, cross-checked and rounded:
//  - Viện Dinh dưỡng Quốc gia, "Bảng thành phần thực phẩm Việt Nam" (NXB Y học, 2007)
//    → staples, fruit, meat, fish, eggs, tofu, giò lụa, nem chua, bánh chưng...
//  - Viện Dinh dưỡng, "Giá trị dinh dưỡng một số món ăn thông dụng" + bảng tính khẩu phần
//    → composite dishes (phở, bún, cơm tấm, bánh mì, xôi, chè) as weighted recipes.
//  - USDA FoodData Central (SR Legacy / FNDDS) for imported foods, nuts, fast food.
//  - Nutrition labels of common Vietnamese retail products (Vinamilk, Hảo Hảo, Coca-Cola...).
// Composite dishes vary a lot by cook; values are typical street-food portions and
// kcal ≈ 4·P + 4·C + 9·F (checked in lib.test.ts). Portion grams are typical servings
// ("bát" phở ≈ 500 g with broth, "bát" cơm ≈ 150 g, "ổ" bánh mì thịt ≈ 180 g).

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface FoodUnit {
  /** Unit word shown and stored in fit_meal_entries.unit (≤ 20 chars). */
  unit: string;
  /** Grams per 1 unit. */
  grams: number;
}

export type FoodCategory =
  | 'mon_nuoc'
  | 'com'
  | 'banh_xoi'
  | 'mon_man'
  | 'rau_canh'
  | 'tinh_bot'
  | 'dam'
  | 'trai_cay'
  | 'do_uong'
  | 'sua'
  | 'hat'
  | 'trang_mieng'
  | 'fast_food'
  | 'dong_goi'
  | 'gia_vi';

export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  mon_nuoc: 'Bún · Phở · Mì',
  com: 'Cơm',
  banh_xoi: 'Bánh & Xôi',
  mon_man: 'Món mặn',
  rau_canh: 'Rau & Canh',
  tinh_bot: 'Tinh bột',
  dam: 'Thịt · Cá · Trứng',
  trai_cay: 'Trái cây',
  do_uong: 'Đồ uống',
  sua: 'Sữa',
  hat: 'Các loại hạt',
  trang_mieng: 'Chè & Tráng miệng',
  fast_food: 'Đồ ăn nhanh',
  dong_goi: 'Đóng gói & Ăn vặt',
  gia_vi: 'Dầu & Gia vị',
};

export interface FoodItem {
  id: string;
  name: string;
  /** Extra search keys without diacritics (the unaccented name is always included first). */
  aliases: string[];
  category: FoodCategory;
  per100g: Nutrients;
  /** Household units; the first is the default. 'g' is added by the UI. */
  units: FoodUnit[];
  defaultUnit: string;
}

/** Local diacritic stripper (kept here so the data file has no imports). */
function unaccent(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type N = [kcal: number, protein: number, carbs: number, fat: number, fiber: number];
type U = [unit: string, grams: number];

function f(id: string, name: string, category: FoodCategory, n: N, units: U[], aliases: string[] = []): FoodItem {
  const keys = [unaccent(name), ...aliases.map(unaccent)];
  return {
    id,
    name,
    aliases: [...new Set(keys)],
    category,
    per100g: { kcal: n[0], protein: n[1], carbs: n[2], fat: n[3], fiber: n[4] },
    units: units.map(([unit, grams]) => ({ unit, grams })),
    defaultUnit: units[0]?.[0] ?? 'g',
  };
}

export const FOODS: FoodItem[] = [
  /* ------------------------------------------------------------------ */
  /* Bún · Phở · Mì · Cháo (per 100 g incl. broth)                        */
  /* ------------------------------------------------------------------ */
  f('pho_bo', 'Phở bò', 'mon_nuoc', [90, 5.5, 11, 2.6, 0.4], [['bát', 500], ['bát nhỏ', 350], ['bát lớn', 650]], ['pho', 'pho tai', 'pho chin', 'pho bo tai nam', 'pho ga bo']),
  f('pho_ga', 'Phở gà', 'mon_nuoc', [80, 5.8, 10.5, 1.6, 0.3], [['bát', 500], ['bát nhỏ', 350]], ['pho ga ta']),
  f('pho_xao', 'Phở xào bò', 'mon_nuoc', [170, 7, 22, 6, 1], [['đĩa', 350]], ['pho xao']),
  f('pho_cuon', 'Phở cuốn', 'mon_nuoc', [180, 9, 22, 6.2, 1], [['cuốn', 60], ['đĩa', 360]]),
  f('bun_bo_hue', 'Bún bò Huế', 'mon_nuoc', [95, 5.5, 10.5, 3.4, 0.5], [['bát', 550], ['bát nhỏ', 400]], ['bun bo']),
  f('bun_cha', 'Bún chả', 'mon_nuoc', [160, 8, 19, 5.6, 1], [['suất', 450], ['suất nhỏ', 300]], ['bun cha ha noi']),
  f('bun_rieu', 'Bún riêu cua', 'mon_nuoc', [80, 4.5, 10, 2.5, 0.8], [['bát', 500]], ['bun rieu']),
  f('bun_thit_nuong', 'Bún thịt nướng', 'mon_nuoc', [175, 8, 22, 6, 1.2], [['tô', 400]], ['bun thit nuong cha gio']),
  f('bun_moc', 'Bún mọc', 'mon_nuoc', [75, 5, 9.5, 1.9, 0.4], [['bát', 500]]),
  f('bun_ca', 'Bún cá', 'mon_nuoc', [75, 5.5, 9.5, 1.7, 0.6], [['bát', 500]], ['bun ca ro dong']),
  f('bun_dau_mam_tom', 'Bún đậu mắm tôm', 'mon_nuoc', [210, 9, 22, 9.5, 1], [['suất', 400], ['suất nhỏ', 280]], ['bun dau']),
  f('bun_mam', 'Bún mắm', 'mon_nuoc', [85, 5.5, 9, 3, 0.6], [['tô', 550]]),
  f('bun_oc', 'Bún ốc', 'mon_nuoc', [70, 4.5, 10, 1.4, 0.6], [['bát', 500]]),
  f('bun_thang', 'Bún thang', 'mon_nuoc', [75, 5.5, 9.5, 1.6, 0.3], [['bát', 500]]),
  f('bun_ga', 'Bún gà', 'mon_nuoc', [78, 5.5, 10, 1.7, 0.3], [['bát', 500]], ['bun mien ga']),
  f('hu_tieu', 'Hủ tiếu Nam Vang', 'mon_nuoc', [85, 5, 11, 2.3, 0.3], [['tô', 500]], ['hu tieu', 'hu tiu']),
  f('hu_tieu_xao', 'Hủ tiếu xào', 'mon_nuoc', [175, 7, 24, 5.8, 1], [['đĩa', 350]], ['hu tiu xao']),
  f('mi_quang', 'Mì Quảng', 'mon_nuoc', [125, 6.5, 15, 4.4, 0.8], [['tô', 450]], ['mi quang ga', 'my quang']),
  f('mien_ga', 'Miến gà', 'mon_nuoc', [70, 5, 9, 1.4, 0.3], [['bát', 500]], ['mien']),
  f('mien_xao_luon', 'Miến xào lươn', 'mon_nuoc', [190, 8, 24, 7, 1], [['đĩa', 300]], ['mien luon']),
  f('banh_canh_cua', 'Bánh canh cua', 'mon_nuoc', [85, 5, 11, 2.3, 0.3], [['tô', 500]], ['banh canh']),
  f('banh_da_cua', 'Bánh đa cua', 'mon_nuoc', [80, 5, 11, 1.8, 0.5], [['bát', 500]]),
  f('cao_lau', 'Cao lầu', 'mon_nuoc', [140, 7, 18, 4.5, 1], [['tô', 400]]),
  f('mi_vit_tiem', 'Mì vịt tiềm', 'mon_nuoc', [120, 7, 11, 5.3, 0.4], [['tô', 550]], ['mi vit']),
  f('mi_xao_bo', 'Mì xào bò', 'mon_nuoc', [180, 8, 22, 6.8, 1.2], [['đĩa', 350]], ['mi xao', 'mi xao gion']),
  f('chao_ga', 'Cháo gà', 'mon_nuoc', [60, 4, 8, 1.3, 0.2], [['bát', 400], ['bát nhỏ', 300]]),
  f('chao_long', 'Cháo lòng', 'mon_nuoc', [75, 5, 7.5, 2.8, 0.2], [['bát', 400]]),
  f('chao_suon', 'Cháo sườn', 'mon_nuoc', [65, 3.5, 8.5, 1.8, 0.2], [['bát', 400]], ['chao suon sun']),
  f('chao_trang', 'Cháo trắng', 'mon_nuoc', [46, 1, 10, 0.2, 0.1], [['bát', 300]], ['chao hoa']),
  f('chao_thit_bam', 'Cháo thịt bằm', 'mon_nuoc', [62, 3.8, 8.2, 1.5, 0.2], [['bát', 400]], ['chao thit', 'chao bam']),
  f('mi_cay', 'Mì cay Hàn Quốc', 'mon_nuoc', [110, 5, 15, 3.4, 0.6], [['tô', 500]], ['mi cay']),

  /* ------------------------------------------------------------------ */
  /* Cơm (dishes)                                                          */
  /* ------------------------------------------------------------------ */
  f('com_tam_suon', 'Cơm tấm sườn', 'com', [190, 9, 24, 6.5, 0.6], [['đĩa', 350]], ['com tam', 'com suon']),
  f('com_tam_suon_bi_cha', 'Cơm tấm sườn bì chả', 'com', [200, 9.5, 23, 7.7, 0.6], [['đĩa', 450]], ['com tam suon bi cha', 'com tam dac biet']),
  // ≈ 250 g cơm + 130 g đùi gà chiên (bỏ xương) + dưa, nước chấm → ~740 kcal / đĩa 400 g.
  f('com_ga_xoi_mo', 'Cơm gà xối mỡ', 'com', [185, 10, 21.5, 6.8, 0.5], [['đĩa', 400], ['đĩa nhỏ', 300]], ['com ga chien', 'com ga']),
  f('com_ga_hai_nam', 'Cơm gà Hải Nam', 'com', [180, 9, 22, 6.2, 0.4], [['đĩa', 400]], ['com ga luoc', 'com ga hoi an']),
  f('com_rang', 'Cơm rang dương châu', 'com', [180, 5.5, 25, 6.5, 0.8], [['đĩa', 350]], ['com chien', 'com rang', 'com chien duong chau']),
  f('com_rang_dua_bo', 'Cơm rang dưa bò', 'com', [175, 6.5, 22, 6.7, 1], [['đĩa', 350]], ['com chien bo']),
  f('com_binh_dan', 'Cơm bình dân (suất)', 'com', [170, 7, 22, 6, 1], [['suất', 450], ['suất nhỏ', 350]], ['com suat', 'com van phong', 'com bui']),
  f('com_bo_luc_lac', 'Cơm bò lúc lắc', 'com', [190, 10, 21, 7.3, 0.8], [['đĩa', 400]]),
  f('com_chien_hai_san', 'Cơm chiên hải sản', 'com', [175, 7, 24, 5.7, 0.7], [['đĩa', 350]], ['com rang hai san']),
  f('com_cuon_kimbap', 'Kimbap (cơm cuộn)', 'com', [150, 4.5, 26, 3, 1], [['cuộn', 220], ['miếng', 25]], ['kimbap', 'gimbap']),

  /* ------------------------------------------------------------------ */
  /* Tinh bột cơ bản                                                       */
  /* ------------------------------------------------------------------ */
  f('com_trang', 'Cơm trắng', 'tinh_bot', [130, 2.7, 28.5, 0.3, 0.4], [['bát', 150], ['bát đầy', 200], ['bát nhỏ', 100], ['muôi', 80]], ['com', 'com te']),
  f('com_gao_lut', 'Cơm gạo lứt', 'tinh_bot', [112, 2.3, 23.5, 0.8, 1.8], [['bát', 150], ['bát nhỏ', 100]], ['gao lut', 'brown rice']),
  f('bun_tuoi', 'Bún tươi', 'tinh_bot', [110, 1.7, 25.7, 0.1, 0.5], [['lạng', 100], ['phần', 150]], ['bun']),
  f('banh_pho_tuoi', 'Bánh phở', 'tinh_bot', [141, 3.2, 32, 0.2, 0.4], [['phần', 150], ['lạng', 100]], ['banh pho']),
  f('mien_luoc', 'Miến dong (luộc)', 'tinh_bot', [110, 0.2, 27, 0.1, 0.5], [['phần', 150]], ['mien dong']),
  f('mi_trung_luoc', 'Mì trứng (luộc)', 'tinh_bot', [138, 4.5, 25, 2.1, 1.2], [['vắt', 120]], ['mi soi', 'mi vat']),
  f('nui_luoc', 'Nui / mì ống (luộc)', 'tinh_bot', [157, 5.8, 30.6, 0.9, 1.8], [['đĩa', 200], ['bát', 150]], ['nui', 'mi ong', 'pasta']),
  f('khoai_lang', 'Khoai lang luộc', 'tinh_bot', [119, 0.8, 28.5, 0.2, 1.3], [['củ', 200], ['củ nhỏ', 120]], ['khoai lang', 'khoai lang nuong']),
  f('khoai_tay', 'Khoai tây luộc', 'tinh_bot', [87, 1.9, 20, 0.1, 1.8], [['củ', 150]], ['khoai tay']),
  f('khoai_mon', 'Khoai môn luộc', 'tinh_bot', [109, 1.5, 25.6, 0.2, 1.2], [['củ', 150]], ['khoai mon', 'khoai so']),
  f('san_luoc', 'Sắn (khoai mì) luộc', 'tinh_bot', [152, 1.1, 36.4, 0.2, 1.5], [['khúc', 150]], ['san', 'khoai mi', 'cu san']),
  f('ngo_luoc', 'Ngô (bắp) luộc', 'tinh_bot', [110, 3.5, 23, 1.5, 2.7], [['bắp', 150]], ['ngo', 'bap', 'bap luoc', 'ngo nep']),
  f('yen_mach', 'Yến mạch', 'tinh_bot', [389, 16.9, 66.3, 6.9, 10.6], [['gói', 40], ['thìa', 10], ['chén', 40]], ['oat', 'oats', 'yen mach can det']),
  f('banh_mi_khong', 'Bánh mì không', 'tinh_bot', [265, 8.5, 51, 2.5, 2.4], [['ổ', 80], ['nửa ổ', 40]], ['banh mi trang', 'banh mi khong nhan']),
  f('banh_mi_sandwich', 'Bánh mì sandwich', 'tinh_bot', [265, 9, 49, 3.2, 2.7], [['lát', 30]], ['banh mi lat', 'sandwich']),
  f('banh_mi_den', 'Bánh mì đen nguyên cám', 'tinh_bot', [247, 13, 41, 3.4, 7], [['lát', 35]], ['banh mi nguyen cam', 'whole wheat']),
  f('banh_trang', 'Bánh tráng (bánh đa nem)', 'tinh_bot', [333, 4, 78.9, 0.2, 0.8], [['tờ', 10]], ['banh trang', 'banh da nem']),
  f('xoi_trang', 'Xôi trắng', 'tinh_bot', [220, 4.2, 48, 0.8, 0.6], [['gói', 200], ['nắm', 150]], ['xoi', 'xoi nep']),

  /* ------------------------------------------------------------------ */
  /* Bánh & Xôi                                                           */
  /* ------------------------------------------------------------------ */
  f('banh_mi_thit', 'Bánh mì thịt', 'banh_xoi', [255, 11, 29, 10.3, 1.5], [['ổ', 180]], ['banh mi', 'banh mi pate thit', 'banh mi thap cam']),
  f('banh_mi_trung', 'Bánh mì trứng', 'banh_xoi', [250, 9.5, 30, 10.2, 1.4], [['ổ', 160]], ['banh mi op la']),
  f('banh_mi_xiu_mai', 'Bánh mì xíu mại', 'banh_xoi', [240, 10, 28, 9.5, 1.5], [['ổ', 200]], ['xiu mai']),
  f('banh_mi_pate', 'Bánh mì pate', 'banh_xoi', [270, 9, 32, 11.8, 1.5], [['ổ', 140]]),
  f('banh_mi_ga', 'Bánh mì gà xé', 'banh_xoi', [235, 12.5, 28, 8, 1.4], [['ổ', 180]], ['banh mi ga']),
  f('banh_mi_que', 'Bánh mì que', 'banh_xoi', [290, 9, 35, 12.8, 1.5], [['cái', 60]]),
  f('xoi_xeo', 'Xôi xéo', 'banh_xoi', [230, 5.5, 37, 6.6, 1.5], [['gói', 250], ['gói nhỏ', 180]]),
  f('xoi_gac', 'Xôi gấc', 'banh_xoi', [220, 4, 44, 3, 0.8], [['gói', 200]]),
  f('xoi_dau_xanh', 'Xôi đậu xanh', 'banh_xoi', [210, 6, 42, 1.8, 1.5], [['gói', 200]]),
  f('xoi_lac', 'Xôi lạc', 'banh_xoi', [240, 6.5, 40, 6, 1.7], [['gói', 200]], ['xoi dau phong']),
  f('xoi_ga', 'Xôi gà', 'banh_xoi', [215, 9, 32, 5.6, 0.8], [['hộp', 300]], ['xoi ga xe']),
  f('xoi_man', 'Xôi mặn (thập cẩm)', 'banh_xoi', [225, 8, 30, 8.2, 0.7], [['hộp', 300]], ['xoi thap cam', 'xoi pate']),
  f('banh_cuon', 'Bánh cuốn', 'banh_xoi', [150, 5, 22, 4.6, 0.6], [['đĩa', 300], ['cái', 40]], ['banh cuon cha', 'banh cuon nong']),
  f('banh_chung', 'Bánh chưng', 'banh_xoi', [200, 5.5, 33, 5.1, 1.2], [['lát', 100], ['cái nhỏ', 250]], ['banh chung']),
  f('banh_tet', 'Bánh tét', 'banh_xoi', [215, 5.5, 34, 6.4, 1], [['khoanh', 100]]),
  f('banh_xeo', 'Bánh xèo', 'banh_xoi', [225, 7, 20, 12.9, 1.5], [['cái', 180]], ['banh xeo mien tay']),
  f('banh_khot', 'Bánh khọt', 'banh_xoi', [250, 7, 25, 13.5, 1], [['cái', 25], ['đĩa', 200]]),
  f('banh_beo', 'Bánh bèo', 'banh_xoi', [130, 3.5, 22, 3, 0.5], [['đĩa', 200], ['chén', 30]]),
  f('banh_bot_loc', 'Bánh bột lọc', 'banh_xoi', [170, 5, 30, 3.3, 0.8], [['cái', 25], ['đĩa', 200]]),
  f('banh_bao', 'Bánh bao nhân thịt', 'banh_xoi', [235, 8.5, 33, 7.6, 1.2], [['cái', 150], ['cái nhỏ', 80]], ['banh bao']),
  f('banh_gio', 'Bánh giò', 'banh_xoi', [170, 5.5, 24, 5.7, 0.6], [['cái', 200]]),
  f('banh_giay_gio', 'Bánh giầy giò', 'banh_xoi', [220, 7, 30, 8, 0.5], [['cái', 120]], ['banh day gio', 'banh day']),
  f('banh_duc', 'Bánh đúc nóng', 'banh_xoi', [120, 3.5, 18, 3.8, 0.6], [['bát', 300]], ['banh duc']),
  f('banh_trang_tron', 'Bánh tráng trộn', 'banh_xoi', [280, 7, 40, 10.2, 2], [['túi', 150]]),
  f('banh_trang_nuong', 'Bánh tráng nướng', 'banh_xoi', [290, 9, 35, 12.9, 1.5], [['cái', 100]], ['pizza viet nam']),
  f('goi_cuon', 'Gỏi cuốn tôm thịt', 'banh_xoi', [130, 7, 20, 2.4, 1.2], [['cuốn', 80], ['đĩa', 320]], ['goi cuon', 'nem cuon', 'cuon tom thit']),
  f('nem_ran', 'Nem rán (chả giò)', 'banh_xoi', [290, 11, 18, 19.5, 1.2], [['cái', 40], ['đĩa', 200]], ['cha gio', 'nem', 'nem ran']),
  f('banh_pia', 'Bánh pía', 'banh_xoi', [410, 7, 58, 16.8, 2], [['cái', 100], ['cái nhỏ', 50]]),
  f('banh_trung_thu', 'Bánh trung thu', 'banh_xoi', [420, 6.5, 60, 17, 2], [['cái', 150], ['miếng', 40]], ['banh nuong', 'banh deo']),

  /* ------------------------------------------------------------------ */
  /* Món mặn                                                              */
  /* ------------------------------------------------------------------ */
  f('thit_kho_trung', 'Thịt kho trứng', 'mon_man', [220, 12, 4, 17.3, 0], [['phần', 150], ['miếng', 30]], ['thit kho tau', 'thit kho hot vit']),
  f('thit_kho_tieu', 'Thịt kho tiêu', 'mon_man', [260, 15, 5, 20, 0], [['phần', 120]], ['thit kho', 'thit rim']),
  f('ca_kho_to', 'Cá kho tộ', 'mon_man', [170, 18, 4.5, 8.8, 0], [['khúc', 100], ['phần', 150]], ['ca kho', 'ca kho tieu', 'ca bong kho']),
  f('suon_xao_chua_ngot', 'Sườn xào chua ngọt', 'mon_man', [250, 14, 12, 16.4, 0.3], [['phần', 150]], ['suon chua ngot', 'suon ram']),
  f('suon_nuong', 'Sườn nướng', 'mon_man', [280, 18, 6, 20.4, 0], [['miếng', 100]], ['suon cot let nuong', 'suon']),
  f('thit_luoc', 'Thịt ba chỉ luộc', 'mon_man', [260, 16, 0, 21.5, 0], [['đĩa', 150], ['lát', 15]], ['thit luoc', 'ba chi', 'ba roi']),
  f('thit_nuong', 'Thịt lợn nướng', 'mon_man', [240, 20, 6, 15, 0.2], [['phần', 120], ['xiên', 50]], ['thit heo nuong', 'cha nuong']),
  f('bo_xao', 'Bò xào rau', 'mon_man', [140, 12, 5, 8, 1], [['đĩa', 250]], ['bo xao can', 'bo xao hanh tay', 'bo xao']),
  f('bo_luc_lac', 'Bò lúc lắc', 'mon_man', [210, 20, 5, 12.2, 0.5], [['đĩa', 200]]),
  f('bo_bit_tet', 'Bò bít tết', 'mon_man', [230, 22, 3, 14.5, 0.2], [['phần', 200]], ['beefsteak', 'bit tet', 'steak']),
  f('bo_kho', 'Bò kho', 'mon_man', [140, 11, 6, 8, 1], [['bát', 300]], ['bo kho banh mi']),
  f('ga_kho_gung', 'Gà kho gừng', 'mon_man', [190, 20, 4, 10.4, 0.2], [['phần', 150]], ['ga kho']),
  f('ga_nuong', 'Gà nướng', 'mon_man', [210, 25, 2, 11.4, 0], [['phần', 150], ['đùi', 150]], ['ga nuong mat ong']),
  f('ga_ran', 'Gà rán', 'mon_man', [260, 20, 9, 16, 0.4], [['miếng', 120], ['cánh', 50]], ['ga chien', 'ga ran kfc', 'dui ga ran']),
  f('canh_ga_chien_mam', 'Cánh gà chiên nước mắm', 'mon_man', [290, 20, 6, 20.8, 0], [['cánh', 40], ['đĩa', 200]], ['canh ga']),
  f('vit_quay', 'Vịt quay', 'mon_man', [337, 19, 0, 28.4, 0], [['đĩa', 200], ['miếng', 80]], ['vit nuong']),
  f('cha_ca', 'Chả cá Lã Vọng', 'mon_man', [210, 18, 5, 13, 0.5], [['phần', 200]], ['cha ca la vong']),
  f('ca_chien', 'Cá thu chiên', 'mon_man', [230, 22, 2, 15, 0], [['khúc', 100]], ['ca thu', 'ca chien']),
  f('ca_sot_ca_chua', 'Cá sốt cà chua', 'mon_man', [150, 16, 5, 7.4, 0.6], [['phần', 150]], ['ca sot ca']),
  f('tom_rim', 'Tôm rim', 'mon_man', [160, 22, 5, 5.6, 0], [['phần', 100]], ['tom rang', 'tom rim man']),
  f('muc_xao', 'Mực xào', 'mon_man', [120, 15, 5, 4.5, 0.6], [['đĩa', 200]], ['muc xao rau']),
  f('oc_luoc', 'Ốc luộc', 'mon_man', [70, 11.9, 3.6, 0.7, 0], [['đĩa', 200]], ['oc']),
  f('dau_sot_ca', 'Đậu phụ sốt cà chua', 'mon_man', [120, 8, 5, 7.5, 1], [['phần', 200]], ['dau sot ca', 'dau hu sot ca']),
  f('dau_nhoi_thit', 'Đậu phụ nhồi thịt', 'mon_man', [170, 12, 5, 11.5, 0.6], [['phần', 150], ['miếng', 50]], ['dau nhoi thit']),
  f('trung_chien', 'Trứng chiên (ốp la)', 'mon_man', [196, 13.6, 0.8, 15.3, 0], [['quả', 50]], ['trung op la', 'trung rán', 'trung ran']),
  f('trung_chung', 'Trứng đúc thịt', 'mon_man', [190, 14, 2, 14, 0.2], [['phần', 150]], ['trung hap', 'trung chung', 'trung duc']),
  f('cha_lua', 'Giò lụa (chả lụa)', 'mon_man', [136, 21.5, 0, 5.5, 0], [['lát', 25], ['khoanh', 100]], ['gio lua', 'cha lua']),
  f('nem_chua', 'Nem chua', 'mon_man', [137, 21.7, 4.3, 3.7, 0], [['cái', 25]]),
  f('lap_xuong', 'Lạp xưởng', 'mon_man', [520, 20.8, 4, 47, 0], [['cái', 40]], ['lap xuong']),
  f('xuc_xich', 'Xúc xích', 'mon_man', [270, 12, 6, 22, 0], [['cái', 40]], ['xuc xich heo', 'hotdog', 'sausage']),

  /* ------------------------------------------------------------------ */
  /* Thịt · Cá · Trứng (nguyên liệu đã nấu chín, ít dầu)                  */
  /* ------------------------------------------------------------------ */
  f('uc_ga', 'Ức gà (luộc/áp chảo)', 'dam', [165, 31, 0, 3.6, 0], [['miếng', 150], ['lạng', 100]], ['uc ga', 'chicken breast', 'ga uc']),
  f('ga_luoc', 'Gà luộc (có da)', 'dam', [200, 22, 0, 12.5, 0], [['phần', 150], ['miếng', 50], ['đùi', 120]], ['ga luoc', 'thit ga']),
  f('thit_lon_nac', 'Thịt lợn nạc (chín)', 'dam', [180, 26, 0, 8.5, 0], [['lạng', 100]], ['thit heo nac', 'thit nac']),
  f('thit_bo_nac', 'Thịt bò nạc (chín)', 'dam', [190, 28, 0, 8.5, 0], [['lạng', 100]], ['thit bo', 'bo']),
  f('ca_hoi', 'Cá hồi áp chảo', 'dam', [208, 20, 0, 13.4, 0], [['miếng', 120]], ['ca hoi', 'salmon']),
  f('ca_ro_phi', 'Cá rô phi hấp', 'dam', [128, 26, 0, 2.7, 0], [['miếng', 100], ['con', 250]], ['ca ro phi', 'ca dieu hong', 'ca hap']),
  f('tom_luoc', 'Tôm luộc', 'dam', [99, 24, 0.2, 0.3, 0], [['lạng', 100], ['con', 15]], ['tom', 'tom hap']),
  f('trung_ga', 'Trứng gà luộc', 'dam', [155, 13, 1.1, 10.6, 0], [['quả', 50]], ['trung', 'trung luoc', 'egg']),
  f('long_trang_trung', 'Lòng trắng trứng', 'dam', [52, 10.9, 0.7, 0.2, 0], [['quả', 33]], ['long trang', 'egg white']),
  f('trung_vit', 'Trứng vịt luộc', 'dam', [184, 13, 1, 14.2, 0], [['quả', 60]], ['trung vit']),
  f('trung_vit_lon', 'Trứng vịt lộn', 'dam', [182, 13.6, 4, 12.4, 0], [['quả', 70]], ['hot vit lon', 'trung vit lon']),
  f('trung_cut', 'Trứng cút', 'dam', [158, 13, 0.4, 11.1, 0], [['quả', 10]], ['trung cut luoc']),
  f('dau_phu', 'Đậu phụ', 'dam', [95, 10.9, 0.7, 5.4, 0.4], [['bìa', 120], ['miếng', 60]], ['dau hu', 'tofu', 'dau phu trang']),
  f('dau_phu_ran', 'Đậu phụ rán', 'dam', [200, 13, 4, 14.7, 1], [['miếng', 60]], ['dau ran', 'dau hu chien']),
  f('ca_ngu_hop', 'Cá ngừ ngâm nước (hộp)', 'dam', [116, 26, 0, 1, 0], [['hộp', 140]], ['ca ngu', 'tuna']),

  /* ------------------------------------------------------------------ */
  /* Rau & Canh                                                           */
  /* ------------------------------------------------------------------ */
  f('rau_muong_xao', 'Rau muống xào tỏi', 'rau_canh', [85, 3, 4.5, 6.2, 2], [['đĩa', 200]], ['rau muong xao', 'rau muong']),
  f('rau_muong_luoc', 'Rau muống luộc', 'rau_canh', [25, 3.2, 2.1, 0.4, 1], [['đĩa', 200]]),
  f('cai_xao', 'Cải xào', 'rau_canh', [70, 2.5, 5, 4.5, 2], [['đĩa', 200]], ['rau cai xao', 'cai thia xao', 'cai ngot xao']),
  f('bong_cai_luoc', 'Súp lơ xanh luộc', 'rau_canh', [40, 2.8, 7, 0.4, 3.3], [['đĩa', 150]], ['bong cai xanh', 'broccoli', 'sup lo']),
  f('dau_que_xao', 'Đậu que xào', 'rau_canh', [70, 2.5, 6, 4.2, 2.5], [['đĩa', 150]], ['dau co ve xao', 'dau que']),
  f('ca_tim_xao', 'Cà tím xào', 'rau_canh', [90, 1.5, 7, 6.4, 2.5], [['đĩa', 200]], ['ca tim', 'ca tim nuong mo hanh']),
  f('gia_xao', 'Giá đỗ xào', 'rau_canh', [60, 3, 5, 3.2, 1.5], [['đĩa', 150]], ['gia xao']),
  f('muop_xao', 'Mướp xào', 'rau_canh', [55, 1.5, 4, 3.7, 0.8], [['đĩa', 200]]),
  f('su_su_luoc', 'Su su luộc', 'rau_canh', [18, 0.8, 3.7, 0.1, 1], [['đĩa', 150]], ['su su']),
  f('salad', 'Salad rau trộn dầu giấm', 'rau_canh', [70, 1.5, 5, 5, 1.8], [['đĩa', 150]], ['salad', 'xa lach tron', 'rau tron']),
  f('goi_du_du', 'Nộm đu đủ', 'rau_canh', [90, 3, 12, 3.4, 2], [['đĩa', 150]], ['nom', 'goi du du', 'nom du du kho bo']),
  f('goi_ga', 'Gỏi gà bắp cải', 'rau_canh', [110, 9, 7, 5.1, 2], [['đĩa', 200]], ['goi ga', 'nom ga']),
  f('canh_chua', 'Canh chua cá', 'rau_canh', [40, 3.5, 4.5, 0.9, 0.8], [['bát', 350]], ['canh chua']),
  f('canh_rau_ngot', 'Canh rau ngót thịt băm', 'rau_canh', [32, 2.8, 1.8, 1.5, 0.8], [['bát', 300]], ['canh rau ngot', 'canh rau']),
  f('canh_bi', 'Canh bí nấu tôm', 'rau_canh', [25, 2, 3, 0.6, 0.6], [['bát', 300]], ['canh bi dao', 'canh bi xanh']),
  f('canh_cua', 'Canh cua rau đay', 'rau_canh', [30, 2.5, 2.5, 1.1, 1], [['bát', 300]], ['canh cua']),
  f('canh_trung_ca_chua', 'Canh trứng cà chua', 'rau_canh', [45, 3, 3.5, 2.2, 0.6], [['bát', 300]], ['canh ca chua']),
  f('canh_xuong', 'Canh xương hầm củ quả', 'rau_canh', [45, 3, 4, 1.9, 0.8], [['bát', 350]], ['canh suon', 'canh xuong']),
  f('dua_cai', 'Dưa cải muối', 'rau_canh', [18, 1.5, 2.6, 0.2, 2], [['đĩa', 50]], ['dua chua', 'dua muoi']),
  f('dua_chuot', 'Dưa chuột', 'rau_canh', [15, 0.8, 3, 0.1, 0.7], [['quả', 150]], ['dua leo', 'cucumber']),
  f('ca_chua', 'Cà chua', 'rau_canh', [20, 0.6, 4.2, 0.2, 0.8], [['quả', 100]], ['tomato']),
  f('ca_rot', 'Cà rốt', 'rau_canh', [38, 1.5, 8, 0.2, 1.2], [['củ', 100]], ['carrot']),

  /* ------------------------------------------------------------------ */
  /* Trái cây (phần ăn được)                                              */
  /* ------------------------------------------------------------------ */
  f('chuoi', 'Chuối', 'trai_cay', [97, 1.5, 22.2, 0.2, 0.8], [['quả', 100], ['quả nhỏ', 60]], ['chuoi tieu', 'chuoi tay', 'banana']),
  f('tao', 'Táo', 'trai_cay', [52, 0.3, 13.8, 0.2, 2.4], [['quả', 180]], ['tao tay', 'apple']),
  f('cam', 'Cam', 'trai_cay', [47, 0.9, 11.8, 0.1, 2.4], [['quả', 150]], ['orange']),
  f('buoi', 'Bưởi', 'trai_cay', [38, 0.8, 9.6, 0.1, 1], [['múi', 30], ['phần', 150]], ['grapefruit']),
  f('xoai', 'Xoài chín', 'trai_cay', [65, 0.6, 15, 0.3, 1.6], [['quả', 200], ['nửa quả', 100]], ['xoai', 'mango']),
  f('du_du', 'Đu đủ chín', 'trai_cay', [39, 0.6, 9.8, 0.1, 1.7], [['miếng', 150]], ['du du', 'papaya']),
  f('dua_hau', 'Dưa hấu', 'trai_cay', [32, 0.6, 7.6, 0.2, 0.4], [['miếng', 200]], ['watermelon']),
  f('thanh_long', 'Thanh long', 'trai_cay', [60, 1.2, 13, 0.4, 3], [['quả', 300], ['nửa quả', 150]], ['dragon fruit']),
  f('nho', 'Nho', 'trai_cay', [69, 0.7, 18, 0.2, 0.9], [['chùm', 100], ['quả', 5]], ['grape']),
  f('dua', 'Dứa', 'trai_cay', [50, 0.5, 13, 0.1, 1.4], [['miếng', 100]], ['thom', 'khom', 'pineapple']),
  f('oi', 'Ổi', 'trai_cay', [68, 2.6, 14, 1, 5.4], [['quả', 150]], ['guava']),
  f('sau_rieng', 'Sầu riêng', 'trai_cay', [147, 2.5, 27, 5.3, 3.8], [['múi', 50]], ['durian']),
  f('mit', 'Mít', 'trai_cay', [95, 1.7, 23, 0.6, 1.5], [['múi', 20]], ['jackfruit']),
  f('chom_chom', 'Chôm chôm', 'trai_cay', [82, 0.7, 21, 0.2, 0.9], [['quả', 20]], ['rambutan']),
  f('nhan', 'Nhãn', 'trai_cay', [60, 1.3, 15, 0.1, 1.1], [['quả', 8], ['chùm', 100]], ['longan']),
  f('vai', 'Vải', 'trai_cay', [66, 0.8, 16.5, 0.4, 1.3], [['quả', 15]], ['lychee', 'vai thieu']),
  f('mang_cut', 'Măng cụt', 'trai_cay', [73, 0.4, 18, 0.6, 1.8], [['quả', 30]], ['mangosteen']),
  f('le', 'Lê', 'trai_cay', [57, 0.4, 15, 0.1, 3.1], [['quả', 180]], ['pear']),
  f('kiwi', 'Kiwi', 'trai_cay', [61, 1.1, 14.7, 0.5, 3], [['quả', 75]]),
  f('bo_qua', 'Bơ (quả)', 'trai_cay', [160, 2, 8.5, 14.7, 6.7], [['nửa quả', 75], ['quả', 150]], ['qua bo', 'avocado', 'bo sap']),
  f('quyt', 'Quýt', 'trai_cay', [53, 0.8, 13.3, 0.3, 1.8], [['quả', 80]], ['tangerine']),
  f('hong', 'Hồng chín', 'trai_cay', [70, 0.6, 18.6, 0.2, 3.6], [['quả', 150]], ['qua hong', 'persimmon']),
  f('dau_tay', 'Dâu tây', 'trai_cay', [32, 0.7, 7.7, 0.3, 2], [['hộp', 250], ['quả', 12]], ['strawberry']),
  f('man', 'Mận', 'trai_cay', [46, 0.7, 11.4, 0.3, 1.4], [['quả', 60]], ['man hau', 'roi', 'plum']),
  f('na', 'Na (mãng cầu)', 'trai_cay', [94, 2.1, 23.6, 0.3, 4.4], [['quả', 150]], ['mang cau', 'custard apple']),

  /* ------------------------------------------------------------------ */
  /* Đồ uống (1 ml ≈ 1 g)                                                 */
  /* ------------------------------------------------------------------ */
  f('ca_phe_sua_da', 'Cà phê sữa đá', 'do_uong', [60, 1.2, 10.5, 1.5, 0], [['ly', 220], ['ml', 1]], ['cafe sua', 'ca phe sua', 'cf sua da', 'cafe sua da', 'nau da']),
  f('ca_phe_den_duong', 'Cà phê đen đá (có đường)', 'do_uong', [25, 0.2, 6, 0, 0], [['ly', 200], ['ml', 1]], ['cafe den', 'ca phe den', 'cf den']),
  f('ca_phe_den_khong_duong', 'Cà phê đen không đường', 'do_uong', [2, 0.3, 0, 0, 0], [['ly', 200], ['ml', 1]], ['americano', 'espresso', 'cafe khong duong']),
  f('bac_xiu', 'Bạc xỉu', 'do_uong', [70, 1.8, 11, 2.1, 0], [['ly', 250], ['ml', 1]], ['bac siu', 'bac xiu da']),
  f('ca_phe_muoi', 'Cà phê muối', 'do_uong', [85, 1.5, 11, 3.9, 0], [['ly', 250], ['ml', 1]], ['cafe muoi']),
  f('ca_phe_trung', 'Cà phê trứng', 'do_uong', [150, 4, 18, 6.8, 0], [['ly', 150], ['ml', 1]], ['cafe trung']),
  f('latte', 'Latte / Cappuccino', 'do_uong', [55, 3, 4.6, 2.8, 0], [['ly', 350], ['ml', 1]], ['cappuccino', 'cafe latte', 'flat white']),
  f('tra_sua', 'Trà sữa trân châu', 'do_uong', [90, 0.9, 16, 2.6, 0.2], [['ly M', 500], ['ly L', 700], ['ml', 1]], ['tra sua', 'tra sua tran chau', 'milk tea', 'bubble tea']),
  f('matcha_latte', 'Matcha latte', 'do_uong', [75, 2.8, 10, 2.6, 0.3], [['ly', 350], ['ml', 1]], ['tra xanh sua', 'matcha']),
  f('tra_da', 'Trà đá / trà không đường', 'do_uong', [1, 0, 0.2, 0, 0], [['cốc', 300], ['ml', 1]], ['tra da', 'tra xanh', 'tra']),
  f('tra_chanh', 'Trà chanh', 'do_uong', [40, 0, 10, 0, 0], [['cốc', 400], ['ml', 1]]),
  f('tra_dao', 'Trà đào cam sả', 'do_uong', [45, 0.1, 11, 0, 0.2], [['ly', 400], ['ml', 1]], ['tra dao']),
  f('nuoc_mia', 'Nước mía', 'do_uong', [65, 0.2, 16, 0.1, 0], [['cốc', 300], ['ml', 1]]),
  f('nuoc_cam', 'Nước cam vắt', 'do_uong', [45, 0.7, 10.4, 0.2, 0.2], [['cốc', 250], ['ml', 1]], ['nuoc cam', 'orange juice']),
  f('sinh_to_bo', 'Sinh tố bơ', 'do_uong', [110, 1.8, 13, 5.7, 2], [['ly', 350], ['ml', 1]], ['sinh to']),
  f('sinh_to_xoai', 'Sinh tố xoài', 'do_uong', [80, 1, 17, 0.9, 0.8], [['ly', 350], ['ml', 1]]),
  f('nuoc_dua', 'Nước dừa', 'do_uong', [19, 0.7, 3.7, 0.2, 1.1], [['quả', 300], ['ml', 1]], ['dua tuoi', 'coconut water']),
  f('coca', 'Nước ngọt có ga', 'do_uong', [42, 0, 10.6, 0, 0], [['lon', 330], ['chai', 390], ['ml', 1]], ['coca', 'coca cola', 'pepsi', '7up', 'sprite', 'nuoc ngot', 'soda']),
  f('coca_zero', 'Nước ngọt không đường', 'do_uong', [0.3, 0, 0.1, 0, 0], [['lon', 330], ['ml', 1]], ['coca zero', 'pepsi zero', 'diet coke']),
  f('nuoc_tang_luc', 'Nước tăng lực', 'do_uong', [45, 0, 11, 0, 0], [['lon', 250], ['chai', 330], ['ml', 1]], ['red bull', 'sting', 'bo huc', 'number 1']),
  f('sua_dau_nanh', 'Sữa đậu nành', 'do_uong', [45, 3, 4.5, 1.6, 0.4], [['cốc', 250], ['hộp', 200], ['ml', 1]], ['sua dau', 'soy milk', 'vinasoy']),
  f('bia', 'Bia', 'do_uong', [43, 0.5, 3.6, 0, 0], [['lon', 330], ['cốc', 250], ['chai', 450], ['ml', 1]], ['beer', 'bia hoi', 'bia lon']),
  f('ruou_vang', 'Rượu vang', 'do_uong', [85, 0.1, 2.6, 0, 0], [['ly', 150], ['ml', 1]], ['wine', 'vang do']),

  /* ------------------------------------------------------------------ */
  /* Sữa & chế phẩm                                                        */
  /* ------------------------------------------------------------------ */
  f('sua_tuoi_co_duong', 'Sữa tươi có đường', 'sua', [78, 3, 9.6, 3.1, 0], [['hộp', 180], ['cốc', 220], ['ml', 1]], ['sua tuoi', 'sua hop', 'vinamilk', 'th true milk']),
  f('sua_tuoi_khong_duong', 'Sữa tươi không đường', 'sua', [63, 3.1, 4.8, 3.5, 0], [['hộp', 180], ['cốc', 220], ['ml', 1]], ['sua khong duong', 'milk']),
  f('sua_tach_beo', 'Sữa tách béo', 'sua', [35, 3.4, 5, 0.1, 0], [['cốc', 250], ['ml', 1]], ['sua gay', 'skim milk']),
  f('sua_chua', 'Sữa chua có đường', 'sua', [99, 3.2, 15.5, 2.7, 0], [['hộp', 100]], ['sua chua', 'yaourt', 'yogurt', 'da ua']),
  f('sua_chua_khong_duong', 'Sữa chua không đường', 'sua', [65, 3.6, 5.2, 3.3, 0], [['hộp', 100]], ['sua chua khong duong']),
  f('sua_chua_hy_lap', 'Sữa chua Hy Lạp', 'sua', [59, 10, 3.6, 0.4, 0], [['hũ', 100], ['cốc', 170]], ['greek yogurt']),
  f('sua_chua_uong', 'Sữa chua uống', 'sua', [70, 2.6, 12, 1.2, 0], [['chai', 65], ['hộp', 180]], ['probi', 'yakult']),
  f('sua_dac', 'Sữa đặc', 'sua', [336, 8.1, 56.8, 8.8, 0], [['thìa', 15]], ['sua dac co duong', 'ong tho']),
  f('pho_mai', 'Phô mai', 'sua', [330, 20, 4, 26, 0], [['lát', 17], ['miếng', 15]], ['pho mai', 'cheese', 'pho mai lat', 'cheddar']),
  f('pho_mai_bo_cuoi', 'Phô mai con bò cười', 'sua', [245, 10, 6, 20, 0], [['miếng', 17]], ['con bo cuoi', 'pho mai tam giac', 'la vache qui rit']),
  f('whey', 'Whey protein', 'sua', [400, 78, 8, 6, 0], [['muỗng', 30]], ['whey', 'bot protein', 'protein']),

  /* ------------------------------------------------------------------ */
  /* Các loại hạt                                                          */
  /* ------------------------------------------------------------------ */
  f('lac_rang', 'Lạc rang', 'hat', [585, 25, 18, 49.5, 8], [['nắm', 30], ['thìa', 10]], ['dau phong', 'lac', 'peanut']),
  f('hanh_nhan', 'Hạnh nhân', 'hat', [579, 21, 22, 50, 12.5], [['nắm', 28]], ['almond']),
  f('hat_dieu', 'Hạt điều', 'hat', [574, 18, 30, 46, 3.3], [['nắm', 28]], ['cashew']),
  f('oc_cho', 'Óc chó', 'hat', [654, 15, 14, 65, 6.7], [['nắm', 28]], ['walnut', 'hat oc cho']),
  f('hat_huong_duong', 'Hạt hướng dương', 'hat', [584, 21, 20, 51, 8.6], [['nắm', 30]], ['huong duong']),
  f('hat_chia', 'Hạt chia', 'hat', [486, 17, 42, 31, 34], [['thìa', 12]], ['chia']),
  f('bo_dau_phong', 'Bơ đậu phộng', 'hat', [588, 25, 20, 50, 6], [['thìa', 16]], ['peanut butter', 'bo lac']),
  f('dau_xanh', 'Đậu xanh nấu chín', 'hat', [105, 7, 19, 0.4, 7.6], [['chén', 100]], ['do xanh']),

  /* ------------------------------------------------------------------ */
  /* Chè & Tráng miệng                                                     */
  /* ------------------------------------------------------------------ */
  f('che_dau_xanh', 'Chè đậu xanh', 'trang_mieng', [115, 3, 23, 1.3, 1.5], [['cốc', 300]], ['che', 'che do xanh']),
  f('che_thai', 'Chè Thái', 'trang_mieng', [140, 1, 22, 5.4, 1], [['ly', 350]]),
  f('che_ba_mau', 'Chè ba màu', 'trang_mieng', [130, 2.5, 25, 2.2, 1.5], [['ly', 350]]),
  f('che_buoi', 'Chè bưởi', 'trang_mieng', [120, 1.2, 22, 3.1, 0.8], [['chén', 250]]),
  f('che_khuc_bach', 'Chè khúc bạch', 'trang_mieng', [150, 3, 20, 6.4, 0.2], [['ly', 250]]),
  f('che_troi_nuoc', 'Chè trôi nước', 'trang_mieng', [200, 3, 36, 4.9, 1], [['chén', 200]], ['banh troi', 'banh chay']),
  f('tao_pho', 'Tào phớ', 'trang_mieng', [70, 3, 12, 1.2, 0.2], [['bát', 300]], ['tau hu', 'dau hu nuoc duong']),
  f('banh_flan', 'Bánh flan', 'trang_mieng', [140, 4.5, 20, 4.7, 0], [['cái', 70]], ['caramen', 'flan', 'kem caramen']),
  f('kem', 'Kem', 'trang_mieng', [207, 3.5, 24, 11, 0.7], [['que', 60], ['ốc quế', 90], ['viên', 50]], ['ice cream', 'kem que', 'kem oc que']),
  f('sua_chua_nep_cam', 'Sữa chua nếp cẩm', 'trang_mieng', [150, 3.5, 27, 3.1, 0.5], [['hũ', 150]]),
  f('banh_bong_lan', 'Bánh bông lan', 'trang_mieng', [330, 6.5, 52, 10.6, 0.8], [['miếng', 50]], ['sponge cake', 'banh bong lan trung muoi']),
  f('banh_su_kem', 'Bánh su kem', 'trang_mieng', [260, 5, 25, 15.6, 0.5], [['cái', 30]], ['choux']),
  f('banh_kem', 'Bánh kem', 'trang_mieng', [370, 4, 50, 17.1, 0.8], [['miếng', 80]], ['banh sinh nhat', 'cake', 'banh gato']),
  f('socola_den', 'Sô-cô-la đen 70%', 'trang_mieng', [598, 7.8, 46, 43, 11], [['miếng', 10], ['thanh', 100]], ['socola', 'chocolate', 'so co la']),

  /* ------------------------------------------------------------------ */
  /* Đồ ăn nhanh                                                          */
  /* ------------------------------------------------------------------ */
  f('burger_bo', 'Burger bò', 'fast_food', [254, 13, 30, 9.4, 1.3], [['cái', 110], ['cái lớn', 220]], ['hamburger', 'burger', 'big mac']),
  f('burger_ga', 'Burger gà', 'fast_food', [260, 12, 28, 11.1, 1.3], [['cái', 180]], ['chicken burger']),
  f('khoai_tay_chien', 'Khoai tây chiên', 'fast_food', [312, 3.4, 41, 15, 3.8], [['phần vừa', 115], ['phần nhỏ', 75], ['phần lớn', 150]], ['french fries', 'khoai chien']),
  f('pizza', 'Pizza', 'fast_food', [266, 11, 33, 10, 2.3], [['miếng', 107]], ['pizza pho mai']),
  f('my_y', 'Mỳ Ý sốt bò bằm', 'fast_food', [150, 7, 19, 5.1, 1.5], [['đĩa', 350]], ['mi y', 'spaghetti bolognese', 'my y']),
  f('sandwich_ga', 'Sandwich gà', 'fast_food', [230, 13, 25, 8.4, 2], [['cái', 180]], ['sandwich ga', 'banh mi kep ga']),
  f('sushi', 'Sushi', 'fast_food', [150, 6, 28, 1.4, 0.5], [['miếng', 30], ['đĩa', 240]], ['sushi ca hoi', 'nigiri']),
  f('tokbokki', 'Tokbokki', 'fast_food', [150, 3, 33, 0.8, 0.8], [['phần', 250]], ['tteokbokki', 'banh gao cay']),
  f('ga_vien', 'Gà viên chiên', 'fast_food', [296, 15, 16, 19, 1], [['phần', 100], ['viên', 18]], ['nuggets', 'chicken nuggets']),

  /* ------------------------------------------------------------------ */
  /* Đóng gói & Ăn vặt                                                     */
  /* ------------------------------------------------------------------ */
  f('mi_goi', 'Mì gói (mì ăn liền)', 'dong_goi', [466, 8.5, 62, 20.5, 2], [['gói', 75]], ['mi tom', 'hao hao', 'mi an lien', 'omachi']),
  f('banh_quy', 'Bánh quy', 'dong_goi', [480, 7, 68, 20, 2], [['cái', 10], ['gói', 30]], ['cookie', 'cosy', 'banh quy bo']),
  f('snack_khoai_tay', 'Snack khoai tây', 'dong_goi', [536, 7, 53, 33, 4.4], [['gói', 52], ['gói nhỏ', 30]], ['snack', 'lays', 'poca', 'oishi']),
  f('ngu_coc', 'Ngũ cốc ăn sáng (granola)', 'dong_goi', [470, 10, 64, 19.5, 6], [['bát', 50]], ['granola', 'ngu coc', 'cereal']),
  f('banh_gao', 'Bánh gạo', 'dong_goi', [420, 6.5, 80, 8.2, 1], [['gói', 20]], ['one one', 'banh gao one one']),
  f('ca_moi_hop', 'Cá mòi sốt cà (hộp)', 'dong_goi', [165, 18, 3, 9, 0.5], [['hộp', 155]], ['ca moi', 'sardine']),
  f('thanh_protein', 'Thanh protein', 'dong_goi', [380, 30, 40, 11.3, 8], [['thanh', 60]], ['protein bar']),
  f('choco_pie', 'Bánh Chocopie', 'dong_goi', [433, 4.5, 64, 17.6, 1.5], [['cái', 33]], ['chocopie', 'custas']),
  f('cha_ca_chien', 'Chả cá chiên', 'dong_goi', [185, 15, 11, 9, 0], [['miếng', 40]], ['cha ca vien', 'ca vien chien']),
  f('ruoc', 'Ruốc (chà bông)', 'dong_goi', [400, 45, 10, 20, 0], [['thìa', 10]], ['cha bong', 'ruoc thit']),
  f('bong_ngo', 'Bỏng ngô', 'dong_goi', [450, 9, 63, 18, 10], [['túi', 50]], ['popcorn', 'bap rang bo']),
  f('kho_bo', 'Khô bò', 'dong_goi', [330, 45, 15, 10, 1], [['gói', 50]], ['beef jerky', 'kho ga']),

  /* ------------------------------------------------------------------ */
  /* Dầu & Gia vị                                                          */
  /* ------------------------------------------------------------------ */
  f('dau_an', 'Dầu ăn', 'gia_vi', [900, 0, 0, 100, 0], [['thìa canh', 13], ['thìa cà phê', 5]], ['dau', 'mo', 'oil']),
  f('duong', 'Đường', 'gia_vi', [397, 0, 99.3, 0, 0], [['thìa cà phê', 5], ['viên', 4]], ['sugar']),
  f('mat_ong', 'Mật ong', 'gia_vi', [304, 0.3, 82, 0, 0.2], [['thìa', 20]], ['honey']),
  f('nuoc_mam', 'Nước mắm', 'gia_vi', [35, 5.1, 3.6, 0, 0], [['thìa', 15]], ['fish sauce']),
  f('mayonnaise', 'Sốt mayonnaise', 'gia_vi', [680, 1, 0.6, 75, 0], [['thìa', 14]], ['mayo', 'mayonaise']),
  f('bo_lat', 'Bơ lạt', 'gia_vi', [717, 0.9, 0.1, 81, 0], [['thìa', 14]], ['butter', 'bo dong vat']),
];

/** id → food */
export const FOOD_BY_ID: Record<string, FoodItem> = Object.fromEntries(FOODS.map((x) => [x.id, x]));

/** Shown when the search box is empty (most-logged Vietnamese foods). */
export const POPULAR_FOOD_IDS = [
  'com_trang',
  'pho_bo',
  'banh_mi_thit',
  'trung_ga',
  'uc_ga',
  'bun_cha',
  'com_tam_suon',
  'ca_phe_sua_da',
  'chuoi',
  'xoi_xeo',
  'rau_muong_xao',
  'tra_sua',
  'bun_bo_hue',
  'goi_cuon',
  'khoai_lang',
  'sua_tuoi_khong_duong',
];
