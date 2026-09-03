"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Profile = { id: string; role: "teacher" | "student"; display_name: string | null };
type Student = { id: string; teacher_id: string; auth_user_id: string | null; first_name: string; active: boolean; created_at: string };
type Course = { id: string; teacher_id: string; title: string; description: string; cefr_level: string; active: boolean };
type Lesson = { id: string; course_id: string; title: string; summary: string; position: number; content: { type?: string; body?: string }[]; published: boolean; updated_at: string };
type LessonProgress = { id: string; student_id: string; lesson_id: string; status: "started" | "completed"; progress: number; updated_at: string };
type Attempt = {
  id: string;
  student_id: string;
  assessment_title: string;
  status: string;
  submitted_at: string | null;
  writing: Record<string, string>;
  speaking_transcripts: Record<string, { transcript?: string } | string>;
  domain_summary: { name: string; band: string; note: string }[];
  narrative: string;
  teacher_feedback: string;
};

export type ExamContext = {
  student: Student;
  onExit: () => void;
  onSubmitted: () => void;
};

export function PortalShell({ renderExam }: { renderExam: (context: ExamContext) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [identityError, setIdentityError] = useState("");

  const loadIdentity = useCallback(async (currentSession: Session | null) => {
    setSession(currentSession);
    setIdentityError("");
    if (!currentSession) {
      setProfile(null);
      setStudent(null);
      setLoading(false);
      return;
    }
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", currentSession.user.id)
      .maybeSingle();
    if (profileError) setIdentityError(profileError.message);
    setProfile(profileData as Profile | null);
    if (profileData?.role === "student") {
      const { data } = await supabase
        .from("students")
        .select("id, teacher_id, auth_user_id, first_name, active, created_at")
        .eq("auth_user_id", currentSession.user.id)
        .maybeSingle();
      setStudent(data as Student | null);
    } else {
      setStudent(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => loadIdentity(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => loadIdentity(nextSession), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [loadIdentity]);

  if (loading) return <FullScreenLoading label="Abrindo seu ambiente…" />;
  if (!session) return <AccessScreen onAuthenticated={() => supabase.auth.getSession().then(({ data }) => loadIdentity(data.session))} />;
  if (identityError && !profile) return <SetupRequired message={identityError} onSignOut={() => supabase.auth.signOut()} />;
  if (profile?.role === "teacher") return <TeacherDashboard profile={profile} onSignOut={() => supabase.auth.signOut()} />;
  if (!student) return <StudentCodeScreen session={session} onClaimed={() => loadIdentity(session)} onSignOut={() => supabase.auth.signOut()} />;
  return <StudentDashboard student={student} onSignOut={() => supabase.auth.signOut()} renderExam={renderExam} />;
}

function FullScreenLoading({ label }: { label: string }) {
  return <main className="grid min-h-screen place-items-center px-6 text-slate-100"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-cyan-300" /><p className="mt-4 text-sm text-slate-400">{label}</p></div></main>;
}

function AccessScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"student" | "teacher">("student");
  const [teacherMode, setTeacherMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function studentAccess(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) {
      setMessage(error?.message || "Não foi possível iniciar o acesso de aluno.");
      setBusy(false); return;
    }
    const { error: claimError } = await supabase.rpc("claim_student_access", { p_access_code: code });
    if (claimError) {
      await supabase.auth.signOut();
      setMessage(claimError.message);
      setBusy(false); return;
    }
    onAuthenticated();
  }

  async function teacherAccess(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    if (teacherMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name }, emailRedirectTo: window.location.href },
      });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Conta criada. Confirme o e-mail e depois entre como professora.");
      else onAuthenticated();
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message); else onAuthenticated();
    }
    setBusy(false);
  }

  return <main className="min-h-screen px-4 py-8 text-slate-100 sm:px-8 sm:py-14">
    <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#081827]/90 shadow-2xl shadow-black/30 lg:grid-cols-[1.05fr_.95fr]">
      <section className="signal-grid flex min-h-[370px] flex-col justify-between border-0 p-7 sm:p-12 lg:min-h-[680px] lg:border-r lg:border-white/10">
        <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300 text-[#071321]"><GraduationCap /></div><div><p className="font-semibold tracking-tight">FYLAB Personal Classes</p><p className="text-xs text-slate-400">learning hub</p></div></div>
        <div className="max-w-xl"><p className="eyebrow">Aulas particulares • CEFR</p><h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-.04em] sm:text-6xl">Inglês acompanhado de verdade.</h1><p className="mt-5 max-w-lg leading-7 text-slate-300">Aulas, atividades, progresso e avaliações descritivas em um só lugar — no ritmo de cada aluno.</p></div>
        <p className="text-xs leading-5 text-slate-500">Ambiente privado. O professor controla alunos e conteúdos.</p>
      </section>
      <section className="flex items-center p-6 sm:p-10 lg:p-14"><div className="w-full">
        <div className="grid grid-cols-2 rounded-xl bg-white/5 p-1"><button onClick={() => { setMode("student"); setMessage(""); }} className={`rounded-lg px-4 py-3 text-sm transition ${mode === "student" ? "bg-cyan-300 font-medium text-[#071321]" : "text-slate-400"}`}>Sou aluno</button><button onClick={() => { setMode("teacher"); setMessage(""); }} className={`rounded-lg px-4 py-3 text-sm transition ${mode === "teacher" ? "bg-cyan-300 font-medium text-[#071321]" : "text-slate-400"}`}>Sou professora</button></div>
        {mode === "student" ? <form onSubmit={studentAccess} className="mt-8"><p className="eyebrow">Entrada do aluno</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Qual é o seu código?</h2><p className="mt-3 text-sm leading-6 text-slate-400">Use o código de 8 ou mais caracteres enviado pela professora.</p><label className="mt-7 block text-xs font-medium uppercase tracking-wider text-slate-400">Código de acesso</label><Input autoFocus required minLength={8} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="EX.: ALICE-27" className="mt-2 h-12 border-white/10 bg-[#06101d] text-base uppercase tracking-widest" /><Button disabled={busy || code.trim().length < 8} className="mt-4 h-12 w-full bg-cyan-300 text-[#071321] hover:bg-cyan-200">{busy ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}Entrar no meu espaço</Button></form> : <form onSubmit={teacherAccess} className="mt-8"><p className="eyebrow">Área da professora</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{teacherMode === "login" ? "Acompanhe seus alunos" : "Crie sua conta principal"}</h2>{teacherMode === "signup" && <><label className="mt-6 block text-xs font-medium uppercase tracking-wider text-slate-400">Seu nome</label><Input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 border-white/10 bg-[#06101d]" /></>}<label className={`${teacherMode === "signup" ? "mt-4" : "mt-7"} block text-xs font-medium uppercase tracking-wider text-slate-400`}>E-mail</label><Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 border-white/10 bg-[#06101d]" /><label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-400">Senha</label><Input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 border-white/10 bg-[#06101d]" /><Button disabled={busy} className="mt-5 h-12 w-full bg-cyan-300 text-[#071321] hover:bg-cyan-200">{busy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}{teacherMode === "login" ? "Entrar como professora" : "Criar conta da professora"}</Button><button type="button" onClick={() => { setTeacherMode(teacherMode === "login" ? "signup" : "login"); setMessage(""); }} className="mt-4 w-full text-center text-xs text-cyan-200 hover:text-cyan-100">{teacherMode === "login" ? "Primeiro acesso? Criar conta" : "Já tenho conta"}</button></form>}
        {message && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm leading-5 text-amber-100">{message}</div>}
      </div></section>
    </div>
  </main>;
}

function SetupRequired({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return <main className="grid min-h-screen place-items-center px-5"><div className="exam-card max-w-xl text-center"><ShieldCheck className="mx-auto text-amber-300" /><h1 className="mt-4 text-2xl font-semibold">O banco ainda precisa ser ativado</h1><p className="mt-3 text-sm leading-6 text-slate-400">Execute o arquivo <b>supabase/schema.sql</b> no SQL Editor do projeto e tente novamente.</p><p className="mt-4 rounded-lg bg-white/5 p-3 text-left text-xs text-slate-500">{message}</p><Button variant="outline" className="mt-5 border-white/10 bg-white/5 text-white" onClick={onSignOut}>Voltar</Button></div></main>;
}

function StudentCodeScreen({ session, onClaimed, onSignOut }: { session: Session; onClaimed: () => void; onSignOut: () => void }) {
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function claim(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); const { error } = await supabase.rpc("claim_student_access", { p_access_code: code }); if (error) setMessage(error.message); else onClaimed(); setBusy(false); }
  return <main className="grid min-h-screen place-items-center px-5"><form onSubmit={claim} className="exam-card w-full max-w-md"><p className="eyebrow">Concluir acesso</p><h1 className="mt-3 text-3xl font-semibold">Código do aluno</h1><Input required minLength={8} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="mt-6 h-12 border-white/10 bg-[#06101d] uppercase tracking-widest" /><Button disabled={busy || !session.user.is_anonymous} className="mt-4 w-full bg-cyan-300 text-[#071321]">{busy ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}Confirmar</Button>{message && <p className="mt-4 text-sm text-amber-200">{message}</p>}<button type="button" onClick={onSignOut} className="mt-5 w-full text-xs text-slate-500">Sair</button></form></main>;
}

type TeacherTab = "overview" | "students" | "lessons" | "results";

function TeacherDashboard({ profile, onSignOut }: { profile: Profile; onSignOut: () => void }) {
  const [tab, setTab] = useState<TeacherTab>("overview");
  const [students, setStudents] = useState<Student[]>([]); const [courses, setCourses] = useState<Course[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]); const [progress, setProgress] = useState<LessonProgress[]>([]); const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true); const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setMessage("");
    const [studentResult, courseResult, lessonResult, progressResult, attemptResult] = await Promise.all([
      supabase.from("students").select("id, teacher_id, auth_user_id, first_name, active, created_at").order("first_name"),
      supabase.from("courses").select("id, teacher_id, title, description, cefr_level, active").order("created_at"),
      supabase.from("lessons").select("id, course_id, title, summary, position, content, published, updated_at").order("position"),
      supabase.from("lesson_progress").select("id, student_id, lesson_id, status, progress, updated_at"),
      supabase.from("attempts").select("id, student_id, assessment_title, status, submitted_at, writing, speaking_transcripts, domain_summary, narrative, teacher_feedback").order("created_at", { ascending: false }),
    ]);
    const error = studentResult.error || courseResult.error || lessonResult.error || progressResult.error || attemptResult.error;
    if (error) setMessage(error.message);
    setStudents((studentResult.data || []) as Student[]); setCourses((courseResult.data || []) as Course[]);
    setLessons((lessonResult.data || []) as Lesson[]); setProgress((progressResult.data || []) as LessonProgress[]); setAttempts((attemptResult.data || []) as Attempt[]);
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const stats = useMemo(() => ({
    activeStudents: students.filter((item) => item.active).length,
    publishedLessons: lessons.filter((item) => item.published).length,
    pendingReviews: attempts.filter((item) => item.status !== "reviewed").length,
    completions: progress.filter((item) => item.status === "completed").length,
  }), [students, lessons, attempts, progress]);

  return <PortalFrame name={profile.display_name || "Professora"} role="Professora" onSignOut={onSignOut} nav={<>{([
    ["overview", LayoutDashboard, "Visão geral"], ["students", Users, "Alunos"], ["lessons", BookOpen, "Conteúdos"], ["results", ClipboardCheck, "Resultados"],
  ] as const).map(([key, Icon, label]) => <button key={key} onClick={() => setTab(key)} className={`portal-nav-item ${tab === key ? "portal-nav-active" : ""}`}><Icon size={18} />{label}{key === "results" && stats.pendingReviews > 0 && <span className="ml-auto rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-bold text-[#071321]">{stats.pendingReviews}</span>}</button>)}</>}>
    {message && <div className="mb-5 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</div>}
    {loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-cyan-300" /></div> : <>
      {tab === "overview" && <TeacherOverview stats={stats} students={students} lessons={lessons} attempts={attempts} progress={progress} onNavigate={setTab} />}
      {tab === "students" && <StudentsManager students={students} lessons={lessons} progress={progress} refresh={refresh} setMessage={setMessage} />}
      {tab === "lessons" && <LessonsManager courses={courses} lessons={lessons} refresh={refresh} setMessage={setMessage} />}
      {tab === "results" && <ResultsManager students={students} attempts={attempts} refresh={refresh} setMessage={setMessage} />}
    </>}
  </PortalFrame>;
}

function PortalFrame({ name, role, onSignOut, nav, children }: { name: string; role: string; onSignOut: () => void; nav: ReactNode; children: ReactNode }) {
  return <main className="min-h-screen text-slate-100"><aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[#06101d]/95 p-5 backdrop-blur-xl lg:flex lg:flex-col"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-300 text-[#071321]"><GraduationCap size={21} /></div><div><p className="font-semibold">FYLAB</p><p className="text-[11px] text-slate-500">Personal Classes</p></div></div><nav className="mt-10 space-y-2">{nav}</nav><div className="mt-auto rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="truncate text-sm font-medium">{name}</p><p className="mt-1 text-xs text-slate-500">{role}</p><button onClick={onSignOut} className="mt-4 flex items-center gap-2 text-xs text-slate-400 hover:text-white"><LogOut size={14} />Sair</button></div></aside><header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#06101d]/90 px-4 py-3 backdrop-blur-xl lg:hidden"><div className="flex items-center gap-2 font-semibold"><GraduationCap className="text-cyan-300" />FYLAB</div><button onClick={onSignOut} aria-label="Sair"><LogOut size={18} /></button></header><div className="lg:pl-64"><div className="mx-auto max-w-7xl p-4 sm:p-8 lg:p-10"><div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">{nav}</div>{children}</div></div></main>;
}

function TeacherOverview({ stats, students, lessons, attempts, progress, onNavigate }: any) {
  const cards = [[Users, "Alunos ativos", stats.activeStudents], [BookOpen, "Aulas publicadas", stats.publishedLessons], [ClipboardCheck, "Pareceres a revisar", stats.pendingReviews], [Check, "Atividades concluídas", stats.completions]];
  return <div><p className="eyebrow">Painel pedagógico</p><h1 className="portal-title">Visão geral da turma</h1><p className="portal-subtitle">Acompanhe o que foi disponibilizado, realizado e enviado para sua análise.</p><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([Icon, label, value]: any) => <article key={label} className="soft-card"><Icon className="text-cyan-300" size={20} /><p className="mt-5 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></article>)}</div><div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><section className="exam-card"><div className="flex items-center justify-between"><div><h2 className="text-lg font-medium">Progresso por aluno</h2><p className="mt-1 text-xs text-slate-500">Conteúdos publicados e concluídos</p></div><button onClick={() => onNavigate("students")} className="text-xs text-cyan-200">Ver alunos</button></div><div className="mt-5 space-y-5">{students.length ? students.slice(0, 6).map((student: Student) => { const relevant = progress.filter((item: LessonProgress) => item.student_id === student.id && item.status === "completed").length; const total = Math.max(lessons.filter((item: Lesson) => item.published).length, 1); const pct = Math.round(relevant / total * 100); return <div key={student.id}><div className="mb-2 flex justify-between text-sm"><span>{student.first_name}</span><span className="text-slate-500">{pct}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${pct}%` }} /></div></div> }) : <EmptyText text="Cadastre seu primeiro aluno para começar." />}</div></section><section className="exam-card"><div className="flex items-center justify-between"><div><h2 className="text-lg font-medium">Últimos diagnósticos</h2><p className="mt-1 text-xs text-slate-500">Resultados sem nota numérica</p></div><button onClick={() => onNavigate("results")} className="text-xs text-cyan-200">Abrir resultados</button></div><div className="mt-5 space-y-3">{attempts.length ? attempts.slice(0, 4).map((attempt: Attempt) => <div key={attempt.id} className="rounded-xl border border-white/8 bg-white/[.025] p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm">{students.find((student: Student) => student.id === attempt.student_id)?.first_name || "Aluno"}</span><span className={`text-[10px] ${attempt.status === "reviewed" ? "text-emerald-300" : "text-amber-300"}`}>{attempt.status === "reviewed" ? "revisado" : "aguardando"}</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(attempt.submitted_at)}</p></div>) : <EmptyText text="Ainda não há diagnósticos enviados." />}</div></section></div></div>;
}

function StudentsManager({ students, lessons, progress, refresh, setMessage }: any) {
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false); const [createdCode, setCreatedCode] = useState("");
  function newCode() { const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let value = ""; crypto.getRandomValues(new Uint32Array(8)).forEach((number) => value += chars[number % chars.length]); setCode(value); }
  async function addStudent(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); const { error } = await supabase.rpc("create_student", { p_name: name, p_access_code: code, p_guardian_consent: consent }); if (error) setMessage(error.message); else { setCreatedCode(code); setName(""); setCode(""); setConsent(false); await refresh(); } setBusy(false); }
  async function resetAccess(student: Student) { const freshCode = window.prompt(`Digite o novo código de ${student.first_name} (mínimo 8 caracteres):`); if (!freshCode) return; const { error } = await supabase.rpc("reset_student_access", { p_student_id: student.id, p_new_access_code: freshCode }); if (error) setMessage(error.message); else setMessage(`Novo código de ${student.first_name}: ${freshCode.toUpperCase()}. Envie e guarde este código.`); }
  return <div><p className="eyebrow">Gestão de acesso</p><h1 className="portal-title">Alunos</h1><p className="portal-subtitle">Cadastre somente o primeiro nome e entregue um código individual.</p><div className="mt-8 grid gap-6 xl:grid-cols-[.72fr_1.28fr]"><form onSubmit={addStudent} className="exam-card h-fit"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/10 text-cyan-200"><Plus size={18} /></div><h2 className="font-medium">Novo aluno</h2></div><label className="mt-6 block text-xs uppercase tracking-wider text-slate-500">Primeiro nome</label><Input required value={name} onChange={(event) => setName(event.target.value)} className="mt-2 border-white/10 bg-[#06101d]" /><label className="mt-4 block text-xs uppercase tracking-wider text-slate-500">Código de acesso</label><div className="mt-2 flex gap-2"><Input required minLength={8} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className="border-white/10 bg-[#06101d] uppercase tracking-widest" /><Button type="button" variant="outline" onClick={newCode} title="Gerar código" className="border-white/10 bg-white/5 text-white"><RefreshCcw /></Button></div><label className="mt-5 flex cursor-pointer gap-3 rounded-xl border border-white/10 p-3"><Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} /><span className="text-xs leading-5 text-slate-400">Confirmo que o responsável autorizou o uso pedagógico dos dados e das transcrições.</span></label><Button disabled={busy || !consent} className="mt-5 w-full bg-cyan-300 text-[#071321]">{busy ? <LoaderCircle className="animate-spin" /> : <Plus />}Cadastrar aluno</Button>{createdCode && <div className="mt-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4"><p className="text-xs text-emerald-200">Código criado — copie agora</p><p className="mt-2 text-xl font-semibold tracking-widest">{createdCode}</p><p className="mt-2 text-[11px] leading-4 text-slate-400">Por segurança, ele não será mostrado novamente.</p></div>}</form><section className="exam-card"><h2 className="font-medium">Turma atual</h2><div className="mt-5 space-y-3">{students.length ? students.map((student: Student) => { const done = progress.filter((item: LessonProgress) => item.student_id === student.id && item.status === "completed").length; const total = lessons.filter((item: Lesson) => item.published).length; return <article key={student.id} className="flex flex-col gap-4 rounded-xl border border-white/8 bg-white/[.025] p-4 sm:flex-row sm:items-center"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-300/10 text-cyan-200"><UserRound size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium">{student.first_name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] ${student.auth_user_id ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-200"}`}>{student.auth_user_id ? "acesso ativo" : "aguardando primeiro acesso"}</span></div><p className="mt-1 text-xs text-slate-500">{done} de {total} conteúdos concluídos</p></div><Button variant="outline" onClick={() => resetAccess(student)} className="border-white/10 bg-white/5 text-xs text-slate-200 hover:bg-white/10 hover:text-white"><RefreshCcw />Novo código</Button></article> }) : <EmptyText text="Nenhum aluno cadastrado." />}</div></section></div></div>;
}

function LessonsManager({ courses, lessons, refresh, setMessage }: any) {
  const [title, setTitle] = useState(""); const [summary, setSummary] = useState(""); const [body, setBody] = useState(""); const [published, setPublished] = useState(false); const [busy, setBusy] = useState(false);
  const course = courses[0] as Course | undefined;
  async function addLesson(event: FormEvent) { event.preventDefault(); if (!course) return; setBusy(true); setMessage(""); const { error } = await supabase.from("lessons").insert({ course_id: course.id, title, summary, position: lessons.length + 1, content: [{ type: "text", body }], published }); if (error) setMessage(error.message); else { setTitle(""); setSummary(""); setBody(""); setPublished(false); await refresh(); } setBusy(false); }
  async function toggleLesson(lesson: Lesson) { const { error } = await supabase.from("lessons").update({ published: !lesson.published }).eq("id", lesson.id); if (error) setMessage(error.message); else refresh(); }
  return <div><p className="eyebrow">Sala de aula</p><h1 className="portal-title">Conteúdos e aulas</h1><p className="portal-subtitle">Prepare materiais curtos, publique quando estiverem prontos e acompanhe a conclusão.</p><div className="mt-8 grid gap-6 xl:grid-cols-[.82fr_1.18fr]"><form onSubmit={addLesson} className="exam-card h-fit"><h2 className="font-medium">Criar conteúdo</h2><p className="mt-1 text-xs text-slate-500">Curso: {course?.title || "carregando…"}</p><label className="mt-6 block text-xs uppercase tracking-wider text-slate-500">Título da aula</label><Input required value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 border-white/10 bg-[#06101d]" /><label className="mt-4 block text-xs uppercase tracking-wider text-slate-500">Resumo</label><Input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="O que o aluno vai praticar?" className="mt-2 border-white/10 bg-[#06101d]" /><label className="mt-4 block text-xs uppercase tracking-wider text-slate-500">Material da aula</label><Textarea required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Escreva explicações, exemplos, vocabulário, tarefas e links…" className="mt-2 min-h-56 border-white/10 bg-[#06101d] leading-7" /><label className="mt-5 flex cursor-pointer items-center gap-3 text-sm"><Checkbox checked={published} onCheckedChange={(value) => setPublished(value === true)} />Publicar agora para os alunos</label><Button disabled={busy || !course} className="mt-5 w-full bg-cyan-300 text-[#071321]">{busy ? <LoaderCircle className="animate-spin" /> : <Plus />}Salvar conteúdo</Button></form><section className="space-y-4">{lessons.length ? lessons.map((lesson: Lesson) => <article key={lesson.id} className="exam-card"><div className="flex items-start gap-4"><span className="number-chip">{String(lesson.position).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{lesson.title}</h3><p className="mt-1 text-xs text-slate-500">{lesson.summary || "Sem resumo"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] ${lesson.published ? "bg-emerald-300/10 text-emerald-200" : "bg-white/5 text-slate-400"}`}>{lesson.published ? "publicado" : "rascunho"}</span></div><p className="mt-4 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-400">{lesson.content?.[0]?.body}</p><Button variant="outline" onClick={() => toggleLesson(lesson)} className="mt-4 border-white/10 bg-white/5 text-xs text-white">{lesson.published ? "Retirar publicação" : "Publicar"}</Button></div></div></article>) : <div className="exam-card"><EmptyText text="Crie o primeiro conteúdo da turma." /></div>}</section></div></div>;
}

function ResultsManager({ students, attempts, refresh, setMessage }: any) {
  const [selected, setSelected] = useState<Attempt | null>(attempts[0] || null); const [feedback, setFeedback] = useState(selected?.teacher_feedback || ""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!selected && attempts[0]) { setSelected(attempts[0]); setFeedback(attempts[0].teacher_feedback || ""); } }, [attempts, selected]);
  function choose(attempt: Attempt) { setSelected(attempt); setFeedback(attempt.teacher_feedback || ""); }
  async function saveFeedback() { if (!selected) return; setBusy(true); const { error } = await supabase.from("attempts").update({ teacher_feedback: feedback, status: "reviewed", reviewed_at: new Date().toISOString() }).eq("id", selected.id); if (error) setMessage(error.message); else { setMessage("Parecer da professora salvo."); await refresh(); setSelected({ ...selected, teacher_feedback: feedback, status: "reviewed" }); } setBusy(false); }
  if (!attempts.length) return <div><p className="eyebrow">Avaliação descritiva</p><h1 className="portal-title">Resultados</h1><div className="mt-8 exam-card"><EmptyText text="Os diagnósticos aparecerão aqui assim que forem enviados." /></div></div>;
  return <div><p className="eyebrow">Avaliação descritiva</p><h1 className="portal-title">Resultados</h1><p className="portal-subtitle">Leia as evidências, confira as produções e complemente o parecer automático.</p><div className="mt-8 grid gap-6 xl:grid-cols-[330px_1fr]"><aside className="space-y-3">{attempts.map((attempt: Attempt) => <button key={attempt.id} onClick={() => choose(attempt)} className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === attempt.id ? "border-cyan-300/35 bg-cyan-300/10" : "border-white/8 bg-white/[.025] hover:border-white/15"}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{students.find((item: Student) => item.id === attempt.student_id)?.first_name || "Aluno"}</span><span className={`text-[10px] ${attempt.status === "reviewed" ? "text-emerald-300" : "text-amber-300"}`}>{attempt.status === "reviewed" ? "revisado" : "novo"}</span></div><p className="mt-2 text-xs text-slate-500">{formatDate(attempt.submitted_at)}</p></button>)}</aside>{selected && <section className="space-y-5"><article className="exam-card"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">{selected.assessment_title}</p><h2 className="mt-2 text-2xl font-semibold">{students.find((item: Student) => item.id === selected.student_id)?.first_name}</h2></div><Button variant="outline" onClick={() => window.print()} className="border-white/10 bg-white/5 text-white"><FileText />Imprimir</Button></div><p className="mt-6 leading-8 text-slate-300">{selected.narrative}</p></article><div className="grid gap-4 md:grid-cols-2">{selected.domain_summary?.map((domain) => <article key={domain.name} className="soft-card"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-medium">{domain.name}</h3><span className="rounded-full bg-cyan-300/10 px-2 py-1 text-right text-[10px] text-cyan-200">{domain.band}</span></div><p className="mt-3 text-xs leading-5 text-slate-400">{domain.note}</p></article>)}</div><article className="exam-card"><h3 className="font-medium">Produção escrita</h3>{Object.entries(selected.writing || {}).map(([key, value]) => <div key={key} className="mt-4 rounded-xl bg-white/[.03] p-4"><p className="text-xs uppercase text-slate-500">{key === "w1" ? "Resposta a um amigo" : "Viagem em família"}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{value || "Sem resposta"}</p></div>)}</article><article className="exam-card"><h3 className="font-medium">Transcrições da fala</h3><div className="mt-4 space-y-3">{Object.entries(selected.speaking_transcripts || {}).map(([key, value]) => <div key={key} className="rounded-xl bg-white/[.03] p-4"><p className="text-xs uppercase text-slate-500">Tarefa {key.replace("s", "")}</p><p className="mt-2 text-sm leading-6 text-slate-300">{typeof value === "string" ? value : value?.transcript || "Sem transcrição"}</p></div>)}</div></article><article className="exam-card"><h3 className="font-medium">Parecer da professora</h3><p className="mt-1 text-xs leading-5 text-slate-500">Acrescente observações de fluência, pronúncia, autonomia e próximos passos.</p><Textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} className="mt-4 min-h-40 border-white/10 bg-[#06101d] leading-7" /><Button onClick={saveFeedback} disabled={busy} className="mt-4 bg-cyan-300 text-[#071321]">{busy ? <LoaderCircle className="animate-spin" /> : <Check />}Salvar e marcar como revisado</Button></article></section>}</div></div>;
}

