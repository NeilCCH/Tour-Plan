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

-- 授權:登入使用者可透過 API 讀取、新增、修改(實際能存取哪些列,仍受上面 RLS 限制)。
-- 不開放「永久刪除」:App 的刪除一律是軟刪除(deleted=true),資料列仍留在雲端可救回;
-- 這樣任何人(包含協作者)都無法透過 API 把雲端資料真的抹掉。
grant select, insert, update on public.trips   to authenticated;
grant select, insert, update on public.places  to authenticated;
grant select, insert, update on public.moments to authenticated;
revoke delete, truncate on public.trips   from authenticated;
revoke delete, truncate on public.places  from authenticated;
revoke delete, truncate on public.moments from authenticated;

-- ===========================================================================
-- 公開分享(唯讀):未登入的人「不能」直接讀資料表,只能透過下面兩個函式拿到公開行程。
--
-- 為什麼不再開放直接讀表:整列 data 裡除了行程內容,還有邀請碼(inviteCode)與成員名單。
-- 以前拿到公開連結的人讀得到邀請碼,就能用它把自己加成「可編輯」的協作者;
-- 旅途記錄(日記、花費、打卡座標)也會被一起讀走。現在:
--   - public_trip   只回傳「已開啟公開分享」那一趟,並拿掉邀請碼 / 成員 / 擁有者等欄位
--   - public_places 只回傳該公開行程底下的地點
--   - 旅途記錄(moments)完全不對外
-- ===========================================================================
drop policy if exists "public read trips"   on public.trips;
drop policy if exists "public read places"  on public.places;
drop policy if exists "public read moments" on public.moments;
revoke all on public.trips   from anon;
revoke all on public.places  from anon;
revoke all on public.moments from anon;

create or replace function public.public_trip(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select (t.data - 'inviteCode' - 'members' - 'ownerId' - 'fts') || jsonb_build_object('id', t.id)
    from public.trips t
   where t.id = p_id and not t.deleted and (t.data->>'public') = 'true';
$$;

create or replace function public.public_places(p_trip uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select (p.data - 'fts') || jsonb_build_object('id', p.id)
    from public.places p
   where p.data->>'tripId' = p_trip::text and not p.deleted
     and exists (select 1 from public.trips t
                  where t.id = p_trip and not t.deleted and (t.data->>'public') = 'true');
$$;

revoke all on function public.public_trip(uuid)   from public;
revoke all on function public.public_places(uuid) from public;
grant execute on function public.public_trip(uuid)   to anon, authenticated;
grant execute on function public.public_places(uuid) to anon, authenticated;

-- ===========================================================================
-- 邀請協作(共同編輯):協作者的 uid 存在 trips.data.members 陣列。
-- 成員可讀寫「自己是成員」的行程與其地點/Moment;加入動作由 RPC 憑邀請碼完成。
-- ===========================================================================

-- 成員可讀、可改自己是成員的行程(不能新增成別人的、不能刪);能改哪些欄位見下方的保護觸發器
drop policy if exists "member trips" on public.trips;
drop policy if exists "member read trips" on public.trips;
drop policy if exists "member update trips" on public.trips;
create policy "member read trips" on public.trips for select
  using (coalesce(data->'members', '[]'::jsonb) ? auth.uid()::text);
create policy "member update trips" on public.trips for update
  using  (coalesce(data->'members', '[]'::jsonb) ? auth.uid()::text)
  with check (coalesce(data->'members', '[]'::jsonb) ? auth.uid()::text);

-- 只有發起人(擁有者)有最高權限。協作者透過 API 修改行程列時,下列項目一律維持原值:
--   擁有者(user_id)、刪除狀態(deleted)、成員名單、邀請碼、公開分享、照片保存期限。
-- 也就是:協作者不能刪掉整趟、不能加人/踢人、不能改分享與保存期限、不能把擁有權轉給自己。
-- 用「維持原值」而不是「報錯」:協作者的 App 同步時會整列推上來,報錯會讓他整個同步失敗。
-- 後端函式(join_trip / accept_invite / remove_member,以資料庫擁有者身分執行)與後台不受此限。
create or replace function public.guard_trip_update()
returns trigger language plpgsql as $$
declare
  k text;
  protected text[] := array['members', 'inviteCode', 'public', 'photoRetentionDays', 'ownerId', 'deleted'];
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.user_id := old.user_id;                                -- 擁有權不可經由 API 轉移
  if auth.uid() = old.user_id then return new; end if;       -- 發起人:完整權限
  new.deleted := old.deleted;
  foreach k in array protected loop
    if old.data ? k then new.data := jsonb_set(new.data, array[k], old.data->k, true);
    else new.data := new.data - k; end if;
    if coalesce(old.data->'fts', '{}'::jsonb) ? k then
      new.data := jsonb_set(new.data, array['fts', k], old.data->'fts'->k, true);
    elsif new.data ? 'fts' then
      new.data := new.data #- array['fts', k];
    end if;
  end loop;
  return new;
end; $$;
drop trigger if exists trips_guard on public.trips;
create trigger trips_guard before update on public.trips
  for each row execute function public.guard_trip_update();

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

-- 讀:登入者都可讀「暱稱」;Email 欄位不開放(用欄位層級的權限擋掉,連自己那列也只能從登入資訊得知)。
-- 寫:不開放直接寫表,一律走下面的 save_profile(Email 由後端從登入帳號帶入,不能自己亂填冒充別人)。
revoke all on public.profiles from anon, authenticated;
grant select (id, nickname, updated_at) on public.profiles to authenticated;
drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select using (auth.uid() is not null);
drop policy if exists "write own profile" on public.profiles;

-- 儲存自己的暱稱
create or replace function public.save_profile(p_nickname text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id, email, nickname, updated_at)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          nullif(left(btrim(coalesce(p_nickname, '')), 40), ''),
          (extract(epoch from now()) * 1000)::bigint)
  on conflict (id) do update
     set email = excluded.email,
         nickname = coalesce(excluded.nickname, public.profiles.nickname),
         updated_at = excluded.updated_at;
end; $$;
revoke all on function public.save_profile(text) from public;
grant execute on function public.save_profile(text) to authenticated;

-- 用 Email 找人(給「Email 邀請」用):要輸入完整 Email 才查得到,只回傳 id 與暱稱,不回傳 Email。
create or replace function public.find_user_by_email(p_email text)
returns table (id uuid, nickname text) language sql stable security definer set search_path = public as $$
  select u.id, p.nickname
    from auth.users u
    left join public.profiles p on p.id = u.id
   where auth.uid() is not null
     and btrim(coalesce(p_email, '')) <> ''
     and lower(u.email) = lower(btrim(p_email))
   limit 1;
$$;
revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

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
-- 更新只開放 status 一欄(接受/拒絕)。不能讓人把收到的邀請改指向別的行程或別的邀請人。
revoke all on public.invitations from anon;
revoke update on public.invitations from authenticated;
grant select, insert on public.invitations to authenticated;
grant update (status) on public.invitations to authenticated;

-- 讀:邀請人或被邀請人可看
drop policy if exists "read invites" on public.invitations;
create policy "read invites" on public.invitations for select
  using (inviter_id = auth.uid() or invitee_id = auth.uid());
-- 建立:只能以自己為邀請人,而且自己必須是那趟的發起人(擁有者)——加人是發起人的權限。
-- (少了後半句的話,任何登入者只要知道行程 id,就能「自己邀請自己」再接受,混進別人的行程。)
drop policy if exists "create invites" on public.invitations;
create policy "create invites" on public.invitations for insert
  with check (
    inviter_id = auth.uid()
    and exists (select 1 from public.trips t
      where t.id = trip_id and not t.deleted and t.user_id = auth.uid())
  );
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
  -- 邀請必須是發給我的、還沒處理,而且邀請人是那趟的發起人
  select i.trip_id into v_trip
    from public.invitations i
    join public.trips t on t.id = i.trip_id
   where i.id = p_invite and i.invitee_id = auth.uid() and i.status = 'pending'
     and not t.deleted
     and t.user_id = i.inviter_id;
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

-- 覆蓋、刪除:必須仍是這趟的擁有者或成員,而且是「發起人」或「該則記錄的作者」。
-- (路徑第二段資料夾 = 記錄 id。協作者只能動自己那幾則的照片,不能把整趟的照片清掉或蓋掉。)
drop policy if exists "trip members update photos" on storage.objects;
create policy "trip members update photos" on storage.objects for update to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid()
             or (coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text
                 and exists (select 1 from public.moments m
                              where m.id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()))))
  )
  with check (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid()
             or (coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text
                 and exists (select 1 from public.moments m
                              where m.id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()))))
  );

