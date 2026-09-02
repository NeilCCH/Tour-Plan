-- Tour_APP 資料表 + 安全規則（Row Level Security）
-- =============================================================================
-- 用法:Supabase 主控台 → 左側「SQL Editor」→ New query → 貼上整段 → 按 Run。
-- 可重複執行(重跑不會出錯)。
-- =============================================================================

-- 三張表結構相同:
--   id         每筆資料的唯一碼(由 App 產生,本地與雲端共用同一個)
--   user_id    擁有者(自動填入登入者,靠它做權限隔離)
--   data       整筆資料本體(JSON,App 的欄位都放這裡,日後加欄位不用改表)
--   updated_at 最後修改時間(毫秒),雙向同步以較新者為準
--   deleted    軟刪除標記,讓「刪除」也能同步到別的裝置

create table if not exists public.trips (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);

create table if not exists public.places (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);

create table if not exists public.moments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  deleted boolean not null default false
);

-- 開啟 Row Level Security(沒有下面的政策,任何人都讀不到任何資料)
alter table public.trips   enable row level security;
alter table public.places  enable row level security;
alter table public.moments enable row level security;

-- 政策:每個人只能讀寫「自己的」資料
drop policy if exists "own trips"   on public.trips;
drop policy if exists "own places"  on public.places;
drop policy if exists "own moments" on public.moments;

create policy "own trips"   on public.trips   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own places"  on public.places  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own moments" on public.moments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 授權:登入使用者可透過 API 存取(實際能存取哪些列,仍受上面 RLS 限制)
grant all on public.trips   to authenticated;
grant all on public.places  to authenticated;
grant all on public.moments to authenticated;

-- ===========================================================================
-- 公開分享(唯讀):允許「未登入的人」讀取被標為 public 的資料。
-- 開啟某趟「公開分享」時,App 會把該趟與其地點的 data.public 設為 true;
-- 下面的規則讓匿名者只能讀到這些被公開的列,其餘一律讀不到。
-- ===========================================================================
grant select on public.trips   to anon;
grant select on public.places  to anon;
grant select on public.moments to anon;

drop policy if exists "public read trips"   on public.trips;
drop policy if exists "public read places"  on public.places;
drop policy if exists "public read moments" on public.moments;

create policy "public read trips"   on public.trips   for select using ((data->>'public')::boolean is true);
create policy "public read places"  on public.places  for select using ((data->>'public')::boolean is true);
create policy "public read moments" on public.moments for select using ((data->>'public')::boolean is true);

-- ===========================================================================
-- 邀請協作(共同編輯):協作者的 uid 存在 trips.data.members 陣列。
-- 成員可讀寫「自己是成員」的行程與其地點/Moment;加入動作由 RPC 憑邀請碼完成。
-- ===========================================================================

-- 成員可讀寫自己是成員的行程
drop policy if exists "member trips" on public.trips;
create policy "member trips" on public.trips for all
  using  (coalesce(data->'members', '[]'::jsonb) ? auth.uid()::text)
  with check (coalesce(data->'members', '[]'::jsonb) ? auth.uid()::text);

-- 只要能存取所屬行程(擁有者或成員),就能讀寫其地點
drop policy if exists "trip access places" on public.places;
create policy "trip access places" on public.places for all
  using (exists (select 1 from public.trips t
    where t.id = (places.data->>'tripId')::uuid
      and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text)))
  with check (exists (select 1 from public.trips t
    where t.id = (places.data->>'tripId')::uuid
      and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text)));

drop policy if exists "trip access moments" on public.moments;
create policy "trip access moments" on public.moments for all
  using (exists (select 1 from public.trips t
    where t.id = (moments.data->>'tripId')::uuid
      and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text)))
  with check (exists (select 1 from public.trips t
    where t.id = (moments.data->>'tripId')::uuid
      and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text)));

-- 加入協作的 RPC:憑邀請碼把自己加進 members(SECURITY DEFINER,安全把關)
create or replace function public.join_trip(p_trip_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_code = '' or not exists (
      select 1 from public.trips t where t.id = p_trip_id and t.data->>'inviteCode' = p_code
  ) then
    raise exception 'invalid invite';
  end if;
  update public.trips
     set data = jsonb_set(
                  jsonb_set(
                    jsonb_set(data, '{fts}', coalesce(data->'fts','{}'::jsonb)),
                    '{members}', coalesce(data->'members','[]'::jsonb) || to_jsonb(auth.uid()::text)),
                  '{fts,members}', to_jsonb((extract(epoch from now())*1000)::bigint)),
         updated_at = (extract(epoch from now()) * 1000)::bigint
   where id = p_trip_id
     and not (coalesce(data->'members', '[]'::jsonb) ? auth.uid()::text);
end; $$;
grant execute on function public.join_trip(uuid, text) to authenticated;

-- ===========================================================================
-- 使用者暱稱 profiles(顯示「Neo,您好」;也供 email 邀請查詢與協作者名單)
-- ===========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nickname text,
  updated_at bigint not null default 0
);
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;

