import { Camera, Columns2, ImagePlus, Pencil, Plus } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '@/components/shell/Page';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Modal';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Segmented } from '@/components/ui/Segmented';
import { useToast } from '@/components/ui/Toast';
import { useProfile } from '@/context/ProfileContext';
import { formatDayVi, todayISO } from '@/lib/date';
import { notifyDataChanged } from '@/lib/events';
import { useAsync } from '@/lib/hooks';
import { compressImage } from '@/lib/image';
import { deleteMeasurement, deletePhoto, listMeasurements, listPhotos } from '@/services/body';
import type { BodyMeasurement, ProgressPhoto } from '@/types/db';
import { CompareView } from './CompareView';
import { num, sortAsc, toggleSelection } from './lib';
import { MeasurementSheet } from './MeasurementSheet';
import { MeasurementsTab } from './MeasurementsTab';
import { PhotosTab } from './PhotosTab';
import { PhotoUploadSheet, type PendingPhoto } from './PhotoUploadSheet';
import { PhotoViewer } from './PhotoViewer';
import { usePhotoUrls } from './usePhotoUrls';

type Tab = 'measure' | 'photos';
/** Source files above this are refused before decoding (would stall low-end phones). */
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export default function BodyPage() {
  const toast = useToast();
  const { fit } = useProfile();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'photos' ? 'photos' : 'measure';
  const setTab = (t: Tab) => {
    setCompare(false);
    setSelected([]);
    setParams(t === 'photos' ? { tab: 'photos' } : {}, { replace: true });
  };

  // ---- data
  const m = useAsync(() => listMeasurements(), []);
  const ph = useAsync(() => listPhotos(), []);
  const rows = useMemo(() => sortAsc(m.data ?? []), [m.data]);
  const photos = useMemo(() => ph.data ?? [], [ph.data]);
  const lastWeight = useMemo(() => {
    for (let i = rows.length - 1; i >= 0; i--) {
      const w = num(rows[i].weight_kg);
      if (w !== null) return w;
    }
    return null;
  }, [rows]);
  const measuredToday = rows.some((r) => r.measured_on === todayISO());
  const paths = useMemo(() => (tab === 'photos' ? photos.map((p) => p.storage_path) : []), [tab, photos]);
  const { urls, error: urlError, retry: retryUrls } = usePhotoUrls(paths);

  // ---- measurements
  const [sheet, setSheet] = useState<{ open: boolean; editing: BodyMeasurement | null }>({ open: false, editing: null });
  const [toDelete, setToDelete] = useState<BodyMeasurement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const onSaved = useCallback(
    (row: BodyMeasurement, replacedId?: string) => {
      m.setData((prev) => sortAsc([...(prev ?? []).filter((r) => r.id !== row.id && r.id !== replacedId && r.measured_on !== row.measured_on), row]));
      notifyDataChanged('body');
    },
    [m],
  );

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await deleteMeasurement(toDelete.id);
      m.setData((prev) => (prev ?? []).filter((r) => r.id !== toDelete.id));
      notifyDataChanged('body');
      toast.success(`Đã xóa số đo ${formatDayVi(toDelete.measured_on, 'short')}`);
      setToDelete(null);
      setSheet({ open: false, editing: null });
    } catch (e) {
      toast.error(e);
    } finally {
      setDeleting(false);
    }
  };

  // ---- photos
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pair, setPair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) {
      toast.error('Hãy chọn một tệp ảnh.');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      toast.error(`Ảnh quá lớn (${Math.round(file.size / 1024 / 1024)} MB) — hãy chọn ảnh dưới ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setCompressing(true);
    try {
      const c = await compressImage(file, { maxSide: 1440, quality: 0.84 });
      setPending({ blob: c.blob, dataUrl: c.dataUrl, width: c.width, height: c.height });
    } catch (err) {
      toast.error(err);
    } finally {
      setCompressing(false);
    }
  };

  const onUploaded = (p: ProgressPhoto) => {
    ph.setData((prev) =>
      [p, ...(prev ?? [])].sort((a, b) => (a.taken_on === b.taken_on ? (a.created_at < b.created_at ? 1 : -1) : a.taken_on < b.taken_on ? 1 : -1)),
    );
  };

  const removePhoto = async (p: ProgressPhoto) => {
    try {
      await deletePhoto(p.id);
      // Filter the latest list (an upload may have landed while the delete was in flight).
      const next = (ph.data ?? photos).filter((x) => x.id !== p.id);
      ph.setData((prev) => (prev ?? []).filter((x) => x.id !== p.id));
      setSelected((s) => s.filter((id) => id !== p.id));
      setPair((pr) => (pr && (pr[0].id === p.id || pr[1].id === p.id) ? null : pr));
      setViewer((i) => (i === null || !next.length ? null : Math.min(i, next.length - 1)));
      toast.success('Đã xóa ảnh');
    } catch (e) {
      toast.error(e);
    }
  };

  const startCompare = () => {
    const [a, b] = selected.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as ProgressPhoto[];
    if (a && b) setPair([a, b]);
  };

  // ---- footer (thumb zone)
  let footer;
  if (tab === 'measure') {
    // Empty history → the empty state's own "Ghi lần cân đầu tiên" is the only CTA.
    // Already measured today → the sheet opens on today's entry, so say so.
    footer = rows.length ? (
      <Button
        block
        size="lg"
        icon={measuredToday ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        onClick={() => setSheet({ open: true, editing: null })}
      >
        {measuredToday ? 'Cập nhật số đo hôm nay' : 'Thêm số đo'}
      </Button>
    ) : undefined;
  } else if (compare) {
    footer = (
      <div className="flex gap-2.5">
        <Button variant="secondary" size="lg" onClick={() => (setCompare(false), setSelected([]))}>
          Hủy
        </Button>
        <Button block size="lg" icon={<Columns2 className="h-5 w-5" />} disabled={selected.length !== 2} onClick={startCompare}>
          So sánh {selected.length}/2
        </Button>
      </div>
    );
  } else {
    footer = (
      <div className="flex gap-2.5">
        <Button block size="lg" icon={<Camera className="h-5 w-5" />} loading={compressing} onClick={() => camRef.current?.click()}>
          Chụp ảnh
        </Button>
        <Button variant="secondary" size="lg" icon={<ImagePlus className="h-5 w-5" />} disabled={compressing} onClick={() => libRef.current?.click()}>
          Thư viện
        </Button>
      </div>
    );
  }

  return (
    <Page footer={footer} label="Cơ thể">
      <ScreenHeader eyebrow="Theo dõi cơ thể" title="Cơ thể" />

      <Segmented
        className="mb-5 mt-5"
        ariaLabel="Mục"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'measure', label: 'Cân nặng & số đo' },
          { value: 'photos', label: 'Ảnh tiến trình' },
        ]}
      />

      {tab === 'measure' ? (
        <MeasurementsTab
          rows={rows}
          loading={m.loading}
          error={m.error}
          fit={fit}
          onAdd={() => setSheet({ open: true, editing: null })}
          onEdit={(r) => setSheet({ open: true, editing: r })}
          onRetry={() => void m.reload()}
        />
      ) : (
        <PhotosTab
          photos={photos}
          urls={urls}
          rows={rows}
          loading={ph.loading}
          error={ph.error}
          compare={compare}
          selected={selected}
          onToggleCompare={() => {
            setCompare((c) => !c);
            setSelected([]);
          }}
          onSelect={(p) => setSelected((s) => toggleSelection(s, p.id))}
          onOpen={(p) => setViewer(photos.findIndex((x) => x.id === p.id))}
          onRetry={() => void ph.reload()}
          urlError={urlError}
          onRetryUrls={retryUrls}
        />
      )}

      {/* Hidden pickers: camera (rear) and library */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} aria-hidden="true" tabIndex={-1} />
      <input ref={libRef} type="file" accept="image/*" className="hidden" onChange={onFile} aria-hidden="true" tabIndex={-1} />

      <MeasurementSheet
        open={sheet.open}
        editing={sheet.editing}
        rows={rows}
        lastWeight={lastWeight}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        onSaved={onSaved}
        onDelete={setToDelete}
      />
      <ConfirmDialog
        open={!!toDelete}
        danger
        title="Xóa số đo?"
        message={toDelete ? `Toàn bộ số đo ngày ${formatDayVi(toDelete.measured_on, 'long')} sẽ bị xóa.` : undefined}
        confirmLabel="Xóa"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      <PhotoUploadSheet pending={pending} rows={rows} photos={photos} onClose={() => setPending(null)} onUploaded={onUploaded} />
      <PhotoViewer
        photos={photos}
        index={viewer}
        urls={urls}
        rows={rows}
        onIndex={setViewer}
        onDelete={removePhoto}
        onCompare={(p) => {
          setViewer(null);
          setCompare(true);
          setSelected([p.id]);
        }}
      />
      <CompareView pair={pair} urls={urls} rows={rows} goal={fit?.goal} onClose={() => setPair(null)} />
    </Page>
  );
}
