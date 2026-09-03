"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, AudioLines, BookOpen, Check, CircleStop, FileText, Headphones, Languages, LockKeyhole, MessageCircleMore, Mic, RotateCcw, ShieldCheck, Sparkles, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { PortalShell, type ExamContext } from "@/components/portal-shell";
import { supabase } from "@/lib/supabase";

type ChoiceQuestion = { id: string; prompt: string; options: string[]; answer: string; audio?: string; text?: string };
type SpeakingTask = { id: string; title: string; prompt: string; support: string };

const listening: ChoiceQuestion[] = [
  { id: "l1", prompt: "Who is Tom?", options: ["Mia’s friend", "Mia’s brother", "Mia’s teacher"], answer: "Mia’s brother", audio: "Hi! My name is Mia. I am eleven years old, and I have a little brother named Tom." },
  { id: "l2", prompt: "What does Mia do on Saturday afternoon?", options: ["She plays tennis", "She visits her grandmother", "She goes to school"], answer: "She visits her grandmother", audio: "On Saturdays, Mia plays tennis in the morning. In the afternoon, she visits her grandmother." },
  { id: "l3", prompt: "What is the girl wearing?", options: ["A blue jacket and black boots", "A black jacket and blue shoes", "A blue dress and boots"], answer: "A blue jacket and black boots", audio: "It is cold and raining in London today. The girl is wearing a blue jacket and black boots." },
  { id: "l4", prompt: "When and where is the school game?", options: ["Friday at three, in the gym", "Thursday at two, in class", "Friday at four, in the park"], answer: "Friday at three, in the gym", audio: "Remember: our school game is on Friday at three o’clock in the gym. Please bring water." },
  { id: "l5", prompt: "What is Sarah doing now?", options: ["Watching TV", "Reading a book", "Playing a game"], answer: "Reading a book", audio: "Sarah usually watches TV after dinner, but right now she is reading a book with her sister." },
];

const reading: ChoiceQuestion[] = [
  { id: "r1", text: "Hi Mia! Do you want to hang out on Saturday? Let’s meet at the library at half past two. — Leo", prompt: "What time should Mia meet Leo?", options: ["1:30", "2:30", "3:30"], answer: "2:30" },
  { id: "r2", text: "Ben lives in an apartment with his mum, one dog and two cats. His room has lots of books. He doesn’t have video games, but he loves music.", prompt: "How many pets live with Ben?", options: ["One", "Two", "Three"], answer: "Three" },
  { id: "r3", text: "The morning will be cloudy and cold. In the afternoon, the sun will come out and it will be warm. Take a jacket for the morning.", prompt: "Why should people take a jacket?", options: ["The morning is cold", "The afternoon is rainy", "The evening is windy"], answer: "The morning is cold" },
  { id: "r4", text: "Ava usually walks to school. Today her father is driving her because it is raining. She is waiting in the car now.", prompt: "How is Ava going to school today?", options: ["On foot", "By bus", "By car"], answer: "By car" },
  { id: "r5", text: "Can you look after Coco while I’m at football practice? Her food is on the kitchen table. Thanks!", prompt: "What does “look after Coco” mean here?", options: ["Draw Coco", "Take care of Coco", "Look for Coco"], answer: "Take care of Coco" },
];

const language: ChoiceQuestion[] = [
  { id: "g1", prompt: "Alice ___ up at seven on school days.", options: ["wake", "wakes", "is waking"], answer: "wakes" },
  { id: "g2", prompt: "___ your friend like music?", options: ["Do", "Does", "Is"], answer: "Does" },
  { id: "g3", prompt: "Look! The children ___ basketball now.", options: ["play", "plays", "are playing"], answer: "are playing" },
  { id: "g4", prompt: "That is my brother. I play games with ___.", options: ["he", "him", "his"], answer: "him" },
  { id: "g5", prompt: "We go ___ school by bus.", options: ["at", "to", "in"], answer: "to" },
  { id: "g6", prompt: "My baby cousin ___ read, but she can sing.", options: ["can’t", "doesn’t", "isn’t"], answer: "can’t" },
  { id: "g7", prompt: "I ___ do my homework after dinner. It is my normal routine.", options: ["now", "always", "today"], answer: "always" },
  { id: "g8", prompt: "He ___ wear boots when it is sunny.", options: ["don’t", "isn’t", "doesn’t"], answer: "doesn’t" },
];

