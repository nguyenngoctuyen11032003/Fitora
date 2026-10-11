import { Check, ChefHat, PenLine, Plus, ScanLine, Search, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button, EmptyState, GlassButton, Input, ScreenHeader, Segmented, Skeleton, useToast } from '@/components/ui';
import { FOOD_BY_ID, FOOD_CATEGORY_LABELS, FOODS, POPULAR_FOOD_IDS } from '@/data/foods';
import { addDays, formatDayVi, isISODate, todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync, useDebounced } from '@/lib/hooks';
import { deleteCustomFood, listCustomFoods } from '@/services/foods';
import { listMealsRange } from '@/services/meals';
import { MEAL_LABELS, MEAL_TYPES, type CustomFood, type MealType } from '@/types/db';
import { CustomFoodSheet } from './components/CustomFoodSheet';
import { FoodSheet } from './components/FoodSheet';
import { QuickAddSheet } from './components/QuickAddSheet';
import {
  computePortion,
  frequencyByKey,
  fromCustomFood,
  fromDbFood,
  guessMeal,
  highlightParts,
  MEAL_SHORT,
  parseMeal,
  recentFoods,
  searchFoods,
  type FoodOption,
} from './lib';

type Tab = 'recent' | 'popular' | 'mine';

const DB_OPTIONS: FoodOption[] = FOODS.map(fromDbFood);
const POPULAR: FoodOption[] = POPULAR_FOOD_IDS.map((id) => FOOD_BY_ID[id]).filter(Boolean).map(fromDbFood);

