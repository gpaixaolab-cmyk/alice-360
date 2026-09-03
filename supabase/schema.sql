-- FYLAB Personal Classes
-- Execute este arquivo uma única vez no Supabase: SQL Editor > New query > Run.
-- Depois, crie imediatamente a primeira conta de professor pelo site.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'student')),
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  first_name text not null check (char_length(first_name) between 1 and 60),
  guardian_consent_at timestamptz not null,
  access_code_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  cefr_level text not null default 'A1–A2',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (student_id, course_id)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '',
  position integer not null default 1 check (position > 0),
  content jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  available_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  status text not null default 'started' check (status in ('started', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  updated_at timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  assessment_title text not null default 'Diagnóstico CEFR 360',
  kind text not null default 'diagnostic' check (kind in ('diagnostic', 'practice')),
  status text not null default 'submitted' check (status in ('in_progress', 'submitted', 'reviewed')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  objective_answers jsonb not null default '{}'::jsonb,
  writing jsonb not null default '{}'::jsonb,
  speaking_transcripts jsonb not null default '{}'::jsonb,
  domain_summary jsonb not null default '[]'::jsonb,
  narrative text not null default '',
  teacher_feedback text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists students_teacher_idx on public.students(teacher_id);
create index if not exists students_auth_user_idx on public.students(auth_user_id);
create index if not exists courses_teacher_idx on public.courses(teacher_id);
create index if not exists lessons_course_idx on public.lessons(course_id, position);
create index if not exists progress_student_idx on public.lesson_progress(student_id);
create index if not exists attempts_student_idx on public.attempts(student_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lessons_touch_updated_at on public.lessons;
create trigger lessons_touch_updated_at before update on public.lessons
for each row execute function public.touch_updated_at();

drop trigger if exists progress_touch_updated_at on public.lesson_progress;
create trigger progress_touch_updated_at before update on public.lesson_progress
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_role text;
begin
  if new.is_anonymous then
    assigned_role := 'student';
  elsif exists (select 1 from public.profiles where role = 'teacher') then
    assigned_role := 'student';
  else
    assigned_role := 'teacher';
  end if;

  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    assigned_role,
    nullif(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '')
  )
  on conflict (id) do nothing;

  if assigned_role = 'teacher' then
    insert into public.courses (teacher_id, title, description, cefr_level)
    values (
      new.id,
      'English Journey',
      'Aulas, atividades e acompanhamento individual.',
      'A1–A2'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

create or replace function public.create_student(
  p_name text,
  p_access_code text,
  p_guardian_consent boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_student_id uuid;
  default_course_id uuid;
  normalized_code text := upper(trim(p_access_code));
begin
  if not public.is_teacher() then
    raise exception 'Acesso exclusivo do professor.';
  end if;
  if char_length(trim(p_name)) < 1 then
    raise exception 'Informe o nome do aluno.';
  end if;
  if char_length(normalized_code) < 8 then
    raise exception 'Use um código com pelo menos 8 caracteres.';
  end if;
  if not p_guardian_consent then
    raise exception 'Confirme a autorização do responsável.';
  end if;
  if exists (
    select 1 from public.students
    where active and extensions.crypt(normalized_code, access_code_hash) = access_code_hash
  ) then
    raise exception 'Este código já está em uso.';
  end if;

  insert into public.students (
    teacher_id, first_name, guardian_consent_at, access_code_hash
  ) values (
    auth.uid(), trim(p_name), now(), extensions.crypt(normalized_code, extensions.gen_salt('bf'))
  ) returning id into new_student_id;

  select id into default_course_id
  from public.courses
  where teacher_id = auth.uid() and active
  order by created_at
  limit 1;

  if default_course_id is null then
    insert into public.courses (teacher_id, title, description, cefr_level)
    values (auth.uid(), 'English Journey', 'Aulas, atividades e acompanhamento individual.', 'A1–A2')
    returning id into default_course_id;
  end if;

  insert into public.enrollments (student_id, course_id)
  values (new_student_id, default_course_id)
  on conflict do nothing;

  return new_student_id;
end;
$$;

create or replace function public.claim_student_access(p_access_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_student public.students%rowtype;
  normalized_code text := upper(trim(p_access_code));
  anonymous_account boolean;
begin
  if auth.uid() is null then
    raise exception 'Faça a autenticação anônima antes de usar o código.';
  end if;

  select is_anonymous into anonymous_account from auth.users where id = auth.uid();
  if not coalesce(anonymous_account, false) then
    raise exception 'O código de aluno deve ser usado no acesso de aluno.';
  end if;

  select * into matched_student
  from public.students
  where active
    and extensions.crypt(normalized_code, access_code_hash) = access_code_hash
  order by created_at
  limit 1
  for update;

  if matched_student.id is null then
    raise exception 'Código não encontrado.';
  end if;
  if matched_student.auth_user_id is not null and matched_student.auth_user_id <> auth.uid() then
    raise exception 'Este código já está ligado a outro dispositivo. Peça um novo código ao professor.';
  end if;

  update public.students set auth_user_id = auth.uid() where id = matched_student.id;
  update public.profiles set display_name = matched_student.first_name where id = auth.uid();
  return matched_student.id;
end;
$$;

create or replace function public.reset_student_access(
  p_student_id uuid,
  p_new_access_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(trim(p_new_access_code));
begin
  if not public.is_teacher() then
    raise exception 'Acesso exclusivo do professor.';
  end if;
  if char_length(normalized_code) < 8 then
    raise exception 'Use um código com pelo menos 8 caracteres.';
  end if;

  update public.students
  set auth_user_id = null,
      access_code_hash = extensions.crypt(normalized_code, extensions.gen_salt('bf'))
  where id = p_student_id and teacher_id = auth.uid();

  if not found then
    raise exception 'Aluno não encontrado.';
  end if;
end;
$$;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self" on public.profiles for select
using (id = auth.uid());

drop policy if exists "teachers_manage_students" on public.students;
create policy "teachers_manage_students" on public.students for all
using (teacher_id = auth.uid() and public.is_teacher())
with check (teacher_id = auth.uid() and public.is_teacher());

drop policy if exists "students_read_self" on public.students;
create policy "students_read_self" on public.students for select
using (auth_user_id = auth.uid());

drop policy if exists "teachers_manage_courses" on public.courses;
create policy "teachers_manage_courses" on public.courses for all
using (teacher_id = auth.uid() and public.is_teacher())
with check (teacher_id = auth.uid() and public.is_teacher());

drop policy if exists "students_read_enrolled_courses" on public.courses;
create policy "students_read_enrolled_courses" on public.courses for select
using (exists (
  select 1 from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.course_id = courses.id and s.auth_user_id = auth.uid()
));

drop policy if exists "teachers_manage_enrollments" on public.enrollments;
create policy "teachers_manage_enrollments" on public.enrollments for all
using (exists (
  select 1 from public.students s
  where s.id = enrollments.student_id and s.teacher_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = enrollments.student_id and s.teacher_id = auth.uid()
));

drop policy if exists "students_read_own_enrollments" on public.enrollments;
create policy "students_read_own_enrollments" on public.enrollments for select
using (exists (
  select 1 from public.students s
  where s.id = enrollments.student_id and s.auth_user_id = auth.uid()
));

drop policy if exists "teachers_manage_lessons" on public.lessons;
create policy "teachers_manage_lessons" on public.lessons for all
using (exists (
  select 1 from public.courses c
  where c.id = lessons.course_id and c.teacher_id = auth.uid()
))
with check (exists (
  select 1 from public.courses c
  where c.id = lessons.course_id and c.teacher_id = auth.uid()
));

drop policy if exists "students_read_published_lessons" on public.lessons;
create policy "students_read_published_lessons" on public.lessons for select
using (
  published
  and (available_at is null or available_at <= now())
  and exists (
    select 1 from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.course_id = lessons.course_id and s.auth_user_id = auth.uid()
  )
);

drop policy if exists "teachers_read_progress" on public.lesson_progress;
create policy "teachers_read_progress" on public.lesson_progress for select
using (exists (
  select 1 from public.students s
  where s.id = lesson_progress.student_id and s.teacher_id = auth.uid()
));

drop policy if exists "students_manage_own_progress" on public.lesson_progress;
create policy "students_manage_own_progress" on public.lesson_progress for all
using (exists (
  select 1 from public.students s
  where s.id = lesson_progress.student_id and s.auth_user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = lesson_progress.student_id and s.auth_user_id = auth.uid()
));

drop policy if exists "teachers_manage_attempts" on public.attempts;
create policy "teachers_manage_attempts" on public.attempts for all
using (exists (
  select 1 from public.students s
  where s.id = attempts.student_id and s.teacher_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = attempts.student_id and s.teacher_id = auth.uid()
));

drop policy if exists "students_manage_own_attempts" on public.attempts;
create policy "students_manage_own_attempts" on public.attempts for all
using (exists (
  select 1 from public.students s
  where s.id = attempts.student_id and s.auth_user_id = auth.uid()
))
with check (exists (
  select 1 from public.students s
  where s.id = attempts.student_id and s.auth_user_id = auth.uid()
));

revoke all on function public.create_student(text, text, boolean) from public;
revoke all on function public.claim_student_access(text) from public;
revoke all on function public.reset_student_access(uuid, text) from public;
grant execute on function public.create_student(text, text, boolean) to authenticated;
grant execute on function public.claim_student_access(text) to authenticated;
grant execute on function public.reset_student_access(uuid, text) to authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select, insert, update, delete on public.courses to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
grant select, insert, update, delete on public.lessons to authenticated;
grant select, insert, update, delete on public.lesson_progress to authenticated;
grant select, insert, update, delete on public.attempts to authenticated;