const speaking: SpeakingTask[] = [
  { id: "s1", title: "About you", prompt: "Introduce yourself. Talk about your age, family, likes and one thing you can do well.", support: "Try to speak for 30–45 seconds." },
  { id: "s2", title: "Routine & now", prompt: "Describe what you usually do after school. Then say what you are doing today.", support: "Use usually / always and now / today." },
  { id: "s3", title: "Make a plan", prompt: "Invite your teacher to do something this weekend. Suggest a day, time and place, then ask one question.", support: "Imagine this is a real conversation." },
  { id: "s4", title: "Pass on a message", prompt: "Tell a friend: the school game is Friday at 3 p.m. in the gym, and everyone must bring water.", support: "Keep all the important information." },
];

const stages = [
  { key: "setup", label: "Preparação", icon: ShieldCheck }, { key: "listening", label: "Escuta", icon: Headphones },
  { key: "reading", label: "Leitura", icon: BookOpen }, { key: "language", label: "Língua", icon: Languages },
  { key: "writing", label: "Escrita", icon: FileText }, { key: "speaking", label: "Fala", icon: Mic },
  { key: "result", label: "Parecer", icon: Sparkles },
] as const;
type Stage = (typeof stages)[number]["key"];
type Answers = Record<string, string>;
type Recordings = Record<string, { transcript: string; url?: string }>;
type Report = { narrative: string; domains: { name: string; band: string; note: string }[] };

function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).length : 0 }
function band(ratio: number) { if (ratio >= .82) return "A2 demonstrado com consistência"; if (ratio >= .64) return "Transição A1–A2"; if (ratio >= .42) return "A1 em consolidação"; return "Evidência inicial de A1" }
function score(items: ChoiceQuestion[], answers: Answers) { return items.filter((item) => answers[item.id] === item.answer).length / items.length }

function localReport(answers: Answers, writing: Answers, recordings: Recordings, studentName: string): Report {
  const listen = score(listening, answers), read = score(reading, answers), grammar = score(language, answers);
  const w1 = wordCount(writing.w1 || ""), w2 = wordCount(writing.w2 || "");
  const writtenRatio = Math.min(1, (w1 / 40 + w2 / 70) / 2);
  const spokenWords = Object.values(recordings).reduce((sum, item) => sum + wordCount(item.transcript), 0);
  const spokenRatio = Math.min(1, spokenWords / 95);
  const domains = [
    { name: "Compreensão oral", band: band(listen), note: listen >= .64 ? "Compreende informações centrais sobre rotina, clima, roupas e compromissos." : "Precisa de mais apoio para localizar detalhes em mensagens curtas." },
    { name: "Leitura", band: band(read), note: read >= .64 ? "Localiza informações explícitas e começa a inferir sentidos pelo contexto." : "Reconhece vocabulário familiar; deve praticar horário, intenção e inferência." },
    { name: "Recursos linguísticos", band: band(grammar), note: grammar >= .64 ? "Controla estruturas frequentes do presente simples e contínuo em contexto." : "A produção ainda oscila em terceira pessoa, auxiliares e pronomes." },
    { name: "Produção escrita", band: band(writtenRatio), note: w2 >= 45 ? "Produz mensagens conectadas sobre experiências familiares e planos." : "Há evidência de escrita funcional, mas é preciso ampliar e conectar ideias." },
    { name: "Produção e interação oral", band: band(spokenRatio), note: spokenWords >= 55 ? "Consegue sustentar fala pessoal, fazer um convite e retransmitir informação." : "A amostra oral foi breve; vale repetir com mais tempo e perguntas de apoio." },
  ];
  const demonstrated = domains.filter((d) => d.band.includes("A2") || d.band.includes("Transição")).map((d) => d.name.toLowerCase());
  const priorities = domains.filter((d) => d.band.includes("inicial") || d.band.includes("consolidação")).map((d) => d.name.toLowerCase());
  return { narrative: `${studentName} demonstra um repertório funcional para situações familiares estudadas — identidade, família, rotina, clima, roupas, preferências e planos. ${demonstrated.length ? `As evidências mais firmes aparecem em ${demonstrated.join(" e ")}.` : "Nesta aplicação, as evidências ainda se concentram no nível A1."} ${priorities.length ? `Os próximos ciclos devem priorizar ${priorities.join(" e ")}, com tarefas curtas, repetidas e contextualizadas.` : "O próximo passo é ampliar espontaneidade, precisão e autonomia em tarefas menos previsíveis."} Este parecer descreve o desempenho observado hoje; não é uma nota e deve ser combinado com as observações da professora durante a interação ao vivo.`, domains };
}

