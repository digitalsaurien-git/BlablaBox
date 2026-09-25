/**
 * Messages d'erreur et d'interface centralisés (Q-5).
 * Tous les textes visibles par l'utilisateur qui étaient dispersés
 * dans app/ et lib/ sont regroupés ici pour faciliter la maintenance.
 */

// ─── Authentification ───────────────────────────────────────────────────────

export const MSG_AUTH_UNAVAILABLE =
  "Connexion momentanément indisponible. Réessaie plus tard.";
export const MSG_AUTH_FAILED =
  "Connexion impossible. Vérifie tes informations ou réessaie plus tard.";

// ─── Projets ────────────────────────────────────────────────────────────────

export const MSG_PROJECT_DB_ERROR = "Connexion base impossible";
export const MSG_PROJECT_GENERATION_UNKNOWN = "Erreur inconnue de génération";
export const MSG_PROJECT_REGENERATION_UNKNOWN = "Erreur inconnue de régénération";

// ─── Parcours d'apprentissage ────────────────────────────────────────────────

/** Affiché lorsque la génération n'a pas abouti (understand/actions.ts). */
export const MSG_GENERATION_FAILED =
  "La génération n’a pas abouti. Réessayez ultérieurement.";

/** Affiché lorsque le projet a été modifié pendant la génération. */
export const MSG_GENERATION_CONCURRENT_EDIT =
  "Le projet a été modifié pendant la génération.";

/** Affiché sur la page d'erreur cours (app/courses/error.tsx). */
export const MSG_COURSE_ERROR_BOUNDARY =
  "La connexion a peut-être été interrompue. Reviens au formulaire pour retrouver ton travail. Aucune préparation ne sera relancée automatiquement.";

// ─── Préparation et audio ────────────────────────────────────────────────────

/** Affiché par LearningError (code "source"). */
export const MSG_LEARNING_SOURCE =
  "Je ne peux pas le vérifier avec ce cours. Vérifie sa lecture : une partie peut être incertaine, trop longue ou insuffisante pour cette activité.";

/** Affiché par LearningError (code "provider"). */
export const MSG_LEARNING_PROVIDER =
  "Ce service n’est pas encore configuré. Tu peux toujours lire les passages disponibles.";

/** Affiché par LearningError (code "timeout"). */
export const MSG_LEARNING_TIMEOUT =
  "La préparation a dépassé le délai autorisé. Aucun contenu incomplet n’a remplacé ton travail. Tu peux réessayer plus tard.";

/** Affiché par LearningError (code "pending"). */
export const MSG_LEARNING_PENDING =
  "Cette préparation est déjà en cours ou terminée. Recharge la page. Si elle reste bloquée, demande de l’aide au propriétaire du site.";

/** Affiché par LearningError (code par défaut). */
export const MSG_LEARNING_FAILED =
  "La préparation n’a pas abouti. Aucun contenu incomplet n’a remplacé ton travail. Tu peux réessayer.";

/** Affiché par LearningPreparationError (code "reading"). */
export const MSG_LEARNING_READING =
  "Je n’arrive pas encore à lire assez de texte pour cette activité. Tu peux améliorer la lecture des pages en images ou ajouter un document plus lisible.";

// ─── LearningFailure / erreurs internes ────────────────────────────────────

/**
 * Message du constructeur LearningFailure pour le code TIMEOUT.
 * Également utilisé comme constante LLM_TIMEOUT_MESSAGE dans course-provider.ts.
 * Les deux doivent rester identiques pour que learningErrorCode() fonctionne.
 */
export const MSG_TIMEOUT_INTERNAL =
  "Le service de préparation a dépassé le délai autorisé.";

/** Message du constructeur LearningFailure pour les autres codes. */
export const MSG_UNVERIFIABLE_INTERNAL = "La production ne peut pas être vérifiée.";

// ─── Lecture de cours ────────────────────────────────────────────────────────

/**
 * Lancé quand aucun passage vérifié n'est disponible.
 * Reconnu par learningErrorCode() → SOURCE_UNUSABLE.
 */
export const MSG_COURSE_READING_REQUIRED =
  "Aucun passage vérifié n’est encore disponible pour travailler ce cours.";

// ─── Entités introuvables ────────────────────────────────────────────────────

export const MSG_NOT_FOUND_CONTENT   = "Contenu introuvable.";
export const MSG_NOT_FOUND_ACTIVITY  = "Activité requise.";
export const MSG_NOT_FOUND_AUDIO     = "Audio introuvable.";
export const MSG_NOT_FOUND_QUESTION  = "Question introuvable.";
export const MSG_NOT_FOUND_COURSE    = "Cours introuvable.";
export const MSG_NOT_FOUND_PAGE      = "Page introuvable.";
export const MSG_NOT_FOUND_SESSION   = "Activité introuvable.";

/** Lancé quand le passage lu est insuffisant pour l'OCR. */
export const MSG_INSUFFICIENT_TEXT = "Je ne peux pas le vérifier avec ce cours.";

/** Lancé quand la réponse feedback est demandée avant la question. */
export const MSG_FEEDBACK_BEFORE_ANSWER = "Réponds d’abord à cette question.";

/** Lancé par learning-helpers.ts quand la préparation est occupée. */
export const MSG_BUSY_PREPARATION =
  "Cette préparation est déjà en cours ou terminée. Recharge la page. Une opération interrompue doit être vérifiée avant une nouvelle tentative.";

// ─── Audio ───────────────────────────────────────────────────────────────────

/** Lancé quand le provider TTS est désactivé. */
export const MSG_TTS_DISABLED =
  "La génération audio est désactivée. Configurez TTS_PROVIDER=openai.";

/** Lancé quand la génération audio globale échoue. */
export const MSG_AUDIO_GENERATION_FAILED =
  "La génération audio a échoué. Réessayez ultérieurement.";

// ─── Session de cours ────────────────────────────────────────────────────────

export const MSG_SESSION_NOT_FOUND = "Session introuvable.";
export const MSG_SESSION_EXPIRED   = "Session expirée.";
export const MSG_SESSION_STARTED   = "Session déjà démarrée.";
export const MSG_SESSION_ENDED     = "Session terminée.";

// ─── Lecture de cours (advisory lock) ───────────────────────────────────────

export const MSG_READING_IN_PROGRESS =
  "La lecture est déjà en cours. Réessaie dans un instant.";
