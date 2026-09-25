import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/auth/actions";
import { isRegistrationEnabled } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";
import { MSG_AUTH_UNAVAILABLE, MSG_AUTH_FAILED } from "@/lib/messages";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (await getCurrentUser()) redirect("/projects");
  const { error } = await searchParams;
  const registrationEnabled = isRegistrationEnabled();

  return (
    <div className="mx-auto grid max-w-md gap-6 pb-8">
      <header className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">Compte</p>
        <h1 className="text-3xl font-bold text-ink">Se connecter</h1>
        <p className="leading-7 text-ink/70">Retrouve uniquement tes contenus et tes audios.</p>
      </header>

      <form action={login} className="grid gap-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error === "unavailable" ? MSG_AUTH_UNAVAILABLE : MSG_AUTH_FAILED}
          </p>
        ) : null}
        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Adresse e-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Mot de passe</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={12}
            maxLength={128}
            className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
        </label>
        <button type="submit" className="rounded-xl bg-clay px-5 py-3 font-semibold text-white transition hover:bg-clay/90">
          Se connecter
        </button>
      </form>

      {registrationEnabled ? (
        <p className="text-center text-sm text-ink/65">
          Pas encore de compte&nbsp;? <Link href="/register" className="font-semibold text-moss underline">Créer un compte</Link>
        </p>
      ) : null}
    </div>
  );
}
