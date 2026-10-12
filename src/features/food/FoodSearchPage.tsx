import { Check, ChefHat, Pencil, PenLine, Plus, ScanLine, Search, Sparkles, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button, EmptyState, GlassButton, Input, ScreenHeader, Segmented, Skeleton, Spinner, useToast } from '@/components/ui';
import { FOOD_BY_ID, FOOD_CATEGORY_LABELS, FOODS, POPULAR_FOOD_IDS } from '@/data/foods';
import { addDays, formatDayVi, isISODate, todayISO } from '@/lib/date';
import { notifyDataChanged, onDataChanged } from '@/lib/events';
import { formatNumber } from '@/lib/format';
import { useAsync, useDebounced } from '@/lib/hooks';
import { compareByUse, deleteCustomFood, listCustomFoods, markCustomFoodUsed } from '@/services/foods';
import { listMealsRange } from '@/services/meals';
import { MEAL_LABELS, MEAL_TYPES, type CustomFood, type MealEntry, type MealTemplate, type MealType } from '@/types/db';
import { CustomFoodSheet } from './components/CustomFoodSheet';
import { FoodSheet } from './components/FoodSheet';
import { MealTemplatesSheet, TemplateDupDialog } from './components/MealTemplatesSheet';
import { FoodThumb, useMealPhotoUrls } from './components/parts';
import { QuickAddSheet } from './components/QuickAddSheet';
import {
  computePortion,
  defaultPortion,
  dishesSummary,
  frequencyByKey,
  fromCustomFood,
  fromDbFood,
  guessMeal,
  highlightParts,
  MEAL_SHORT,
  mealSuggestions,
  parseListTab,
  parseMeal,
  recentFoods,
  searchFoods,
  templatesForMeal,
  usageLabel,
  withDbAliases,
  type FoodListTab,
  type FoodOption,
} from './lib';
import { deferredDelete } from './undo';
import { useMealTemplates, useQuickLog, type LogCallbacks } from './useSmartLog';

type Tab = FoodListTab;

const DB_OPTIONS: FoodOption[] = FOODS.map(fromDbFood);
const POPULAR: FoodOption[] = POPULAR_FOOD_IDS.map((id) => FOOD_BY_ID[id]).filter(Boolean).map(fromDbFood);
const isWeight = (u: string) => u === 'g' || u === 'ml';

