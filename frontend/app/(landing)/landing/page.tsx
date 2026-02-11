"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  Github,
  FileText,
  GitBranch,
  Search,
  Brain,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Database,
  Zap,
  Globe,
  Star,
  Terminal,
  Code2,
  BookOpen,
} from "lucide-react";

/* ──────────────────────────────────────────────
   Animation variants
   ────────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
};

/* ──────────────────────────────────────────────
   Navbar
   ────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
          ? "bg-[#0a0a1a]/80 backdrop-blur-xl border-b border-white/5"
          : "bg-transparent"
        }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="#" className="group flex items-center gap-2">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500">
            <Terminal className="h-5 w-5 text-white" />
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500 opacity-0 blur-lg transition-opacity group-hover:opacity-60" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            RRI
          </span>
        </a>

        {/* Links */}
        <div className="hidden items-center gap-8 md:flex">
          {["Features", "How it Works", "Docs"].map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(/ /g, "-")}`}
              className="text-sm text-slate-400 transition-colors hover:text-white"
            >
              {link}
            </a>
          ))}
        </div>

        {/* CTA */}
        <a
          href="https://github.com/nhdandz/ResearchRover"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:border-cyan-500/30 hover:bg-white/10"
        >
          <Github className="h-4 w-4" />
          <span>Star on GitHub</span>
          <Star className="h-3.5 w-3.5 text-yellow-400 opacity-0 transition-opacity group-hover:opacity-100" />
        </a>
      </div>
    </motion.nav>
  );
}

/* ──────────────────────────────────────────────
   Terminal mock
   ────────────────────────────────────────────── */
function TerminalWindow() {
  const lines = [
    { text: "$ rri analyze --source arxiv:2401.12345", color: "text-green-400", delay: 0 },
    { text: "  Fetching paper metadata...", color: "text-slate-500", delay: 0.8 },
    { text: "  Extracting methodology & key findings...", color: "text-slate-500", delay: 1.6 },
    { text: "  Running LLM analysis (qwen2.5-72b)...", color: "text-cyan-400", delay: 2.4 },
    { text: '  Summary: "Novel approach to multi-modal RAG..."', color: "text-purple-400", delay: 3.2 },
    { text: "", color: "", delay: 3.8 },
    { text: "$ rri collect --repo github.com/nhdandz/ResearchRover", color: "text-green-400", delay: 4.0 },
    { text: "  Scanning repository structure...", color: "text-slate-500", delay: 4.8 },
    { text: "  Analyzing dependencies & tech stack...", color: "text-slate-500", delay: 5.6 },
    { text: "  Intelligence report generated.", color: "text-cyan-400", delay: 6.4 },
    { text: "  Report saved to ./reports/rri-intel.md", color: "text-emerald-400", delay: 7.0 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: 8 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-2xl"
      style={{ perspective: "1000px" }}
    >
      {/* Glow behind */}
      <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-cyan-500/20 blur-2xl" />

      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-3 text-xs text-slate-500 font-mono">rri-terminal</span>
        </div>

        {/* Lines */}
        <div className="p-5 font-mono text-sm leading-relaxed">
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: line.delay }}
              className={`${line.color} ${line.text === "" ? "h-4" : ""}`}
            >
              {line.text}
            </motion.div>
          ))}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 7.5 }}
            className="inline-block h-4 w-2 animate-terminal-blink bg-cyan-400 mt-1"
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────
   Hero
   ────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24 pb-16">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial glow */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[800px] rounded-full bg-gradient-to-b from-cyan-500/10 via-purple-500/5 to-transparent blur-3xl" />

      {/* Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-8 flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-1.5"
      >
        <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
        <span className="text-xs font-medium text-cyan-300">Open-Source Intelligence Tool</span>
      </motion.div>

      {/* Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-4xl text-center text-5xl font-bold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl"
      >
        Decode Research & Code{" "}
        <span className="bg-gradient-to-r from-cyan-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          with AI Intelligence
        </span>
      </motion.h1>

      {/* Sub-headline */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.25 }}
        className="mt-6 max-w-2xl text-center text-lg leading-relaxed text-slate-400"
      >
        The all-in-one OSINT and analysis tool for Academic Papers and GitHub
        Repositories. Powered by advanced LLMs.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="mt-10 flex flex-wrap items-center justify-center gap-4"
      >
        <a
          href="/login"
          className="group relative flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-cyan-500/40 hover:scale-[1.02]"
        >
          Get Started
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </a>
        <a
          href="https://github.com/nhdandz/ResearchRover"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10"
        >
          <Code2 className="h-4 w-4" />
          View Source
        </a>
      </motion.div>

      {/* Terminal */}
      <div className="mt-16 w-full flex justify-center">
        <TerminalWindow />
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   Features Bento Grid
   ────────────────────────────────────────────── */
const features = [
  {
    icon: FileText,
    title: "Paper Analysis",
    description:
      "Extract summaries, methodologies, and key findings from PDFs instantly.",
    gradient: "from-cyan-500/20 to-blue-500/20",
    iconColor: "text-cyan-400",
    borderHover: "hover:border-cyan-500/30",
    glowColor: "group-hover:shadow-glow-cyan",
    span: "md:col-span-2",
  },
  {
    icon: GitBranch,
    title: "Repo Intelligence",
    description:
      "Deep dive into GitHub repositories. Analyze structure, dependencies, and code quality.",
    gradient: "from-purple-500/20 to-pink-500/20",
    iconColor: "text-purple-400",
    borderHover: "hover:border-purple-500/30",
    glowColor: "group-hover:shadow-glow-purple",
    span: "md:col-span-1",
  },
  {
    icon: Globe,
    title: "OSINT Integration",
    description:
      "Gather open-source intelligence to connect the dots between research and implementation.",
    gradient: "from-emerald-500/20 to-cyan-500/20",
    iconColor: "text-emerald-400",
    borderHover: "hover:border-emerald-500/30",
    glowColor: "group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]",
    span: "md:col-span-1",
  },
  {
    icon: Brain,
    title: "LLM Powered",
    description:
      "Built on state-of-the-art models (Qwen/Llama) for context-aware insights.",
    gradient: "from-orange-500/20 to-amber-500/20",
    iconColor: "text-orange-400",
    borderHover: "hover:border-orange-500/30",
    glowColor: "group-hover:shadow-[0_0_20px_rgba(249,115,22,0.3)]",
    span: "md:col-span-2",
  },
];

function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" className="relative px-6 py-32" ref={ref}>
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp} custom={0} className="mb-4 flex items-center justify-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400" />
            <span className="text-sm font-medium uppercase tracking-widest text-cyan-400">
              Features
            </span>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            Intelligence at Every Layer
          </motion.h2>
          <motion.p
            variants={fadeUp}
            custom={2}
            className="mx-auto mt-4 max-w-2xl text-lg text-slate-400"
          >
            From paper PDFs to GitHub repos, RRI extracts the signal from the noise.
          </motion.p>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              custom={i}
              className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-8 transition-all duration-500 ${f.borderHover} ${f.glowColor} ${f.span}`}
            >
              {/* Gradient bg */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />

              <div className="relative z-10">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 ${f.iconColor}`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-white">{f.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-400">
                  {f.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   How it Works
   ────────────────────────────────────────────── */
const steps = [
  {
    step: "01",
    title: "Input Source",
    description: "Paste an arXiv link, GitHub URL, or upload a PDF. RRI accepts any research source.",
    icon: Search,
    color: "text-cyan-400",
    borderColor: "border-cyan-500/30",
    bg: "bg-cyan-500/10",
  },
  {
    step: "02",
    title: "AI Processing",
    description: "Advanced LLMs parse, analyze, and cross-reference your data in seconds.",
    icon: Database,
    color: "text-purple-400",
    borderColor: "border-purple-500/30",
    bg: "bg-purple-500/10",
  },
  {
    step: "03",
    title: "Intelligence Dashboard",
    description: "Get exportable reports, summaries, and actionable insights in a clean dashboard.",
    icon: BookOpen,
    color: "text-emerald-400",
    borderColor: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
  },
];

function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="relative px-6 py-32" ref={ref}>
      {/* Subtle divider gradient */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="mx-auto max-w-6xl">
        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="text-center"
        >
          <motion.div variants={fadeUp} custom={0} className="mb-4 flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium uppercase tracking-widest text-purple-400">
              How it Works
            </span>
          </motion.div>
          <motion.h2
            variants={fadeUp}
            custom={1}
            className="text-4xl font-bold tracking-tight text-white sm:text-5xl"
          >
            Three Steps to Intelligence
          </motion.h2>
        </motion.div>

        <motion.div
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          variants={stagger}
          className="mt-20 grid grid-cols-1 gap-8 md:grid-cols-3"
        >
          {steps.map((s, i) => (
            <motion.div key={s.step} variants={fadeUp} custom={i} className="relative">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div className="pointer-events-none absolute right-0 top-16 hidden h-px w-8 translate-x-full bg-gradient-to-r from-white/20 to-transparent md:block" />
              )}

              <div className={`rounded-2xl border ${s.borderColor} bg-white/[0.02] p-8 transition-all hover:bg-white/[0.04]`}>
                <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-xl ${s.bg} ${s.color}`}>
                  <s.icon className="h-7 w-7" />
                </div>
                <div className="mb-3 font-mono text-xs text-slate-500 uppercase tracking-widest">
                  Step {s.step}
                </div>
                <h3 className="text-xl font-semibold text-white">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-400">{s.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   Tech Stack Marquee
   ────────────────────────────────────────────── */