export default function FoodSearchPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayISO();
  const asked = params.get('date');
  const date = isISODate(asked) && asked < today ? asked : today;
  const [meal, setMeal] = useState<MealType>(() => parseMeal(params.get('meal')) ?? (date === today ? guessMeal() : 'snack'));
  const diaryHref = date === today ? '/diary' : `/diary?date=${date}`;

  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 150);
  const [tab, setTab] = useState<Tab>('recent');
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useAsync(() => listMealsRange(addDays(today, -60), today), [today]);
  const customs = useAsync(() => listCustomFoods(), []);
  useEffect(() => {
    const err = history.error ?? customs.error;
    if (err) toast.error(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.error, customs.error]);

  const customOptions = useMemo(() => (customs.data ?? []).map(fromCustomFood), [customs.data]);
  const recent = useMemo(() => recentFoods(history.data ?? [], FOODS, customs.data ?? [], 20), [history.data, customs.data]);
  const recentByKey = useMemo(() => new Map(recent.map((r) => [r.option.key, r])), [recent]);
  const customById = useMemo(() => new Map((customs.data ?? []).map((c) => [c.id, c])), [customs.data]);
  // Recent / personalised options first (searchFoods keeps the first option per key).
  const searchPool = useMemo(() => [...recent.map((r) => r.option), ...customOptions, ...DB_OPTIONS], [recent, customOptions]);
  const searchOpts = useMemo(() => ({ recentKeys: recent.map((r) => r.option.key), frequency: frequencyByKey(recent) }), [recent]);
  const results = useMemo(() => (q ? searchFoods(q, searchPool, searchOpts) : []), [q, searchPool, searchOpts]);
  // Empty "Gần đây" tab on a new account → start on "Phổ biến".
  useEffect(() => {
    if (!history.loading && recent.length === 0) setTab((t) => (t === 'recent' ? 'popular' : t));
  }, [history.loading, recent.length]);

  // ---- sheets ---------------------------------------------------------------
  const [picked, setPicked] = useState<FoodOption | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [added, setAdded] = useState(0);
  const initial = picked ? recentByKey.get(picked.key) : undefined;

  const onAdded = () => setAdded((n) => n + 1);

  const removeCustom = async (food: CustomFood) => {
    customs.setData((list) => list?.filter((x) => x.id !== food.id));
    try {
      await deleteCustomFood(food.id);
      notifyDataChanged('foods');
      toast.success(`Đã xóa “${food.name}”.`);
    } catch (e) {
      customs.setData((list) => (list ? [...list, food].sort((a, b) => a.name.localeCompare(b.name, 'vi')) : list));
      toast.error(e);
    }
  };

  // Foods the user logged before keep their own portion size (their "đĩa"), whichever tab shows them.
  const list: FoodOption[] = useMemo(() => {
    if (q) return results;
    if (tab === 'recent') return recent.map((r) => r.option);
    return (tab === 'popular' ? POPULAR : customOptions).map((o) => recentByKey.get(o.key)?.option ?? o);
  }, [q, results, tab, recent, customOptions, recentByKey]);
  const pick = useCallback((o: FoodOption) => setPicked(o), []);
  // Enter in the search box opens the best match for what is typed now (no debounce wait).
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const now = query.trim();
    if (!now) return;
    e.preventDefault();
    const top = now === q ? results[0] : searchFoods(now, searchPool, { ...searchOpts, limit: 1 })[0];
    if (top) setPicked(top);
    else setQuickOpen(true);
  };
  const listLoading = !q && ((tab === 'recent' && history.loading) || (tab === 'mine' && customs.loading));

  return (
    <Page
      topBar={false}
      label="Tìm món"
      footer={
        added > 0 ? (
          <Button block size="lg" icon={<Check className="h-5 w-5" />} onClick={() => navigate(diaryHref)}>
            Xong · đã thêm {added} món
          </Button>
        ) : undefined
      }
    >
      <ScreenHeader back={diaryHref} eyebrow={`${MEAL_LABELS[meal]} · ${formatDayVi(date)}`} title="Thêm món" size="md" />

      <div className="mt-4 flex flex-col gap-3">
        <Input
          ref={inputRef}
          type="search"
          aria-label="Tìm món ăn"
          placeholder="Tìm phở, cơm tấm, trứng…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          icon={<Search className="h-5 w-5" />}
          trailing={
            query ? (
              <button
                type="button"
                aria-label="Xóa tìm kiếm"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="grid h-11 w-11 place-items-center rounded-full text-muted hover:text-text"
              >
                <X className="h-5 w-5" />
              </button>
            ) : undefined
          }
          autoComplete="off"
          enterKeyHint="search"
          autoFocus
        />
        <Segmented<MealType> ariaLabel="Thêm vào bữa" size="sm" value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_SHORT[m] }))} />
      </div>

      {/* Shortcuts */}
      <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5">
        <Link to={`/scan?meal=${meal}&date=${date}`} className="glass inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-[14px] font-semibold text-text">
          <ScanLine className="h-4 w-4 text-gold" aria-hidden="true" />
          Scan ảnh
        </Link>
        <GlassButton variant="pill" onClick={() => setQuickOpen(true)} className="shrink-0">
          <PenLine className="h-4 w-4 text-gold" aria-hidden="true" />
          Nhập nhanh calo
        </GlassButton>
        <GlassButton variant="pill" onClick={() => setCustomOpen(true)} className="shrink-0">
          <ChefHat className="h-4 w-4 text-gold" aria-hidden="true" />
          Tạo món riêng
        </GlassButton>
      </div>

      {!q && (
        <Segmented<Tab>
          ariaLabel="Danh sách món"
          className="mt-5"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'recent', label: 'Gần đây' },
            { value: 'popular', label: 'Phổ biến' },
            { value: 'mine', label: 'Món của tôi' },
          ]}
        />
      )}

      <section aria-live="polite" aria-label={q ? `Kết quả cho ${q}` : 'Danh sách món'} className="mt-4">
        {q && results.length > 0 && <p className="mb-2 pl-1 text-[13px] text-muted">{results.length} kết quả</p>}

        {listLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : list.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {list.map((o) => {
              const r = recentByKey.get(o.key);
              const custom = o.origin === 'custom' && o.customFoodId ? customById.get(o.customFoodId) : undefined;
              return (
                <li key={o.key} className="flex items-center gap-1">
                  <FoodRow option={o} quantity={r?.quantity} unit={r?.unit} count={r?.count} highlight={q} onPick={pick} />
                  {custom && !q && tab === 'mine' && (
                    <GlassButton label={`Xóa ${custom.name}`} onClick={() => void removeCustom(custom)} className="shrink-0 text-muted">
                      <Trash2 className="h-4 w-4" />
                    </GlassButton>
                  )}
                </li>
              );
            })}
          </ul>
        ) : q ? (
          <EmptyState
            compact
            icon={Search}
            title={`Không thấy “${q}”`}
            description="Ghi nhanh bằng calo, hoặc tạo món riêng để lần sau tìm là có."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button icon={<PenLine className="h-4 w-4" />} onClick={() => setQuickOpen(true)}>
                  Nhập nhanh
                </Button>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCustomOpen(true)}>
                  Tạo món riêng
                </Button>
              </div>
            }
          />
        ) : tab === 'mine' ? (
          <EmptyState
            compact
            icon={ChefHat}
            title="Chưa có món riêng"
            description="Lưu món nhà làm hoặc sản phẩm đóng gói theo nhãn dinh dưỡng."
            action={
              <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCustomOpen(true)}>
                Tạo món riêng
              </Button>
            }
          />
        ) : (
          <EmptyState compact icon={Search} title="Chưa có món gần đây" description="Món bạn ghi sẽ hiện ở đây để thêm lại bằng một chạm." />
        )}
      </section>

      <FoodSheet
        open={!!picked}
        onClose={() => setPicked(null)}
        option={picked}
        date={date}
        meal={meal}
        initial={initial ? { quantity: initial.quantity, unit: initial.unit } : null}
        onSaved={(e) => {
          onAdded();
          history.setData((h) => (h ? [...h, e] : h));
        }}
      />
      <QuickAddSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        date={date}
        meal={meal}
        initialName={query.trim()}
        onSaved={(e) => {
          onAdded();
          history.setData((h) => (h ? [...h, e] : h));
        }}
      />
      <CustomFoodSheet
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        initialName={query.trim()}
        onCreated={(food) => {
          customs.setData((list) => [...(list ?? []), food].sort((a, b) => a.name.localeCompare(b.name, 'vi')));
          setPicked(fromCustomFood(food));
        }}
      />
    </Page>
  );
}