export default function FoodSearchPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const today = todayISO();
  const asked = params.get('date');
  const date = isISODate(asked) && asked < today ? asked : today;
  const [meal, setMeal] = useState<MealType>(() => parseMeal(params.get('meal')) ?? (date === today ? guessMeal() : 'snack'));
  const diaryHref = date === today ? '/diary' : `/diary?date=${date}`;
  const mealLower = MEAL_LABELS[meal].toLowerCase();

  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 150);
  // ?tab=mine|popular|suggest (Profile / Reports / menu "Món của tôi") picks the first tab; switching keeps it in the URL.
  const urlTab = parseListTab(params.get('tab'));
  const [tab, setTabState] = useState<Tab>(() => urlTab ?? 'suggest');
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      setParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set('tab', t);
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  const history = useAsync(() => listMealsRange(addDays(today, -60), today), [today]);
  const customs = useAsync(() => listCustomFoods(), []);
  const reloadCustoms = customs.reload;
  // A dish saved from a scan / another screen shows up without leaving the page.
  useEffect(() => onDataChanged((k) => (k === 'foods' || k === 'any') && void reloadCustoms()), [reloadCustoms]);
  const tpl = useMealTemplates();
  useEffect(() => {
    const err = history.error ?? customs.error;
    if (err) toast.error(err);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.error, customs.error]);

  // Saved foods being deleted (hidden until the undo window has passed).
  const [hiddenFoods, setHiddenFoods] = useState<ReadonlySet<string>>(new Set());
  const savedFoods = useMemo(() => (customs.data ?? []).filter((c) => !hiddenFoods.has(c.id)), [customs.data, hiddenFoods]);
  const customOptions = useMemo(() => savedFoods.map(fromCustomFood), [savedFoods]);
  const customById = useMemo(() => new Map(savedFoods.map((c) => [c.id, c])), [savedFoods]);
  const recentAll = useMemo(() => recentFoods(history.data ?? [], FOODS, savedFoods, 20), [history.data, savedFoods]);
  const recentByKey = useMemo(() => new Map(recentAll.map((r) => [r.option.key, r])), [recentAll]);
  const suggestions = useMemo(
    () => mealSuggestions({ entries: history.data ?? [], customs: savedFoods, foods: FOODS, meal, date, limit: 6 }),
    [history.data, savedFoods, meal, date],
  );
  const suggestedKeys = useMemo(() => new Set(suggestions.map((s) => s.option.key)), [suggestions]);
  const recent = useMemo(() => recentAll.filter((r) => !suggestedKeys.has(r.option.key)).slice(0, 12), [recentAll, suggestedKeys]);
  const mealTemplates = useMemo(() => templatesForMeal(tpl.templates, meal, 3), [tpl.templates, meal]);

  // Recent / personalised options first (searchFoods keeps the first option per key).
  // Saved foods named like a database dish also answer to its aliases (theirs ranks first).
  const searchPool = useMemo(
    () => [...recentAll.map((r) => r.option), ...customOptions, ...DB_OPTIONS].map((o) => withDbAliases(o, FOODS)),
    [recentAll, customOptions],
  );
  const searchOpts = useMemo(() => ({ recentKeys: recentAll.map((r) => r.option.key), frequency: frequencyByKey(recentAll) }), [recentAll]);
  const results = useMemo(() => (q ? searchFoods(q, searchPool, searchOpts) : []), [q, searchPool, searchOpts]);

  // Brand-new account (nothing to suggest yet) → start on "Phổ biến".
  const personalLoading = history.loading || customs.loading || tpl.loading;
  const nothingPersonal = !personalLoading && !suggestions.length && !recent.length && !mealTemplates.length;
  const autoSwitched = useRef(urlTab !== null); // an explicit ?tab wins
  // The menu / Profile "Món của tôi" link while this page is already open only changes the URL.
  useEffect(() => {
    if (!urlTab) return;
    autoSwitched.current = true;
    setTabState(urlTab);
  }, [urlTab]);
  useEffect(() => {
    if (nothingPersonal && !autoSwitched.current) {
      autoSwitched.current = true;
      setTabState((t) => (t === 'suggest' ? (savedFoods.length || tpl.templates.length ? 'mine' : 'popular') : t));
    }
  }, [nothingPersonal, savedFoods.length, tpl.templates.length]);

  // ---- sheets ---------------------------------------------------------------
  const [picked, setPicked] = useState<{ option: FoodOption; quantity: number; unit: string } | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [customSheet, setCustomSheet] = useState<{ food: CustomFood | null } | null>(null);
  // ?templates=1 → open the Bữa mẫu sheet straight away.
  const [templatesOpen, setTemplatesOpen] = useState(() => !!params.get('templates'));
  const [added, setAdded] = useState(0);

  const onFoodUsed = useCallback(
    (f: CustomFood) => customs.setData((list) => (list ? [...list.filter((x) => x.id !== f.id), f].sort(compareByUse) : list)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const logCb: LogCallbacks = useMemo(
    () => ({
      onAdded: (rows: MealEntry[]) => {
        setAdded((n) => n + rows.length);
        history.setData((h) => (h ? [...h, ...rows] : h));
      },
      onRemoved: (ids: string[]) => {
        setAdded((n) => Math.max(0, n - ids.length));
        const gone = new Set(ids);
        history.setData((h) => h?.filter((r) => !gone.has(r.id)));
      },
      onFoodUsed,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFoodUsed],
  );

  const quickLog = useQuickLog();
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const quickGuard = useRef(false);
  const onQuick = useCallback(
    async (o: FoodOption, quantity: number, unit: string) => {
      if (quickGuard.current) return;
      quickGuard.current = true;
      setQuickBusy(o.key);
      try {
        await quickLog(o, { quantity, unit }, date, meal, logCb);
      } finally {
        quickGuard.current = false;
        setQuickBusy(null);
      }
    },
    [quickLog, date, meal, logCb],
  );

  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const logTemplate = useCallback(
    async (t: MealTemplate, at: MealType = meal) => {
      if (templateBusy) return false;
      setTemplateBusy(t.id);
      const rows = await tpl.log(t, date, at, logCb);
      setTemplateBusy(null);
      return !!rows;
    },
    [templateBusy, tpl, date, meal, logCb],
  );

  const removeCustom = (food: CustomFood) => {
    setCustomSheet(null);
    setHiddenFoods((s) => new Set(s).add(food.id));
    const unhide = () =>
      setHiddenFoods((s) => {
        const n = new Set(s);
        n.delete(food.id);
        return n;
      });
    deferredDelete({
      toast,
      message: `Đã xóa “${food.name}” khỏi Món của tôi.`,
      commit: () => deleteCustomFood(food.id),
      restore: unhide,
      done: () => {
        customs.setData((list) => list?.filter((x) => x.id !== food.id));
        unhide();
        notifyDataChanged('foods');
      },
    });
  };

  // Rows: foods logged before keep their own portion size (their "đĩa"), whichever list shows them.
  const rowFor = useCallback(
    (o: FoodOption): { option: FoodOption; quantity: number; unit: string; count?: number } => {
      const r = recentByKey.get(o.key);
      if (r) return { option: r.option, quantity: r.quantity, unit: r.unit, count: r.count };
      return { option: o, ...defaultPortion(o) };
    },
    [recentByKey],
  );
  const pick = useCallback((o: FoodOption, quantity: number, unit: string) => setPicked({ option: o, quantity, unit }), []);
  const quick = useCallback((o: FoodOption, quantity: number, unit: string) => void onQuick(o, quantity, unit), [onQuick]);
  const editSaved = useCallback(
    (o: FoodOption) => {
      const f = o.customFoodId ? customById.get(o.customFoodId) : undefined;
      if (f) setCustomSheet({ food: f });
    },
    [customById],
  );

  // Enter in the search box opens the best match for what is typed now (no debounce wait).
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const now = query.trim();
    if (!now) return;
    e.preventDefault();
    const top = now === q ? results[0] : searchFoods(now, searchPool, { ...searchOpts, limit: 1 })[0];
    if (top) {
      const r = rowFor(top);
      setPicked({ option: r.option, quantity: r.quantity, unit: r.unit });
    } else setQuickOpen(true);
  };

  // Photos of every visible saved / scanned dish.
  const visibleOptions = useMemo(() => {
    if (q) return results;
    if (tab === 'suggest') return [...suggestions.map((s) => s.option), ...recent.map((r) => r.option)];
    if (tab === 'mine') return customOptions;
    return [];
  }, [q, results, tab, suggestions, recent, customOptions]);
  const photos = useMealPhotoUrls(useMemo(() => visibleOptions.map((o) => ({ photo_path: o.photoPath ?? null })), [visibleOptions]));

  const renderRow = (o: FoodOption, over?: { quantity: number; unit: string; count?: number }, opts: { edit?: boolean } = {}) => {
    const r = over ? { option: o, ...over } : rowFor(o);
    return (
      <FoodRow
        key={r.option.key}
        option={r.option}
        quantity={r.quantity}
        unit={r.unit}
        count={r.count}
        highlight={q}
        photoUrl={r.option.photoPath ? photos[r.option.photoPath] : undefined}
        busy={quickBusy === r.option.key}
        mealLabel={mealLower}
        onPick={pick}
        onQuick={quick}
        onEdit={opts.edit && r.option.origin === 'custom' ? editSaved : undefined}
      />
    );
  };

  const loadingList = (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );

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
          placeholder="Tìm phở, cơm tấm, món đã lưu…"
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
        <GlassButton variant="pill" onClick={() => setCustomSheet({ food: null })} className="shrink-0">
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
            { value: 'suggest', label: 'Gợi ý' },
            { value: 'mine', label: 'Món của tôi' },
            { value: 'popular', label: 'Phổ biến' },
          ]}
        />
      )}

      {/* Only a short summary is announced, never the whole list (screen readers would read every row on each keystroke). */}
      <p role="status" className="sr-only">
        {q && !personalLoading ? (results.length > 0 ? `${results.length} kết quả cho “${q}”` : `Không thấy “${q}”`) : ''}
      </p>
      <section aria-label={q ? `Kết quả cho ${q}` : 'Danh sách món'} className="mt-4">
        {q ? (
          results.length > 0 ? (
            <>
              <p className="mb-2 pl-1 text-[13px] text-muted">{results.length} kết quả</p>
              <ul className="flex flex-col gap-1">{results.map((o) => renderRow(o))}</ul>
            </>
          ) : (
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
                  <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCustomSheet({ food: null })}>
                    Tạo món riêng
                  </Button>
                </div>
              }
            />
          )
        ) : tab === 'suggest' ? (
          personalLoading && !history.data ? (
            loadingList
          ) : nothingPersonal ? (
            <EmptyState compact icon={Sparkles} title="Chưa có gợi ý" description="Món bạn ghi, scan hoặc lưu sẽ hiện ở đây để thêm lại bằng một chạm." />
          ) : (
            <div className="flex flex-col gap-6">
              {mealTemplates.length > 0 && (
                <ListSection
                  title={`Bữa mẫu cho ${mealLower}`}
                  action={
                    <button type="button" onClick={() => setTemplatesOpen(true)} className="-mr-2 min-h-[44px] rounded-full px-2 text-[13px] font-semibold text-gold">
                      Tất cả
                    </button>
                  }
                >
                  <ul className="flex flex-col gap-1">
                    {mealTemplates.map((t) => (
                      <TemplateRow key={t.id} template={t} busy={templateBusy === t.id} mealLabel={mealLower} onLog={(x) => void logTemplate(x)} />
                    ))}
                  </ul>
                </ListSection>
              )}
              {suggestions.length > 0 && (
                <ListSection title={`Hay ăn vào ${mealLower}`} hint="Chạm + để thêm ngay với khẩu phần lần trước">
                  <ul className="flex flex-col gap-1">
                    {suggestions.map((s) => renderRow(s.option, { quantity: s.quantity, unit: s.unit, count: s.count || undefined }))}
                  </ul>
                </ListSection>
              )}
              {recent.length > 0 && (
                <ListSection title="Gần đây">
                  <ul className="flex flex-col gap-1">{recent.map((r) => renderRow(r.option, { quantity: r.quantity, unit: r.unit, count: r.count }))}</ul>
                </ListSection>
              )}
            </div>
          )
        ) : tab === 'mine' ? (
          customs.loading && !customs.data ? (
            loadingList
          ) : (
            <div className="flex flex-col gap-6">
              {tpl.templates.length > 0 && (
                <ListSection
                  title="Bữa mẫu"
                  action={
                    <button type="button" onClick={() => setTemplatesOpen(true)} className="-mr-2 min-h-[44px] rounded-full px-2 text-[13px] font-semibold text-gold">
                      Quản lý
                    </button>
                  }
                >
                  <ul className="flex flex-col gap-1">
                    {tpl.templates.map((t) => (
                      <TemplateRow key={t.id} template={t} busy={templateBusy === t.id} mealLabel={mealLower} onLog={(x) => void logTemplate(x)} />
                    ))}
                  </ul>
                </ListSection>
              )}
              {savedFoods.length > 0 ? (
                <ListSection title="Món đã lưu" hint="Món scan xong được lưu tự động · dùng nhiều xếp trước">
                  <ul className="flex flex-col gap-1">{customOptions.map((o) => renderRow(o, undefined, { edit: true }))}</ul>
                </ListSection>
              ) : (
                <EmptyState
                  compact
                  icon={ChefHat}
                  title="Chưa có món đã lưu"
                  description="Món bạn scan sẽ tự lưu ở đây — lần sau chỉ cần chọn, không phải scan lại. Bạn cũng có thể tự tạo món theo nhãn dinh dưỡng."
                  action={
                    <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCustomSheet({ food: null })}>
                      Tạo món riêng
                    </Button>
                  }
                />
              )}
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-1">{POPULAR.map((o) => renderRow(o))}</ul>
        )}
      </section>

      <FoodSheet
        open={!!picked}
        onClose={() => setPicked(null)}
        option={picked?.option ?? null}
        date={date}
        meal={meal}
        initial={picked ? { quantity: picked.quantity, unit: picked.unit } : null}
        onSaved={(e) => {
          logCb.onAdded?.([e]);
          if (e.custom_food_id) {
            void markCustomFoodUsed(e.custom_food_id, e.meal).then(([f]) => {
              if (f) {
                onFoodUsed(f);
                notifyDataChanged('foods');
              }
            });
          }
        }}
      />
      <QuickAddSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        date={date}
        meal={meal}
        initialName={query.trim()}
        onSaved={(e) => logCb.onAdded?.([e])}
      />
      <CustomFoodSheet
        open={!!customSheet}
        onClose={() => setCustomSheet(null)}
        initialName={customSheet?.food ? undefined : query.trim()}
        food={customSheet?.food ?? null}
        onSaved={(food, mode) => {
          customs.setData((list) => [...(list ?? []).filter((x) => x.id !== food.id), food].sort(compareByUse));
          // A new food is opened right away to log it.
          if (mode === 'add') {
            const o = fromCustomFood(food);
            setPicked({ option: o, ...defaultPortion(o) });
          }
        }}
        onDelete={removeCustom}
      />
      <MealTemplatesSheet
        open={templatesOpen}
        onClose={() => {
          setTemplatesOpen(false);
          if (params.get('templates'))
            setParams(
              (prev) => {
                const n = new URLSearchParams(prev);
                n.delete('templates');
                return n;
              },
              { replace: true },
            );
        }}
        templates={tpl.templates}
        meal={meal}
        onLog={(t, at) => logTemplate(t, at)}
        onRename={(t, patch) => tpl.rename(t, patch)}
        onDelete={tpl.remove}
      />
      <TemplateDupDialog prompt={tpl.dupPrompt} />
    </Page>
  );
}