const techStack = [
  { name: "Python", icon: "🐍" },
  { name: "FastAPI", icon: "⚡" },
  { name: "Apache Spark", icon: "🔥" },
  { name: "LangChain", icon: "🔗" },
  { name: "Next.js", icon: "▲" },
  { name: "Docker", icon: "🐳" },
  { name: "Qdrant", icon: "🔍" },
  { name: "PostgreSQL", icon: "🐘" },
  { name: "Hugging Face", icon: "🤗" },
  { name: "Tailwind CSS", icon: "💨" },
];

function TechMarquee() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const items = [...techStack, ...techStack];

  return (
    <section className="relative py-24 overflow-hidden" ref={ref}>
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
        className="text-center mb-12"
      >
        <span className="text-sm font-medium uppercase tracking-widest text-slate-500">
          Built With
        </span>
      </motion.div>

      {/* Marquee */}
      <div className="relative">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-[#0a0a1a] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-[#0a0a1a] to-transparent" />

        <div className="flex animate-marquee">
          {items.map((tech, i) => (
            <div
              key={`${tech.name}-${i}`}
              className="mx-6 flex flex-shrink-0 items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-6 py-3"
            >
              <span className="text-2xl">{tech.icon}</span>
              <span className="text-sm font-medium text-slate-300 whitespace-nowrap">{tech.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   CTA Section
   ────────────────────────────────────────────── */
function CTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="relative px-6 py-32" ref={ref}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.7 }}
        className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10"
      >
        {/* BG gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-purple-500/10 to-blue-500/10" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative z-10 flex flex-col items-center px-8 py-20 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Decode the Research Landscape?
          </h2>
          <p className="mt-4 max-w-lg text-lg text-slate-400">
            Join the open-source community building the future of research intelligence.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/login"
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-cyan-500/40 hover:scale-[1.02]"
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="https://github.com/nhdandz/ResearchRover"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/10"
            >
              <Github className="h-4 w-4" />
              Star on GitHub
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

/* ──────────────────────────────────────────────
   Footer
   ────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-white/5 px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500">
            <Terminal className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-white">RRI</span>
          <span className="text-sm text-slate-500">|</span>
          <span className="text-sm text-slate-500">Research-Repo Intelligence</span>
        </div>

        <div className="flex items-center gap-6">
          <a href="#features" className="text-sm text-slate-500 transition-colors hover:text-white">
            Features
          </a>
          <a href="#how-it-works" className="text-sm text-slate-500 transition-colors hover:text-white">
            How it Works
          </a>
          <a
            href="https://github.com/nhdandz/ResearchRover"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-500 transition-colors hover:text-white"
          >
            GitHub
          </a>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">
            Built by{" "}
            <a
              href="https://github.com/nhdandz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 transition-colors hover:text-white"
            >
              nhdandz
            </a>
          </span>
          <a
            href="https://github.com/nhdandz/ResearchRover"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 transition-colors hover:text-white"
          >
            <Github className="h-5 w-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ──────────────────────────────────────────────
   Main Page
   ────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <TechMarquee />
      <CTASection />
      <Footer />
    </>
  );
}
