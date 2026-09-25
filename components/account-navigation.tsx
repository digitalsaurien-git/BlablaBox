import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { isRegistrationEnabled } from "@/lib/auth/registration";
import { getCurrentUser } from "@/lib/auth/session";

export async function AccountNavigation() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    const registrationEnabled = isRegistrationEnabled();
    return (
      <div className="flex items-center gap-1 text-sm sm:gap-2">
        <Link href="/login" className="rounded-md px-3 py-2 text-ink/75 transition hover:bg-mist hover:text-ink">
          Connexion
        </Link>
        {registrationEnabled ? (
          <Link href="/register" className="rounded-md bg-ink px-3 py-2 font-medium text-paper transition hover:bg-moss">
            Créer un compte
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 text-sm sm:gap-2">
      <Link href="/projects" className="rounded-md px-3 py-2 text-ink/75 transition hover:bg-mist hover:text-ink">
        Bibliothèque
      </Link>
      <Link href="/courses" className="rounded-md px-3 py-2 text-ink/75 transition hover:bg-mist hover:text-ink">
        Mes cours
      </Link>
      <Link href="/usage" className="rounded-md px-3 py-2 text-ink/75 transition hover:bg-mist hover:text-ink">
        Utilisation
      </Link>
      <Link href="/understand/new" className="rounded-md bg-ink px-3 py-2 font-medium text-paper transition hover:bg-moss">
        Comprendre
      </Link>
      <form action={logout}>
        <button type="submit" className="rounded-md px-3 py-2 text-ink/65 transition hover:bg-mist hover:text-ink">
          Déconnexion
        </button>
      </form>
    </div>
  );
}