function ListSection({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className={`mb-1 flex justify-between gap-3 pl-1 ${hint ? 'items-end' : 'items-center'}`}>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold tracking-[-0.02em] text-text">{title}</h2>
          {hint && <p className="truncate text-[12px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TemplateRow({ template: t, busy, mealLabel, onLog }: { template: MealTemplate; busy: boolean; mealLabel: string; onLog: (t: MealTemplate) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onLog(t)}
        disabled={busy}
        aria-busy={busy}
        aria-label={`Ghi bữa mẫu ${t.name}, ${t.items.length} món, ${formatNumber(t.total_kcal)} kcal vào ${mealLabel}`}
        className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06] disabled:opacity-70"
      >
        <FoodThumb kind="template" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-text">{t.name}</span>
          <span className="block truncate text-[12px] text-muted">
            {t.items.length} món · {dishesSummary(t.items)}
          </span>
        </span>
        <span className="tabular shrink-0 text-[15px] font-bold text-text">
          {formatNumber(t.total_kcal)}
          <span className="ml-0.5 text-[11px] font-semibold text-muted">kcal</span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold" aria-hidden="true">
          {busy ? <Spinner size={16} /> : <Plus className="h-4 w-4" />}
        </span>
      </button>
    </li>
  );
}

interface FoodRowProps {
  option: FoodOption;
  quantity: number;
  unit: string;
  /** Times logged recently (shown when ≥ 2). */
  count?: number;
  /** Query whose words are highlighted in the name. */
  highlight?: string;
  photoUrl?: string;
  busy: boolean;
  mealLabel: string;
  onPick: (o: FoodOption, quantity: number, unit: string) => void;
  onQuick: (o: FoodOption, quantity: number, unit: string) => void;
  onEdit?: (o: FoodOption) => void;
}