drop policy if exists "trip members delete photos" on storage.objects;
create policy "trip members delete photos" on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and exists (select 1 from public.trips t
      where t.id::text = (storage.foldername(name))[1]
        and (t.user_id = auth.uid()
             or (coalesce(t.data->'members','[]'::jsonb) ? auth.uid()::text
                 and exists (select 1 from public.moments m
                              where m.id::text = (storage.foldername(name))[2] and m.user_id = auth.uid()))))
  );

-- ===========================================================================
-- 保活心跳表:GitHub Actions 每天寫入一筆(真正的資料庫活動),讓免費專案不會因閒置被自動暫停。
-- 一般使用者不能直接讀寫這張表,只能透過下面的 keepalive_ping() 打卡。
-- ===========================================================================
create table if not exists public.keepalive (
  id int primary key default 1,
  last_ping timestamptz not null default now()
);
alter table public.keepalive enable row level security;
revoke all on public.keepalive from anon, authenticated;

-- 保活「打卡」:每天由 GitHub Actions 用公開的 anon 金鑰呼叫一次,寫入一筆心跳(真正的資料庫寫入)。
-- 不需要任何機密金鑰。它只會更新上面這一格時間,別人就算呼叫也沒有任何影響。
create or replace function public.keepalive_ping()
returns timestamptz language sql security definer set search_path = public as $$
  insert into public.keepalive (id, last_ping) values (1, now())
  on conflict (id) do update set last_ping = excluded.last_ping
  returning last_ping;
$$;
revoke all on function public.keepalive_ping() from public;
grant execute on function public.keepalive_ping() to anon, authenticated;


-- 讓 API 立刻認得上面新增/修改的函式(Supabase 平常會自動做,這行是保險)
notify pgrst, 'reload schema';