interface FoodRowProps {
  option: FoodOption;
  quantity?: number;
  unit?: string;
  /** Times logged recently (shown when ≥ 2). */
  count?: number;
  /** Query whose words are highlighted in the name. */
  highlight?: string;
  onPick: (o: FoodOption) => void;
}

/** Memoised: typing re-renders the page, but rows only change when the debounced results do. */
const FoodRow = memo(function FoodRow({ option, quantity, unit, count, highlight, onPick }: FoodRowProps) {
  const u = unit ?? option.defaultUnit;
  const qty = quantity ?? (u === 'g' || u === 'ml' ? 100 : 1);
  const kcal = computePortion(option, qty, u).kcal;
  const base = option.origin === 'custom' ? 'Món của tôi' : option.brand ?? (option.category ? FOOD_CATEGORY_LABELS[option.category] : 'Đã ghi trước đây');
  const tag = count && count >= 2 ? `${base} · đã ghi ${count} lần` : base;
  const parts = highlight ? highlightParts(option.name, highlight) : null;
  return (
    <button
      type="button"
      onClick={() => onPick(option)}
      className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-text">
          {parts
            ? parts.map((p, i) =>
                p.hit ? (
                  <mark key={i} className="bg-transparent text-gold">
                    {p.text}
                  </mark>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )
            : option.name}
        </span>
        <span className="block truncate text-[12px] text-muted">
          {tag} · {formatNumber(qty, 2)} {u}
        </span>
      </span>
      <span className="tabular shrink-0 text-[15px] font-bold text-text">
        {formatNumber(kcal)}
        <span className="ml-0.5 text-[11px] font-semibold text-muted">kcal</span>
      </span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold" aria-hidden="true">
        <Plus className="h-4 w-4" />
      </span>
    </button>
  );
});