/** Row: tap = portion sheet, "+" = add this portion right away (undo in the toast), pencil = edit a saved food. */
const FoodRow = memo(function FoodRow({ option, quantity, unit, count, highlight, photoUrl, busy, mealLabel, onPick, onQuick, onEdit }: FoodRowProps) {
  const qty = quantity || (isWeight(unit) ? 100 : 1);
  const kcal = computePortion(option, qty, unit).kcal;
  const saved = option.origin === 'custom';
  const uses = saved ? option.useCount ?? 0 : count ?? 0;
  const base = saved
    ? option.savedFrom === 'ai'
      ? 'Từ ảnh quét'
      : 'Món của tôi'
    : option.brand ?? (option.category ? FOOD_CATEGORY_LABELS[option.category] : 'Đã ghi trước đây');
  // Portion first so it is never the part cut off on narrow phones.
  const tag = `${formatNumber(qty, 2)} ${unit} · ${base}${uses >= 2 ? ` · đã ăn ${uses} lần` : ''}`;
  const parts = highlight ? highlightParts(option.name, highlight) : null;
  const kind = option.origin === 'custom' ? (option.savedFrom === 'ai' ? 'ai' : 'saved') : 'food';
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPick(option, qty, unit)}
        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 rounded-2xl py-2 pl-2 pr-1 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
      >
        <FoodThumb url={photoUrl} kind={kind} />
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
          {onEdit ? (
            <>
              <span className="block truncate text-[12px] text-muted">
                {formatNumber(qty, 2)} {unit} · <span className="tabular font-semibold text-text">{formatNumber(kcal)} kcal</span>
              </span>
              <span className="block truncate text-[11.5px] text-muted">
                {base} · {usageLabel(option.useCount, option.lastUsedAt).toLowerCase()}
              </span>
            </>
          ) : (
            <span className="block truncate text-[12px] text-muted">{tag}</span>
          )}
        </span>
        {!onEdit && (
          <span className="tabular shrink-0 text-[15px] font-bold text-text">
            {formatNumber(kcal)}
            <span className="ml-0.5 text-[11px] font-semibold text-muted">kcal</span>
          </span>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(option)}
          aria-label={`Sửa món đã lưu ${option.name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-text"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onQuick(option, qty, unit)}
        disabled={busy}
        aria-busy={busy}
        aria-label={`Thêm nhanh ${formatNumber(qty, 2)} ${unit} ${option.name} vào ${mealLabel}`}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold/15 text-gold transition-transform active:scale-95 disabled:opacity-60"
      >
        {busy ? <Spinner size={16} /> : <Plus className="h-5 w-5" aria-hidden="true" />}
      </button>
    </li>
  );
});