function StudentDashboard({ student, onSignOut, renderExam }: { student: Student; onSignOut: () => void; renderExam: (context: ExamContext) => ReactNode }) {
  const [view, setView] = useState<"home" | "lessons" | "exam">("home"); const [lessons, setLessons] = useState<Lesson[]>([]); const [progress, setProgress] = useState<LessonProgress[]>([]); const [course, setCourse] = useState<Course | null>(null); const [loading, setLoading] = useState(true); const [message, setMessage] = useState(""); const [openLesson, setOpenLesson] = useState<string | null>(null); const [examSent, setExamSent] = useState(false);
  const refresh = useCallback(async () => { setLoading(true); const { data: enrollment } = await supabase.from("enrollments").select("course_id").eq("student_id", student.id).limit(1).maybeSingle(); if (enrollment?.course_id) { const [courseResult, lessonResult, progressResult] = await Promise.all([supabase.from("courses").select("id, teacher_id, title, description, cefr_level, active").eq("id", enrollment.course_id).single(), supabase.from("lessons").select("id, course_id, title, summary, position, content, published, updated_at").eq("course_id", enrollment.course_id).order("position"), supabase.from("lesson_progress").select("id, student_id, lesson_id, status, progress, updated_at").eq("student_id", student.id)]); setCourse(courseResult.data as Course); setLessons((lessonResult.data || []) as Lesson[]); setProgress((progressResult.data || []) as LessonProgress[]); } setLoading(false); }, [student.id]);
  useEffect(() => { refresh(); }, [refresh]);
  const completed = progress.filter((item) => item.status === "completed").length; const percentage = lessons.length ? Math.round(completed / lessons.length * 100) : 0;
  async function completeLesson(lesson: Lesson) { const { error } = await supabase.from("lesson_progress").upsert({ student_id: student.id, lesson_id: lesson.id, status: "completed", progress: 100 }, { onConflict: "student_id,lesson_id" }); if (error) setMessage(error.message); else { setMessage("Conteúdo marcado como concluído."); refresh(); } }
  if (view === "exam") return <>{renderExam({ student, onExit: () => { setView("home"); refresh(); }, onSubmitted: () => { setExamSent(true); refresh(); } })}</>;
  const nav = <>{([["home", LayoutDashboard, "Início"], ["lessons", BookOpen, "Minhas aulas"]] as const).map(([key, Icon, label]) => <button key={key} onClick={() => setView(key)} className={`portal-nav-item ${view === key ? "portal-nav-active" : ""}`}><Icon size={18} />{label}</button>)}</>;
  return <PortalFrame name={student.first_name} role="Aluno" onSignOut={onSignOut} nav={nav}>{message && <div className="mb-5 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">{message}</div>}{loading ? <div className="grid min-h-80 place-items-center"><LoaderCircle className="animate-spin text-cyan-300" /></div> : view === "home" ? <div><p className="eyebrow">Olá, {student.first_name}</p><h1 className="portal-title">Seu espaço de inglês</h1><p className="portal-subtitle">Continue de onde parou e mostre o que você já consegue fazer.</p><div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><article className="exam-card signal-grid border-white/10"><p className="text-sm text-cyan-100">{course?.title}</p><p className="mt-4 text-5xl font-semibold">{percentage}%</p><p className="mt-2 text-sm text-slate-400">{completed} de {lessons.length} conteúdos concluídos</p><div className="mt-6 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${percentage}%` }} /></div><Button onClick={() => setView("lessons")} className="mt-6 bg-cyan-300 text-[#071321]">Abrir minhas aulas</Button></article><article className="exam-card border-emerald-300/15"><div className="flex items-start justify-between gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200"><Sparkles /></div><span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-400">CEFR • sem nota</span></div><h2 className="mt-5 text-xl font-medium">Diagnóstico 360</h2><p className="mt-2 text-sm leading-6 text-slate-400">Escuta, leitura, língua, escrita e fala. O resultado é um parecer, não uma nota.</p><Button onClick={() => setView("exam")} className="mt-6 bg-emerald-300 text-[#071321] hover:bg-emerald-200">{examSent ? "Fazer nova aplicação" : "Iniciar diagnóstico"}</Button></article></div></div> : <div><div className="flex items-center gap-3"><Button variant="ghost" onClick={() => setView("home")} className="text-slate-400"><ArrowLeft />Voltar</Button></div><p className="eyebrow mt-5">{course?.cefr_level}</p><h1 className="portal-title">Minhas aulas</h1><p className="portal-subtitle">Leia o conteúdo e marque como concluído quando terminar.</p><div className="mt-8 space-y-4">{lessons.length ? lessons.map((lesson) => { const done = progress.some((item) => item.lesson_id === lesson.id && item.status === "completed"); const isOpen = openLesson === lesson.id; return <article key={lesson.id} className="exam-card"><button onClick={() => setOpenLesson(isOpen ? null : lesson.id)} className="flex w-full items-start gap-4 text-left"><span className={`number-chip ${done ? "!bg-emerald-300/10 !text-emerald-200" : ""}`}>{done ? <Check size={15} /> : String(lesson.position).padStart(2, "0")}</span><div className="min-w-0 flex-1"><h2 className="font-medium">{lesson.title}</h2><p className="mt-1 text-sm text-slate-500">{lesson.summary}</p></div><span className="text-xs text-cyan-200">{isOpen ? "Fechar" : "Abrir"}</span></button>{isOpen && <div className="mt-6 border-t border-white/10 pt-6"><div className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{lesson.content?.map((block, index) => <p key={index}>{block.body}</p>)}</div><Button onClick={() => completeLesson(lesson)} disabled={done} className="mt-6 bg-cyan-300 text-[#071321]">{done ? <Check /> : <ClipboardCheck />}{done ? "Concluído" : "Marcar como concluído"}</Button></div>}</article> }) : <div className="exam-card"><EmptyText text="A professora ainda não publicou conteúdos." /></div>}</div></div>}</PortalFrame>;
}

function EmptyText({ text }: { text: string }) { return <div className="py-8 text-center"><BookOpen className="mx-auto text-slate-600" /><p className="mt-3 text-sm text-slate-500">{text}</p></div>; }
function formatDate(value: string | null) { if (!value) return "Data não informada"; return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
