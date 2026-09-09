# Stockage privé des cours — Lot 2

Les documents restent des données. Le lot ne réalise ni extraction, ni OCR, ni
compréhension, ni appel de provider. Les PDF sont contrôlés par extension, MIME,
en-tête de version et marqueur de fin. Les ODT doivent présenter une archive ZIP
cohérente, un premier fichier mimetype non compressé et les entrées standard.
Il ne s'agit pas d'un lecteur PDF/ODT complet ni d'un antivirus.

## Configuration

En développement uniquement, l'absence de SOURCE_STORAGE_ROOT utilise
storage/sources hors public. En production, un chemin absolu explicitement
configuré est obligatoire, par exemple /data/blablabox/sources sur un volume
privé persistant. L'application ne peut pas vérifier elle-même le montage du
volume : l'opérateur doit le vérifier dans le lot de déploiement dédié.

Le processus applicatif doit être le seul écrivain de ce volume. Les liens
symboliques et jonctions dans le chemin sont refusés, ainsi que les chemins
publics résolus. Les noms internes sont des UUID v4 indépendants des noms fournis.
Le volume doit supporter les liens physiques sur le même système de fichiers.
Aucun chemin, storageKey ou variable de stockage n'est transmis au client.

SOURCE_UPLOAD_MAX_BYTES vaut 26214400 (25 Mio) par défaut. Une configuration
invalide échoue explicitement. La réception, y compris sans Content-Length,
est limitée au plafond du fichier plus 64 Kio d'enveloppe multipart. Le fichier
lui-même est limité au plafond configuré avant validation et publication.
L'upload reste traité en mémoire bornée ; ce lot n'ajoute pas de quotas de compte
ou de limite globale de requêtes concurrentes.

Le navigateur doit envoyer un Origin correspondant au Host public conservé par
le proxy. Les en-têtes forwarded non configurés ne sont pas utilisés pour accorder
l'accès. Les téléchargements exigent la session et le propriétaire, utilisent
private, no-store, nosniff et un nom ASCII de repli plus filename* UTF-8.

## Transaction d'import

1. Valider les octets et calculer leur SHA-256 côté serveur.
2. Écrire un temporaire exclusif dans le volume privé.
3. Dans une transaction PostgreSQL, verrouiller l'empreinte pour ce propriétaire.
4. Retrouver l'original ou créer sa ligne, puis enregistrer la trace d'import.
5. Rattacher uniquement un nouvel original à la partie demandée et passer celle-ci
   de « Document attendu » à « Document enregistré », sans modifier son identifiant.
6. Publier le nouveau fichier par lien physique exclusif avant de committer.
7. Nettoyer le temporaire dans tous les cas.

Un doublon crée une trace supplémentaire mais aucun rattachement implicite. Le
rattachement confirmé est idempotent. Le verrou est propre au compte ; la
contrainte UNIQUE(userId, sha256) reste la garantie en base. Supprimer une
hiérarchie retire ses rattachements, sans supprimer les originaux ni leurs traces.
Aucune fonction de suppression définitive d'original n'est exposée.

Une erreur avant publication annule les écritures de la transaction. Une erreur
après publication retire le fichier seulement si une lecture de réconciliation
confirme que sa clé n'existe pas en base. Si la réponse COMMIT est perdue ou si la
base n'est plus joignable, le fichier est conservé pour éviter de détruire un
original potentiellement committé. Un nouvel essai pourra être reconnu comme
doublon. Une publication refusée ne supprime jamais un fichier déjà présent.

## Réconciliation après crash ou indisponibilité

La base et le système de fichiers ne forment pas une transaction distribuée.
Un arrêt brutal peut laisser un temporaire ou un original sans ligne ; une
intervention extérieure sur le volume peut aussi retirer un original référencé.

Après rétablissement, un opérateur autorisé doit :

1. Suspendre les imports et confirmer qu'aucun processus n'écrit encore.
2. Sauvegarder ensemble le volume et la base ciblés.
3. Comparer les UUID physiques aux storageKey de SourceAsset, en lecture seule.
4. Vérifier taille et SHA-256 des fichiers référencés, et inventorier les absents.
5. Mettre les temporaires et fichiers non référencés en quarantaine privée, après
   vérification de leur ancienneté et de l'absence de transaction en cours.
6. Restaurer les fichiers référencés manquants depuis la sauvegarde ; ne pas
   supprimer leurs traces ou rattachements pour masquer le problème.
7. Réouvrir les imports après contrôle. Toute suppression définitive exige une
   autorisation distincte ; aucun nettoyage destructif automatique n'est ajouté.

L'audit teste les rollbacks avant et après publication et l'absence de temporaires
après les scénarios. Il ne prétend pas reproduire une panne matérielle ou garantir
la persistance d'un volume de production non déployé.
