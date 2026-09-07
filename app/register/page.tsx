import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAccount } from "@/app/auth/actions";
import { isRegistrationEnabled } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";

type RegisterPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  if (await getCurrentUser()) redirect("/projects");
  const { error } = await searchParams;
  const registrationEnabled = isRegistrationEnabled();

  if (!registrationEnabled) {
    return (
      <div className="mx-auto grid max-w-md gap-6 pb-8">
        <header className="grid gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">Compte</p>
          <h1 className="text-3xl font-bold text-ink">Inscriptions fermées</h1>
          <p className="leading-7 text-ink/70">
            La création de nouveaux comptes est momentanément désactivée.
          </p>
        </header>
        <Link href="/login" className="rounded-xl bg-clay px-5 py-3 text-center font-semibold text-white transition hover:bg-clay/90">
          Se connecter
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-md gap-6 pb-8">
      <header className="grid gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-clay">Compte</p>
        <h1 className="text-3xl font-bold text-ink">Créer un compte</h1>
        <p className="leading-7 text-ink/70">Ton compte protège ta bibliothèque personnelle.</p>
      </header>

      <form action={registerAccount} className="grid gap-5 rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {error === "invalid"
              ? "Utilise une adresse valide et un mot de passe identique dans les deux champs."
              : "Impossible de créer le compte avec ces informations."}
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
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            aria-describedby="password-help"
            className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
          <span id="password-help" className="text-xs leading-5 text-ink/55">12 caractères minimum.</span>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-medium text-ink">Confirmer le mot de passe</span>
          <input
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            className="rounded-xl border border-ink/15 bg-white px-4 py-3 outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/20"
          />
        </label>
        <button type="submit" className="rounded-xl bg-clay px-5 py-3 font-semibold text-white transition hover:bg-clay/90">
          Créer mon compte
        </button>
      </form>

      <p className="text-center text-sm text-ink/65">
        Déjà un compte&nbsp;? <Link href="/login" className="font-semibold text-moss underline">Se connecter</Link>
      </p>
    </div>
  );
}
