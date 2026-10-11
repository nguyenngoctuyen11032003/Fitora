# Fitora — AI Nutrition & Fitness Coach

Fitora là web app (ưu tiên điện thoại) giúp bạn **chụp món ăn để AI ước tính calo & macro**, ghi nhật ký ăn uống,
lên lịch và ghi buổi tập, theo dõi nước, bước chân, cân nặng, số đo và ảnh tiến trình, cùng báo cáo tuần/tháng.
Giao diện tiếng Việt, phong cách "Ember Glass" (glassmorphism tông cà phê ấm + chữ số display cỡ lớn, điểm nhấn vàng).

- Frontend: React 18 + TypeScript + Vite + Tailwind 3, `react-router-dom` (HashRouter), `lucide-react`, `recharts`.
- Backend: **Supabase dùng chung với Note_mytasks** (Auth, PostgREST, Storage, Edge Function `fitora-food-ai`).
- Hợp đồng kỹ thuật (bảng, route, quyền sở hữu file, API dùng chung): [`docs/PLAN.md`](docs/PLAN.md).

## Tài khoản dùng chung với Note_mytasks

Fitora và Note_mytasks trỏ tới **cùng một project Supabase** (cùng `VITE_SUPABASE_URL` + anon key), nên dùng chung bảng
`auth.users`:

- Đã có tài khoản Note_mytasks → đăng nhập Fitora bằng **đúng email & mật khẩu đó**, không cần đăng ký lại.
- Đăng ký trên Fitora cũng tạo tài khoản dùng được cho Note_mytasks. Đổi mật khẩu ở app nào cũng áp dụng cho cả hai.
- Tên hiển thị và ảnh đại diện đọc từ bảng `public.profiles` của Note_mytasks.
- Phiên đăng nhập lưu với `storageKey: 'fitora.auth'` (Note_mytasks dùng `nm.auth`) — hai app cùng nằm trên `*.github.io`,
  tách key để đăng xuất app này không đăng xuất app kia.
- Dữ liệu riêng của Fitora nằm trong các bảng `fit_*` và bucket Storage riêng tư `fitora` (RLS: chỉ chủ sở hữu).

Migration database và Edge Function nằm trong repo **Note_mytasks** (`supabase/migrations/*_fitora_*.sql`,
`supabase/functions/fitora-food-ai`) và được deploy bởi workflow của repo đó. Repo này chỉ chứa frontend.

## Chạy local

Yêu cầu Node ≥ 20.19 (khuyên dùng 22+).

```bash
npm install
cp .env.example .env        # điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY (giống Note_mytasks)
npm run dev                 # http://localhost:5173
```

Chỉ đặt **anon / publishable key** vào `.env`. Tuyệt đối không dùng `service_role` / `sb_secret_…`: mọi biến `VITE_*`
đều bị đóng gói vào JavaScript công khai. Thiếu biến → app hiện màn hình "chưa cấu hình".

| Lệnh | Việc |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit test (Vitest) — công thức BMI/BMR/TDEE/macro/MET, ngày, số |
| `npm run build` | Build production vào `dist/` (`base: './'`) |
| `npm run preview` | Xem bản build |

Để link xác nhận email / đặt lại mật khẩu quay về đúng app khi chạy local, thêm `http://localhost:5173/**` vào
Supabase → Authentication → URL Configuration → Redirect URLs.

## Deploy (GitHub Pages)

1. **Settings → Pages → Source**: chọn **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables** (Variables, không phải Secrets — đây là giá trị công khai):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon / publishable key
3. Supabase → Authentication → URL Configuration → **Redirect URLs**: thêm `https://<user>.github.io/<repo>/**`
   (cần cho email xác nhận đăng ký `?flow=signup` và đặt lại mật khẩu `?flow=recovery`).
4. Push lên `main` → workflow **Deploy** chạy CI (typecheck · test · build) rồi đăng lên Pages.
   Mỗi Pull Request chạy workflow **CI**.

Cả hai workflow chạy `.github/scripts/check-public-env.mjs`, chặn build nếu `VITE_SUPABASE_ANON_KEY` là service_role/secret
key hoặc có biến `VITE_*` trông giống secret.

Ứng dụng dùng **HashRouter** (`#/diary`) vì GitHub Pages không rewrite SPA; liên kết email dùng query string
(`?code=…`, `?token_hash=…&type=…`) nên không đụng hash route. `public/404.html` chuyển link dạng đường dẫn
(`/<repo>/diary`) sang `/<repo>/#/diary`.

Sau khi đặt biến / bật Pages, chạy lại: `gh workflow run deploy.yml` (hoặc Actions → Deploy → Run workflow).
Workflow fail sớm nếu thiếu biến `VITE_*` (bước kiểm tra env) hoặc Pages chưa bật (bước `configure-pages`).

## Cấu trúc

```
src/
  App.tsx              routes + guards (đăng nhập → onboarding → app)
  main.tsx
  styles/index.css     token Ember Glass, glass system, animation, khung điện thoại
  lib/                 supabase, config, date, format, energy (+test), image, events, hooks
  types/db.ts          kiểu dòng cho mọi bảng fit_*
  services/            CRUD mỏng, lỗi tiếng Việt
  context/             AuthContext, ProfileContext
  components/ui/       bộ UI (GlassCard, Button, BottomSheet, Toast, Ring, BigNumber…)
  components/shell/    AppFrame, TopBar, BottomNav, MenuOverlay, Page
  features/*           các màn hình (auth, onboarding, scan, food, workout, today, reports, body, profile)
```