export default function Home() {
  return <PortalShell renderExam={(context) => <AliceExam {...context} />} />;
}

function AliceExam({ student, onExit, onSubmitted }: ExamContext) {
  const [stage, setStage] = useState<Stage>("setup"); const [answers, setAnswers] = useState<Answers>({});
  const [writing, setWriting] = useState<Answers>({ w1: "", w2: "" }); const [recordings, setRecordings] = useState<Recordings>({});
  const [consent, setConsent] = useState(false), [supervised, setSupervised] = useState(false), [micReady, setMicReady] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null), [recording, setRecording] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null), [working, setWorking] = useState(false), [notice, setNotice] = useState("");
  const mediaRecorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), chunks = useRef<Blob[]>([]), recognition = useRef<any>(null), liveTranscript = useRef("");
  const stageIndex = stages.findIndex((item) => item.key === stage), progress = Math.round(stageIndex / (stages.length - 1) * 100);
  const canContinue = useMemo(() => {
    if (stage === "setup") return consent && supervised && micReady;
    if (stage === "listening") return listening.every((q) => answers[q.id]); if (stage === "reading") return reading.every((q) => answers[q.id]);
    if (stage === "language") return language.every((q) => answers[q.id]); if (stage === "writing") return wordCount(writing.w1) >= 20 && wordCount(writing.w2) >= 35;
    if (stage === "speaking") return speaking.every((q) => recordings[q.id]?.transcript.trim()); return false;
  }, [stage, consent, supervised, micReady, answers, writing, recordings]);

  const storageKey = `alice-360-progress-${student.id}`;
  useEffect(() => { const saved = window.localStorage.getItem(storageKey); if (!saved) return; try { const parsed = JSON.parse(saved); setAnswers(parsed.answers || {}); setWriting(parsed.writing || {w1:"",w2:""}); setRecordings(parsed.recordings || {}) } catch {} }, [storageKey]);
  useEffect(() => { const safe = Object.fromEntries(Object.entries(recordings).map(([k,v]) => [k,{transcript:v.transcript}])); window.localStorage.setItem(storageKey, JSON.stringify({answers,writing,recordings:safe})) }, [answers, writing, recordings, storageKey]);

  function speak(item: ChoiceQuestion) { if (!item.audio || !("speechSynthesis" in window)) return setNotice("Use Chrome, Edge ou Safari atualizado para ouvir o áudio."); window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(item.audio); u.lang="en-US"; u.rate=.88; u.onstart=()=>setPlaying(item.id); u.onend=()=>setPlaying(null); window.speechSynthesis.speak(u) }
  async function testMic() { setNotice(""); try { const s=await navigator.mediaDevices.getUserMedia({audio:true}); s.getTracks().forEach(t=>t.stop()); setMicReady(true) } catch { setNotice("Não foi possível acessar o microfone. Autorize o acesso nas configurações do navegador.") } }
  async function startRecording(id:string) { setNotice(""); try { const s=await navigator.mediaDevices.getUserMedia({audio:true}); stream.current=s; chunks.current=[]; liveTranscript.current=""; const rec=new MediaRecorder(s); mediaRecorder.current=rec; rec.ondataavailable=e=>e.data.size&&chunks.current.push(e.data); const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition; if(Recognition){const speech=new Recognition(); speech.lang="en-US"; speech.continuous=true; speech.interimResults=true; speech.onresult=(event:any)=>{let words="";for(let i=0;i<event.results.length;i++) words+=`${event.results[i][0].transcript} `; liveTranscript.current=words.trim(); setRecordings(prev=>({...prev,[id]:{...prev[id],transcript:liveTranscript.current}}))}; speech.start(); recognition.current=speech} rec.start(); setRecording(id) } catch { setNotice("O microfone não abriu. Verifique a permissão e tente novamente.") } }
  function stopRecording(id:string) { const rec=mediaRecorder.current; if(!rec)return; rec.onstop=()=>{stream.current?.getTracks().forEach(t=>t.stop());try{recognition.current?.stop()}catch{} const blob=new Blob(chunks.current,{type:rec.mimeType||"audio/webm"}), url=URL.createObjectURL(blob), fallback=liveTranscript.current||recordings[id]?.transcript||""; setRecordings(prev=>({...prev,[id]:{transcript:fallback,url}}))};rec.stop();setRecording(null) }
  async function generateReport(){
    setWorking(true);
    setNotice("");
    const fallback=localReport(answers,writing,recordings,student.first_name);
    const safeTranscripts=Object.fromEntries(Object.entries(recordings).map(([key,value])=>[key,{transcript:value.transcript}]));
    const { error }=await supabase.from("attempts").insert({student_id:student.id,assessment_title:"Diagnóstico CEFR 360",kind:"diagnostic",status:"submitted",submitted_at:new Date().toISOString(),objective_answers:answers,writing,speaking_transcripts:safeTranscripts,domain_summary:fallback.domains,narrative:fallback.narrative});
    if(error)setNotice("O parecer foi gerado neste dispositivo, mas não chegou ao painel da professora. Verifique a conexão antes de fechar: "+error.message);
    else { window.localStorage.removeItem(storageKey); onSubmitted(); }
    setReport(fallback);setWorking(false);setStage("result")
  }
  function next(){if(stage==="speaking")return void generateReport();const nextStage=stages[stageIndex+1]?.key;if(nextStage){setStage(nextStage);window.scrollTo({top:0,behavior:"smooth"})}}
  function back(){const previous=stages[stageIndex-1]?.key;if(previous)setStage(previous)}
  function restart(){window.localStorage.removeItem(storageKey);setAnswers({});setWriting({w1:"",w2:""});setRecordings({});setReport(null);setStage("setup")}

  return <main className="min-h-screen text-slate-100">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#06101d]/90 backdrop-blur-xl print:hidden"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-8"><Button type="button" variant="ghost" onClick={onExit} className="shrink-0 px-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Voltar ao portal"><ArrowLeft/></Button><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-[#071321]"><AudioLines size={21}/></div><div className="min-w-0 flex-1"><div className="flex items-baseline justify-between gap-4"><h1 className="truncate font-semibold tracking-tight">Diagnóstico 360 • {student.first_name}</h1><span className="text-xs text-slate-400">{progress}% concluído</span></div><Progress value={progress} className="mt-2 h-1.5 bg-white/10 [&>div]:bg-cyan-300"/></div><span className="hidden rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200 sm:block">CEFR • sem nota</span></div></header>
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-7 sm:px-8 lg:grid-cols-[220px_1fr] lg:py-10"><aside className="hidden lg:block print:hidden"><nav className="sticky top-28 space-y-2" aria-label="Etapas do exame">{stages.map((item,index)=>{const Icon=item.icon,active=item.key===stage,done=index<stageIndex;return <div key={item.key} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${active?"bg-cyan-300 text-[#071321]":done?"text-emerald-200":"text-slate-500"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg ${active?"bg-[#071321]/10":"bg-white/5"}`}>{done?<Check size={15}/>:<Icon size={15}/>}</span>{item.label}</div>})}</nav></aside>
      <section className="min-w-0">{notice&&<div role="alert" className="mb-5 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{notice}</div>}
        {stage==="setup"&&<Setup studentName={student.first_name} consent={consent} supervised={supervised} micReady={micReady} setConsent={setConsent} setSupervised={setSupervised} testMic={testMic}/>} {stage==="listening"&&<QuestionSection eyebrow="Compreensão oral" title="Ouça e escolha a melhor resposta" description="Cada mensagem pode ser ouvida novamente. Use fones de ouvido, se possível." items={listening} answers={answers} setAnswers={setAnswers} onAudio={speak} playing={playing}/>} {stage==="reading"&&<QuestionSection eyebrow="Compreensão escrita" title="Leia mensagens do dia a dia" description="Observe horário, intenção e detalhes importantes." items={reading} answers={answers} setAnswers={setAnswers}/>} {stage==="language"&&<QuestionSection eyebrow="Recursos linguísticos" title="Complete cada frase" description="Escolha a forma que funciona melhor no contexto." items={language} answers={answers} setAnswers={setAnswers}/>} {stage==="writing"&&<WritingSection writing={writing} setWriting={setWriting}/>} {stage==="speaking"&&<SpeakingSection recordings={recordings} setRecordings={setRecordings} recording={recording} start={startRecording} stop={stopRecording}/>} {stage==="result"&&report&&<Result studentName={student.first_name} report={report} restart={restart}/>} 
        {stage!=="result"&&<footer className="mt-8 flex items-center justify-between gap-3 border-t border-white/10 pt-6 print:hidden"><Button type="button" variant="ghost" onClick={back} disabled={stageIndex===0} className="text-slate-300 hover:bg-white/5 hover:text-white"><ArrowLeft/>Voltar</Button><div className="hidden text-center text-xs text-slate-500 sm:block"><LockKeyhole className="mr-1 inline" size={12}/>rascunho neste dispositivo • envio ao finalizar</div><Button type="button" onClick={next} disabled={!canContinue||working} className="bg-cyan-300 text-[#071321] hover:bg-cyan-200 disabled:bg-slate-700 disabled:text-slate-400">{working?"Enviando parecer…":stage==="speaking"?"Gerar e enviar parecer":"Continuar"}<ArrowRight/></Button></footer>}
      </section></div>
  </main>
}

function Setup({studentName,consent,supervised,micReady,setConsent,setSupervised,testMic}:any){return <div className="space-y-6"><div className="exam-card overflow-hidden p-0"><div className="grid md:grid-cols-[1.25fr_.75fr]"><div className="p-7 sm:p-10"><p className="eyebrow">Diagnóstico multimodal • 45–60 min</p><h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-[-.03em] sm:text-5xl">Mostre o inglês que você já consegue usar.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-300">Olá, {studentName}. Você vai ouvir, ler, escrever e falar em situações que já conhece. Não há nota nem cronômetro. Faça com calma e sem tradutor.</p></div><div className="signal-grid flex min-h-56 items-end p-7"><div><span className="rounded-full bg-cyan-300/15 px-3 py-1 text-xs text-cyan-200">perfil inicial</span><div className="mt-4 text-5xl font-semibold text-cyan-300">A1<span className="text-2xl text-slate-400">→A2</span></div><p className="mt-2 text-sm text-slate-400">A avaliação procura evidências reais, não erros isolados.</p></div></div></div></div><div className="grid gap-4 md:grid-cols-3">{[[Headphones,"Lugar tranquilo","Use fones e mantenha a câmera da aula ativa."],[MessageCircleMore,"Resposta própria","A professora pode explicar a tarefa, mas não dar respostas."],[LockKeyhole,"Privacidade","O áudio não é guardado; somente a transcrição é enviada."]].map(([Icon,title,text]:any)=><div key={title} className="soft-card"><Icon className="text-cyan-300" size={20}/><h3 className="mt-4 font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{text}</p></div>)}</div><div className="exam-card space-y-4"><h3 className="text-lg font-medium">Antes de começar</h3><label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 p-4"><Checkbox checked={consent} onCheckedChange={(v)=>setConsent(v===true)} className="mt-0.5"/><span><b className="block text-sm font-medium">Autorização do responsável confirmada</b><span className="mt-1 block text-xs leading-5 text-slate-400">O responsável sabe que haverá gravação temporária da voz e envio da transcrição para análise pedagógica.</span></span></label><label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 p-4"><Checkbox checked={supervised} onCheckedChange={(v)=>setSupervised(v===true)} className="mt-0.5"/><span><b className="block text-sm font-medium">Professora presente na aula online</b><span className="mt-1 block text-xs leading-5 text-slate-400">A aplicação é acompanhada ao vivo e as respostas são do próprio aluno.</span></span></label><Button type="button" variant="outline" onClick={testMic} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">{micReady?<Check className="text-emerald-300"/>:<Mic/>}{micReady?"Microfone pronto":"Testar microfone"}</Button></div></div>}

function QuestionSection({eyebrow,title,description,items,answers,setAnswers,onAudio,playing}:any){return <div><p className="eyebrow">{eyebrow}</p><h2 className="section-title">{title}</h2><p className="section-description">{description}</p><div className="mt-8 space-y-5">{items.map((item:ChoiceQuestion,index:number)=><article key={item.id} className="exam-card"><div className="flex items-start gap-4"><span className="number-chip">{String(index+1).padStart(2,"0")}</span><div className="min-w-0 flex-1">{item.audio&&<Button type="button" variant="outline" onClick={()=>onAudio(item)} className="mb-5 border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20 hover:text-white"><Volume2 className={playing===item.id?"animate-pulse":""}/>{playing===item.id?"Ouvindo…":"Ouvir mensagem"}</Button>}{item.text&&<blockquote className="mb-5 rounded-xl border-l-2 border-cyan-300 bg-[#071726] p-4 text-sm leading-7 text-slate-200">{item.text}</blockquote>}<h3 className="mb-4 font-medium leading-6">{item.prompt}</h3><RadioGroup value={answers[item.id]||""} onValueChange={(value)=>setAnswers((prev:Answers)=>({...prev,[item.id]:value}))}>{item.options.map((option:string)=><label key={option} className={`option-row ${answers[item.id]===option?"option-selected":""}`}><RadioGroupItem value={option}/><span>{option}</span></label>)}</RadioGroup></div></div></article>)}</div></div>}

function WritingSection({writing,setWriting}:any){return <div><p className="eyebrow">Produção escrita</p><h2 className="section-title">Escreva para uma pessoa real</h2><p className="section-description">Planeje rapidamente, escreva e releia. O corretor automático do navegador pode ficar ligado.</p><div className="mt-8 space-y-5"><article className="exam-card"><span className="number-chip">01</span><h3 className="mt-5 text-lg font-medium">Reply to a friend</h3><p className="mt-2 text-sm leading-6 text-slate-300">Your friend says: “Would you like to come to my house on Saturday?” Reply, say if you can go, give one detail and ask a question.</p><Textarea lang="en" value={writing.w1} onChange={e=>setWriting({...writing,w1:e.target.value})} placeholder="Hi! Thanks for…" className="mt-5 min-h-36 border-white/10 bg-[#06101d] text-base leading-7 placeholder:text-slate-600"/><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Alvo: 35–50 palavras</span><span>{wordCount(writing.w1)} palavras</span></div></article><article className="exam-card"><span className="number-chip">02</span><h3 className="mt-5 text-lg font-medium">A family trip</h3><p className="mt-2 text-sm leading-6 text-slate-300">Write a short post. Say where you are, describe the weather, what people usually wear, what your family is doing now, and one plan for tomorrow.</p><Textarea lang="en" value={writing.w2} onChange={e=>setWriting({...writing,w2:e.target.value})} placeholder="We are in…" className="mt-5 min-h-52 border-white/10 bg-[#06101d] text-base leading-7 placeholder:text-slate-600"/><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Alvo: 60–90 palavras</span><span>{wordCount(writing.w2)} palavras</span></div></article></div></div>}

function SpeakingSection({recordings,setRecordings,recording,start,stop}:any){return <div><p className="eyebrow">Fala, interação e mediação</p><h2 className="section-title">Agora é sua vez de falar</h2><p className="section-description">Fale naturalmente. A transcrição ajuda a professora, mas o áudio é a principal amostra durante a aula.</p><div className="mt-8 space-y-5">{speaking.map((task,index)=>{const item=recordings[task.id],active=recording===task.id;return <article className="exam-card" key={task.id}><div className="flex items-start gap-4"><span className="number-chip">{String(index+1).padStart(2,"0")}</span><div className="min-w-0 flex-1"><h3 className="text-lg font-medium">{task.title}</h3><p className="mt-2 leading-7 text-slate-200">{task.prompt}</p><p className="mt-2 text-xs text-slate-500">{task.support}</p><div className="mt-5 flex flex-wrap items-center gap-3"><Button type="button" onClick={()=>active?stop(task.id):start(task.id)} disabled={Boolean(recording&&!active)} className={active?"bg-rose-400 text-[#071321] hover:bg-rose-300":"bg-cyan-300 text-[#071321] hover:bg-cyan-200"}>{active?<CircleStop/>:<Mic/>}{active?"Parar gravação":item?"Gravar novamente":"Começar a falar"}</Button>{item?.url&&<audio controls src={item.url} className="h-9 max-w-full"/>}</div><label className="mt-5 block text-xs font-medium uppercase tracking-wider text-slate-500">Transcrição — corrija somente se o reconhecimento ouviu errado</label><Textarea lang="en" value={item?.transcript||""} onChange={e=>setRecordings({...recordings,[task.id]:{...item,transcript:e.target.value}})} placeholder="Your words will appear here…" className="mt-2 min-h-24 border-white/10 bg-[#06101d] leading-6 placeholder:text-slate-600"/></div></div></article>})}</div></div>}

function Result({studentName,report,restart}:{studentName:string;report:Report;restart:()=>void}){return <div><div className="exam-card relative overflow-hidden border-cyan-300/20"><div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan-300/10 blur-3xl"/><p className="eyebrow">Parecer enviado à professora • CEFR</p><h2 className="section-title relative">O retrato do inglês de {studentName} hoje</h2><p className="relative mt-6 max-w-3xl text-base leading-8 text-slate-200">{report.narrative}</p><div className="relative mt-6 flex flex-wrap gap-3 print:hidden"><Button type="button" onClick={()=>window.print()} className="bg-cyan-300 text-[#071321] hover:bg-cyan-200"><FileText/>Salvar em PDF</Button><Button type="button" variant="outline" onClick={restart} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><RotateCcw/>Nova aplicação</Button></div></div><div className="mt-6 grid gap-4 md:grid-cols-2">{report.domains.map(domain=><article key={domain.name} className="soft-card"><div className="flex items-start justify-between gap-4"><h3 className="font-medium">{domain.name}</h3><span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-right text-[11px] leading-4 text-cyan-200">{domain.band}</span></div><p className="mt-4 text-sm leading-6 text-slate-400">{domain.note}</p></article>)}</div><p className="mt-6 text-xs leading-5 text-slate-500">Uso pedagógico: o CEFR descreve o que o aprendiz consegue fazer. Este resultado deve ser lido junto das observações da professora sobre fluência, pronúncia, necessidade de apoio e comportamento durante a tarefa.</p></div>}
