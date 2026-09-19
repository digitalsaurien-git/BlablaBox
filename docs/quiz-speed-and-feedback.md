# QCM : contrat court et retour après réponse

## Diagnostic en lecture seule du 14 septembre 2026

L'application exécutait `87683cb7af48bd975afb41770334b205289c90e2`.
La dernière génération QCM observée est terminée, et non bloquée.
Les compteurs ont été lus dans une transaction PostgreSQL explicitement en
lecture seule. Aucun contenu pédagogique, compte ou secret n'a été exporté.

| Mesure des traces serveur | Durée |
| --- | ---: |
| Début de trace jusqu'à `generation-start` (préparation incluse) | 65 ms |
| `generation-start` → `generation-end` | 75 691 ms |
| `validation-start` → `validation-end` | 28 ms |
| `audit-start` → `audit-end` | 17 757 ms |
| `transaction-start` → `done` (transaction **et** création de session) | 47 ms |
| Durée totale depuis le début de trace | 93 592 ms |

Les intervalles restants entre événements représentent 4 ms. Il n'existe pas
d'événement `transaction-end` : les 47 ms ne sont donc pas une mesure séparée
du seul commit SQL. Le délai production `done` → affichage n'est pas instrumenté.

`ProviderUsage learning` : `DONE`, provider `openai`, durée **93 516 ms**,
création `2026-09-14T14:11:20.011Z`. La version est créée à
`2026-09-14T14:12:53.522Z`; deux sessions la référencent. Les traces montrent
exactement une génération et un audit, sans relance automatique :

| Appel | Jetons d'entrée | Jetons de sortie |
| --- | ---: | ---: |
| Génération | 824 | 3 374 |
| Audit (différence des compteurs cumulés) | 1 241 | 1 069 |
| Total | 2 065 | 4 443 |

Ces compteurs incluent les jetons de sortie comptabilisés par le provider ; les
traces ne séparent pas raisonnement et texte visible. Le journal P2002 précédent
est compatible avec la reprise explicite d'une opération FAILED prévue dans
`claim`; la génération démarre à 65 ms. Ce conflit n'explique pas les 90 secondes.

## Modification limitée au QCM

- Schéma strict : quatre questions pour cinq minutes, huit pour dix minutes.
  Chaque question contient seulement énoncé, trois choix identifiés, identifiant
  correct (serveur), courte explication et identifiants de segments vérifiés.
- Aucun contenu d'une autre activité demandé au modèle. Citations exactes
  reconstruites depuis le catalogue du cours chargé pour le compte connecté.
  Les questions sans réponse et les preuves incertaines sont exclues.
- Plafond génération : **2 400** jetons pour cinq minutes (auparavant 5 000),
  **4 000** pour dix minutes. Audit : **1 200** / **1 800** jetons. Raisonnement
  et verbosité faibles uniquement pour les modèles de la liste compatible déjà
  utilisée dans le dépôt. Autres modèles : aucun paramètre non pris en charge.
- Toujours deux appels maximum, même signal global de 120 secondes par défaut,
  lecture des corps incluse, aucune relance. Un audit négatif ou incomplet
  empêche la publication, sans produire un QCM partiel.
- Audit par question : faits soutenus, réponse unique, distracteurs plausibles
  et homogènes selon la matière. Les fausses options ne sont pas traitées comme
  des faits exigeant une citation. Énoncé, réponse correcte, explication, nombres
  et unités restent soumis aux contrôles déterministes de preuve.
- Contrôles locaux complémentaires : doublons, écarts de longueur excessifs,
  bonne réponse systématiquement plus longue, unité incohérente, alternatives
  numériques équivalentes et continents proposés pour une région d'Afrique.
  La sémantique générale reste contrôlée par l'audit, pas par ces heuristiques.
- Cache QCM versionné et dépendant de la matière : les anciennes sessions ne
  sont pas modifiées et ne remplacent pas une nouvelle préparation.
- Segmentation : un nombre terminant une phrase reste dans sa preuve ; seuls
  les numéros placés en début de ligne sont traités comme libellés de liste.
  Un test reproduit la perte de `6.` avant correction, puis contrôle la
  conservation exacte des résultats et l'exclusion des questions sans réponse.
- Réponse correcte : « Bien joué ! » et explication, sans recopier la réponse.
  Réponse incorrecte : indication sobre, bonne réponse et explication. Sources,
  bouton suivant, une question par écran et progression restent accessibles.

Le provider mock reste une démonstration locale de questions à trou avec choix
issus du texte; les tests de qualité sémantique utilisent des réponses structurées
simulées pour histoire-géographie, mathématiques et français. Aucun provider réel
n'a été appelé. Le gain de durée réel devra donc être mesuré après une future
livraison autorisée; aucun délai de production nouveau n'est annoncé ici.

## Vérification

Suite complète avec PostgreSQL jetable isolé, plus scénario Chrome sur build
de production : 181 tests et 13 tests navigateur, zéro échec et zéro ignoré.
Le navigateur couvre quatre réponses, réussite/erreur, fin de session, clavier,
320/390 px, réponses/corrections cachées avant tentative et isolation entre comptes.
Les appels OpenAI sont remplacés par des réponses simulées; l'audit négatif,
le corps bloqué et le budget partagé sont également testés.

TypeScript, Prisma validate/generate, build, contrôle Git et scan des bundles
sont requis avant le commit. Les sept migrations existantes sont appliquées
uniquement à la base jetable de vérification. Aucun schéma ni migration ajouté;
aucune donnée ou configuration de production modifiée, aucune livraison Coolify.
