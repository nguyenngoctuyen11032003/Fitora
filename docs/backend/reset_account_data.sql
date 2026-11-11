-- Xóa dữ liệu Fitora của MỘT tài khoản để tính calo lại từ đầu. KHÔNG THỂ HOÀN TÁC.
-- Chạy trong Supabase SQL editor (quyền postgres). Giữ nguyên tài khoản đăng nhập, hồ sơ mục tiêu (fit_profiles),
-- gói Pro và bộ đếm lượt quét hôm nay.
do $$
declare v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'nguyenngoctuyen11032003@gmail.com';
  if v_uid is null then raise exception 'Không thấy tài khoản'; end if;

  delete from public.fit_meal_entries      where user_id = v_uid;
  delete from public.fit_meal_templates    where user_id = v_uid;
  delete from public.fit_custom_foods      where user_id = v_uid;
  delete from public.fit_workouts          where user_id = v_uid;
  delete from public.fit_workout_templates where user_id = v_uid;
  delete from public.fit_daily_logs        where user_id = v_uid;
  delete from public.fit_body_measurements where user_id = v_uid;
  delete from public.fit_progress_photos   where user_id = v_uid;
  -- Muốn làm lại cả khảo sát mục tiêu (chiều cao, cân nặng, calo mục tiêu…) thì bỏ comment dòng dưới:
  -- delete from public.fit_profiles where user_id = v_uid;
end $$;

-- Ảnh trong bucket 'fitora' (thư mục <uid>/meals, <uid>/progress): xóa bằng Dashboard → Storage → fitora
-- (hoặc API storage). Xóa dòng trong storage.objects bằng SQL sẽ để lại file mồ côi trong kho lưu trữ.