-- 讀:登入者都可讀(供顯示暱稱與 email 邀請查詢)
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (auth.uid() is not null);

-- 寫:只能新增/修改自己的
drop policy if exists "write own profile" on public.profiles;
create policy "write own profile" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- ===========================================================================
-- Email 邀請 + App 內通知 + 接受制 + 協作者管理
-- ===========================================================================
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  trip_name text,
  inviter_id uuid not null default auth.uid(),
  inviter_name text,
  invitee_id uuid not null,
  status text not null default 'pending',
  created_at bigint not null default 0
);
alter table public.invitations enable row level security;
grant select, insert, update on public.invitations to authenticated;

-- 讀:邀請人或被邀請人可看
drop policy if exists "read invites" on public.invitations;
create policy "read invites" on public.invitations for select
  using (inviter_id = auth.uid() or invitee_id = auth.uid());
-- 建立:只能以自己為邀請人
drop policy if exists "create invites" on public.invitations;
create policy "create invites" on public.invitations for insert
  with check (inviter_id = auth.uid());
-- 更新:邀請人或被邀請人可改(接受/拒絕/取消)
drop policy if exists "update invites" on public.invitations;
create policy "update invites" on public.invitations for update
  using (inviter_id = auth.uid() or invitee_id = auth.uid())
  with check (inviter_id = auth.uid() or invitee_id = auth.uid());

-- 接受邀請:把自己加進行程 members,並標記 accepted
create or replace function public.accept_invite(p_invite uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select trip_id into v_trip from public.invitations
   where id = p_invite and invitee_id = auth.uid() and status = 'pending';
  if v_trip is null then raise exception 'invite not found'; end if;
  update public.trips
     set data = jsonb_set(
                  jsonb_set(
                    jsonb_set(data, '{fts}', coalesce(data->'fts','{}'::jsonb)),
                    '{members}', coalesce(data->'members','[]'::jsonb) || to_jsonb(auth.uid()::text)),
                  '{fts,members}', to_jsonb((extract(epoch from now())*1000)::bigint)),
         updated_at = (extract(epoch from now())*1000)::bigint
   where id = v_trip and not (coalesce(data->'members','[]'::jsonb) ? auth.uid()::text);
  update public.invitations set status = 'accepted' where id = p_invite;
  return v_trip;
end; $$;
grant execute on function public.accept_invite(uuid) to authenticated;

-- 移除協作者(僅擁有者)
create or replace function public.remove_member(p_trip uuid, p_member text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.trips where id = p_trip and user_id = auth.uid()) then
    raise exception 'not owner';
  end if;
  update public.trips
     set data = jsonb_set(
                  jsonb_set(
                    jsonb_set(data, '{fts}', coalesce(data->'fts','{}'::jsonb)),
                    '{members}',
                    coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(data->'members','[]'::jsonb)) x
                              where x <> p_member), '[]'::jsonb)),
                  '{fts,members}', to_jsonb((extract(epoch from now())*1000)::bigint)),
         updated_at = (extract(epoch from now())*1000)::bigint
   where id = p_trip;
end; $$;
grant execute on function public.remove_member(uuid, text) to authenticated;

-- ===========================================================================
-- 照片雲端同步:私有 Storage 桶「photos」,只有該行程的擁有者或協作者能上傳/讀取
-- ---------------------------------------------------------------------------
-- App 上傳路徑格式:{tripId}/{momentId}/{photoId}.jpg
-- 第一段資料夾 = tripId;下面的政策用它比對「你是不是這趟的擁有者或成員」。
-- 桶設為私有(public=false),沒有下面的政策就完全讀不到 → 達成「限協作者觀看」。
-- 可重複執行。
-- ===========================================================================

-- 建立私有桶(已存在則略過)
insert into storage.buckets (id, name, public)
  values ('photos', 'photos', false)
  on conflict (id) do nothing;

-- 讀取(下載):擁有者或協作成員
drop policy if exists "trip members read photos" on storage.objects;
create policy "trip members read photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text))
  );

-- 上傳(新增):擁有者或協作成員
drop policy if exists "trip members insert photos" on storage.objects;
create policy "trip members insert photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text))
  );

-- 覆蓋(upsert 需要):擁有者或協作成員
drop policy if exists "trip members update photos" on storage.objects;
create policy "trip members update photos" on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text))
  )
  with check (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text))
  );

-- 刪除:擁有者或協作成員(刪記錄時順手清雲端照片)
drop policy if exists "trip members delete photos" on storage.objects;
create policy "trip members delete photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid() or coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text))
  );
