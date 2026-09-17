"use client";

/**
 * Login / register card with one-click demo login.
 */
import { useState } from "react";
import { Camera, Loader2, Salad, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api, ApiError } from "@/lib/client/api";
import { useNutriStore } from "./store";
import { FadeIn } from "./fade-in";

const DEMO = { email: "demo@nutrislm.app", password: "demo1234" };

export function AuthView() {
  const setSession = useNutriStore((s) => s.setSession);
  const { toast } = useToast();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
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

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-8">
      <FadeIn>
        <div className="text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Salad className="h-7 w-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Personalized nutrition, intelligently logged</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Describe food in any language or snap a photo — we parse it, verify it against clinical guidance, and
            recommend what to eat next.
          </p>
          <ul className="mx-auto mt-4 grid max-w-sm gap-2 text-left text-xs text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
              </span>
              AI understands English, தமிழ், తెలుగు, हिन्दी, ಕನ್ನಡ — and food photos
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              </span>
              Verified IFCT/USDA nutrition facts — never invented by AI
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Camera className="h-3.5 w-3.5" aria-hidden />
              </span>
              Evidence-based guidance for diabetes, kidney & heart health
            </li>
          </ul>
        </div>
      </FadeIn>

      <FadeIn delay={0.1} className="w-full">
        <Card className="w-full shadow-lg shadow-primary/5">
        <Tabs defaultValue="login">
          <CardHeader className="pb-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign in</TabsTrigger>
              <TabsTrigger value="register">Create account</TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            <TabsContent value="login" className="mt-0 space-y-3">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit("login");
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                  />
                </div>
                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "login" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Sign in
                </Button>
              </form>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy !== null}
                onClick={() => submit("demo")}
              >
                {busy === "demo" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4 text-primary" aria-hidden />
                )}
                Try the demo account
              </Button>
            </TabsContent>

            <TabsContent value="register" className="mt-0 space-y-3">
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit("register");
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Name</Label>
                  <Input id="reg-name" required minLength={2} maxLength={80} placeholder="Your name" value={regName} onChange={(e) => setRegName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" autoComplete="email" required placeholder="you@example.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </div>
                {error && (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "register" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  Create account
                </Button>
              </form>
              <p className="text-center text-xs text-muted-foreground">
                Next step after signup: set up your health profile so targets and constraints fit you.
              </p>
            </TabsContent>
          </CardContent>
          <CardFooter className="justify-center pb-4">
            <p className="text-center text-[11px] text-muted-foreground">
              Demo login: demo@nutrislm.app · demo1234 (vegetarian, T2DM, peanut allergy)
            </p>
          </CardFooter>
        </Tabs>
        </Card>
      </FadeIn>
    </div>
  );
}
