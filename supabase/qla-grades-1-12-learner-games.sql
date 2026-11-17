-- Quiz League Arena expansion: Grades 1-12 and learner-created games.
-- Preserves existing PIN flow, live scoring, answer records and learner history.
alter table public.qla_curriculum_topics drop constraint if exists qla_curriculum_topics_grade_check;
alter table public.qla_curriculum_topics add constraint qla_curriculum_topics_grade_check
 check (grade = any (array['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12']));
alter table public.qla_curriculum_topics drop constraint if exists qla_curriculum_topics_learning_area_check;
alter table public.qla_quizzes drop constraint if exists qla_quizzes_grade_check;
alter table public.qla_quizzes add constraint qla_quizzes_grade_check
 check (grade = any (array['Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6','Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12']));
alter table public.qla_quizzes drop constraint if exists qla_quizzes_learning_area_check;

drop policy if exists qla_curriculum_topics_teacher_read on public.qla_curriculum_topics;
create policy qla_curriculum_topics_authenticated_read on public.qla_curriculum_topics
 for select to authenticated using (true);

drop policy if exists qla_quiz_teacher_all on public.qla_quizzes;
create policy qla_quiz_owner_manage on public.qla_quizzes for all to authenticated
 using (created_by=(select auth.uid())) with check (created_by=(select auth.uid()));

drop policy if exists qla_question_teacher_all on public.qla_questions;
create policy qla_question_owner_manage on public.qla_questions for all to authenticated
 using (created_by=(select auth.uid()) and exists(select 1 from public.qla_quizzes q where q.id=quiz_id and q.created_by=(select auth.uid())))
 with check (created_by=(select auth.uid()) and exists(select 1 from public.qla_quizzes q where q.id=quiz_id and q.created_by=(select auth.uid())));

create or replace function public.qla_create_game(p_quiz_id uuid,p_seconds integer default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare q public.qla_quizzes%rowtype; g public.qla_games%rowtype; n int:=0; pin_code text;
begin
 if auth.uid() is null then raise exception 'Sign in before hosting a game'; end if;
 select * into q from public.qla_quizzes where id=p_quiz_id and status='published' and created_by=auth.uid();
 if not found then raise exception 'Select one of your own published quizzes'; end if;
 select count(*) into n from public.qla_questions where quiz_id=q.id;
 if n=0 then raise exception 'This quiz has no questions'; end if;
 if p_seconds is not null and p_seconds not in (10,20,30,60) then raise exception 'Choose a supported question timer'; end if;
 loop pin_code:=lpad((floor(random()*1000000))::int::text,6,'0');
  exit when not exists(select 1 from public.qla_games where pin=pin_code and status in ('lobby','active'));
 end loop;
 insert into public.qla_games(quiz_id,host_id,pin,grade,learning_area,status,seconds_per_question)
 values(q.id,auth.uid(),pin_code,q.grade,q.learning_area,'lobby',coalesce(p_seconds,q.default_time_seconds)) returning * into g;
 insert into public.qla_game_questions(game_id,question_no,question_id,type,question,options,correct_index,accepted_answers,explanation)
 select g.id,row_number() over(order by position),id,type,question,options,correct_index,accepted_answers,explanation from public.qla_questions where quiz_id=q.id order by position;
 return jsonb_build_object('game_id',g.id,'pin',g.pin,'status',g.status,'quiz_title',q.title,'grade',q.grade,'learning_area',q.learning_area,'question_count',n,'seconds_per_question',g.seconds_per_question);
end $$;

create or replace function public.qla_start_game(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare g public.qla_games%rowtype;
begin
 select * into g from public.qla_games where id=p_game_id for update;
 if not found or g.host_id is distinct from auth.uid() then raise exception 'Only the game host can start this game'; end if;
 if g.status<>'lobby' then raise exception 'This game is not in the lobby'; end if;
 if not exists(select 1 from public.qla_players where game_id=g.id) then raise exception 'Wait for at least one learner to join'; end if;
 update public.qla_games set status='active',current_question=1,question_started_at=now() where id=g.id;
 return public.qla_game_state(g.id,null,null);
end $$;

create or replace function public.qla_next_question(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare g public.qla_games%rowtype; total int;
begin
 select * into g from public.qla_games where id=p_game_id for update;
 if not found or g.host_id is distinct from auth.uid() then raise exception 'Only the game host can move to the next question'; end if;
 select count(*) into total from public.qla_game_questions where game_id=g.id;
 if g.status<>'active' then raise exception 'Game is not active'; end if;
 if g.current_question>=total then update public.qla_games set status='finished',finished_at=now() where id=g.id;
 else update public.qla_games set current_question=current_question+1,question_started_at=now() where id=g.id; end if;
 return public.qla_game_state(g.id,null,null);
end $$;

grant select on public.qla_curriculum_topics to authenticated;
grant select,insert,update,delete on public.qla_quizzes,public.qla_questions to authenticated;

-- Mixed difficulty is supported by the AI quiz builder.
alter table public.qla_quizzes drop constraint if exists qla_quizzes_difficulty_check;
alter table public.qla_quizzes add constraint qla_quizzes_difficulty_check check (difficulty = any (array['Easy','Medium','Hard','Mixed']));
