"use client";

/**
 * Split-screen auth screen (premium mockup):
 *  • Left  — emerald gradient brand panel: logo, headline, eyebrow, feature
 *            rows, handwritten accents, hero-bowl blob on the right edge and
 *            a trust strip (compact logo + headline only below `lg`).
 *  • Right — white card: rounded segmented Sign in / Create account tabs,
 *            decorative social buttons, forms with leading icons + password
 *            reveal, big submit, one-tap demo login, demo hint.
 * All auth logic preserved 1:1: api.login / api.register / api.me →
 * setSession, structured ApiError handling, busy states, toasts.
 */
import { useState } from "react";
import {
  Apple,
  ArrowRight,
  BarChart3,
  Eye,
  EyeOff,
  Heart,
  HeartPulse,
  Leaf,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Sprout,
  User,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/client/api";
import { useNutriStore } from "./store";
import { FadeIn } from "./fade-in";

const DEMO = { email: "demo@nutrislm.app", password: "demo1234" };

/** Official multicolor Google "G" (decorative — the button is an honest no-op). */
function GoogleG() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.96H.96a9 9 0 0 0 0 8.08l3.01-2.32z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

const FEATURES = [
  {
    icon: UtensilsCrossed,
    title: "Log Your Meals",
    desc: "Describe, snap or select — we do the rest.",
  },
  {
    icon: BarChart3,
    title: "Get Personalised Insights",
    desc: "Track nutrition, spot gaps, stay on target.",
  },
  {
    icon: HeartPulse,
    title: "Health-Focused Guidance",
    desc: "Evidence-based support for diabetes, kidney & heart health.",
  },
] as const;

const TRUST = [
  { icon: Users, line1: "Trusted by thousands", line2: "of happy eaters" },
  { icon: ShieldCheck, line1: "Evidence-based", line2: "nutrition data" },
  { icon: Sprout, line1: "Designed for a", line2: "healthier tomorrow" },
] as const;

const SEGMENTED_TRIGGER =
  "flex-1 rounded-full px-4 text-sm " +
  "data-[state=active]:bg-primary/15 dark:data-[state=active]:bg-primary/15 " +
  "data-[state=active]:text-primary dark:data-[state=active]:text-primary " +
  "data-[state=active]:font-semibold data-[state=active]:shadow-none";

export function AuthView() {
  const setSession = useNutriStore((s) => s.setSession);
  const { toast } = useToast();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPw, setShowRegPw] = useState(false);
  const [busy, setBusy] = useState<"login" | "register" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(kind: "login" | "register" | "demo") {
    setBusy(kind);
    setError(null);
    try {
      const res =
        kind === "login"
          ? await api.login(loginEmail.trim(), loginPassword)
          : kind === "demo"
            ? await api.login(DEMO.email, DEMO.password)
            : await api.register(regName.trim(), regEmail.trim(), regPassword);
      const me = await api.me();
      setSession(me.user, me.profile);
      toast({
        title: kind === "register" ? "Welcome to NutriSLM!" : `Welcome back, ${res.user.name.split(" ")[0]}!`,
        description: kind === "demo" ? "Signed in with the demo profile (vegetarian · T2DM · peanut allergy)." : undefined,
      });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  /** Decorative social buttons — honest no-ops, no fake auth. */
  function handleSocial(provider: "Google" | "Apple") {
    toast({
      title: `${provider} sign-in isn't wired in this build`,
      description: "Use email or the demo account instead.",
    });
  }

  function handleForgotPassword() {
    toast({
      title: "Password reset unavailable",
      description: "Password reset isn't wired in this demo build — try the demo account instead.",
    });
  }

  return (
    <div className="grid w-full flex-1 grid-cols-1 overflow-hidden rounded-3xl border border-border/70 bg-white shadow-xl shadow-primary/5 lg:grid-cols-2 dark:border-primary/15 dark:bg-card">
      {/* ------------------------------ LEFT: brand panel ------------------------------ */}
      <FadeIn className="relative flex flex-col gap-4 overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 p-6 sm:p-8 lg:justify-between lg:gap-6 lg:p-10 xl:p-12 dark:from-emerald-950/50 dark:via-background dark:to-emerald-950/20">
        {/* decorative blurred leaf shapes */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-96 w-96 rounded-[45%_55%_52%_48%/55%_48%_52%_45%] bg-teal-400/15 blur-3xl" />
          <Leaf className="absolute bottom-36 left-6 h-36 w-36 -rotate-12 text-primary/10" strokeWidth={1} />
          <Leaf className="absolute right-1/4 top-8 h-24 w-24 rotate-45 text-primary/5" strokeWidth={1} />
        </div>

        {/* hero bowl blob on the right edge (desktop only) */}
        <div aria-hidden className="pointer-events-none absolute -right-28 top-1/2 hidden -translate-y-1/2 lg:block">
          <p className="font-script absolute -left-20 -top-[9rem] w-40 -rotate-6 text-2xl font-semibold leading-[1.1] text-primary">
            Small Changes Big Impact
          </p>
          <img
            src="/images/hero-bowl.png"
            alt=""
            className="h-56 w-56 rotate-3 rounded-[3rem] object-cover shadow-xl ring-4 ring-white/70 xl:h-64 xl:w-64 dark:ring-card/80"
          />
        </div>

        {/* logo */}
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/20">
            <Sprout className="h-6 w-6" aria-hidden />
          </span>
          <span>
            <span className="block text-lg font-extrabold leading-tight tracking-tight text-emerald-950 dark:text-emerald-50">
              Nutri<span className="text-primary">SLM</span>
            </span>
            <span className="block whitespace-nowrap text-[10.5px] leading-tight text-muted-foreground">
              Eat Smarter • Live Healthier
            </span>
          </span>
        </div>

        {/* headline + features */}
        <div className="relative lg:max-w-[20rem] xl:max-w-[21.5rem]">
          <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground lg:block">
            Your personal nutrition companion
          </p>
          <p className="mt-3 text-3xl font-extrabold leading-[1.08] tracking-tight text-emerald-950 sm:text-4xl lg:text-[2.35rem] xl:text-[2.6rem] dark:text-emerald-50">
            Better Food
            <br />
            <span className="whitespace-nowrap text-primary">
              Brighter Days
              <Sprout className="ml-1.5 inline h-7 w-7 lg:h-8 lg:w-8" aria-hidden />
            </span>
          </p>
          <p className="mt-4 hidden text-sm leading-relaxed text-muted-foreground lg:block">
            Log your meals, get AI-powered insights, and receive personalized nutrition guidance — built on trusted
            science, for a healthier you.
          </p>
          <ul className="mt-8 hidden space-y-5 lg:block">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-emerald-950 dark:text-emerald-50">{title}</span>
                  <span className="block text-sm leading-snug text-muted-foreground">{desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* script accent + trust strip */}
        <div className="relative hidden lg:block">
          <p className="font-script origin-left -rotate-2 text-3xl font-semibold leading-[1.15] text-primary">
            Good Food
            <br />
            Brighter Days <Heart className="inline h-5 w-5 fill-primary text-primary" aria-hidden />
          </p>
          <ul className="mt-5 flex flex-wrap items-center gap-x-7 gap-y-3">
            {TRUST.map(({ icon: Icon, line1, line2 }) => (
              <li key={line1} className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="text-[11px] leading-tight">
                  <span className="block font-semibold text-foreground/80">{line1}</span>
                  <span className="block text-muted-foreground">{line2}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </FadeIn>

      {/* ------------------------------ RIGHT: auth card ------------------------------ */}
      <FadeIn
        delay={0.08}
        className="relative flex items-center justify-center bg-white px-4 py-8 sm:px-8 dark:bg-card"
      >
        <div className="w-full max-w-md">
          <Card className="w-full rounded-3xl border-primary/10 p-6 shadow-lg shadow-primary/5 sm:p-8 dark:border-primary/15">
            <Tabs defaultValue="login" className="gap-5">
              <div className="text-center">
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                  Welcome to <span className="text-primary">NutriSLM</span> 🌱
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Sign in to continue your nutrition journey</p>
              </div>

              {/* rounded segmented control */}
              <TabsList className="h-11 w-full rounded-full bg-muted p-1">
                <TabsTrigger value="login" className={SEGMENTED_TRIGGER}>
                  Sign in
                </TabsTrigger>
                <TabsTrigger value="register" className={SEGMENTED_TRIGGER}>
                  Create account
                </TabsTrigger>
              </TabsList>

              {/* decorative social buttons (honest no-ops) */}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl text-[13px] font-medium"
                  onClick={() => handleSocial("Google")}
                >
                  <GoogleG />
                  Continue with Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl text-[13px] font-medium"
                  onClick={() => handleSocial("Apple")}
                >
                  <Apple className="h-4 w-4" aria-hidden />
                  Continue with Apple
                </Button>
              </div>

              {/* "or" divider */}
              <div aria-hidden className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <TabsContent value="login" className="mt-0">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit("login");
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="font-semibold text-foreground/90">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        className="h-11 rounded-xl pl-9"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password" className="font-semibold text-foreground/90">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="login-password"
                        type={showLoginPw ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        placeholder="Enter your password"
                        className="h-11 rounded-xl pl-9 pr-10"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPw((v) => !v)}
                        aria-label={showLoginPw ? "Hide password" : "Show password"}
                        aria-pressed={showLoginPw}
                        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {showLoginPw ? (
                          <EyeOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      Forgot password?
                    </button>
                  </div>
                  {error && (
                    <p
                      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl text-[15px] font-semibold"
                    disabled={busy !== null}
                  >
                    Sign in
                    {busy === "login" ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-0">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit("register");
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name" className="font-semibold text-foreground/90">
                      Full name
                    </Label>
                    <div className="relative">
                      <User
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="reg-name"
                        required
                        minLength={2}
                        maxLength={80}
                        autoComplete="name"
                        placeholder="Your name"
                        className="h-11 rounded-xl pl-9"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email" className="font-semibold text-foreground/90">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="reg-email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="you@example.com"
                        className="h-11 rounded-xl pl-9"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password" className="font-semibold text-foreground/90">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="reg-password"
                        type={showRegPw ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        minLength={8}
                        placeholder="At least 8 characters"
                        className="h-11 rounded-xl pl-9 pr-10"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPw((v) => !v)}
                        aria-label={showRegPw ? "Hide password" : "Show password"}
                        aria-pressed={showRegPw}
                        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {showRegPw ? (
                          <EyeOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                  {error && (
                    <p
                      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      role="alert"
                    >
                      {error}
                    </p>
                  )}
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-xl text-[15px] font-semibold"
                    disabled={busy !== null}
                  >
                    Create account
                    {busy === "register" ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </form>
                <p className="mt-4 text-center text-xs text-muted-foreground">
                  Next step after signup: set up your health profile so targets and constraints fit you.
                </p>
              </TabsContent>

              {/* demo login */}
              <Button
                type="button"
                className="h-11 w-full rounded-xl bg-primary/10 font-semibold text-primary shadow-none hover:bg-primary/15"
                disabled={busy !== null}
                onClick={() => submit("demo")}
              >
                {busy === "demo" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden />
                )}
                Try the demo account
              </Button>
              <p className="text-center text-xs leading-relaxed text-muted-foreground">
                Demo login: demo@nutrislm.app • demo1234
                <br />
                (vegetarian, T2DM, peanut allergy)
              </p>
            </Tabs>
          </Card>

          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Leaf className="h-4 w-4 text-primary" aria-hidden />
            Eat Smarter • Live Healthier • Together
          </p>
        </div>
      </FadeIn>
    </div>
  );
}
