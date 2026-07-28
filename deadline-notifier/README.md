# Deadline Notifier — Regulatory Reporting

Petite application autonome (aucun build, aucune dépendance) qui affiche les
échéances du reporting réglementaire suisse et envoie des **notifications de
préavis** dans le navigateur.

## Données

Les 41 rapports proviennent de `Copy of Masterlist Worldwide.xlsx` (onglet
`Masterlist_Swiss`) : code, description, fréquence, délai réglementaire et
entités concernées. Ils sont embarqués dans `index.html` (constante
`MASTERLIST`) — pour mettre la liste à jour, modifiez ce tableau.

Chaque échéance est calculée comme **fin de période** (fin de mois, de
trimestre, de semestre ou d'année selon la fréquence) **+ délai réglementaire**
(« 20 days », « 6 weeks », « 2 months »…).

## Notifications

- « Activer les notifications » demande la permission au navigateur.
- Choisissez le préavis (1 à 30 jours avant l'échéance).
- La vérification se fait à l'ouverture de l'app puis toutes les 30 minutes
  tant qu'elle est ouverte ; chaque échéance n'est notifiée qu'une fois
  (mémorisé dans `localStorage`).
- Sur Android, installez l'app (menu Chrome → *Ajouter à l'écran d'accueil*) :
  les notifications passent par le service worker.

Limite : sans serveur de push, les notifications ne partent que quand l'app
est ouverte (ou rouverte). Ouvrez-la le matin — elle vérifie immédiatement.

## Déploiement

Servez simplement le dossier tel quel (GitHub Pages, IIS, nginx, SharePoint…) :

```
index.html            l'application (données + logique + UI)
manifest.webmanifest  manifeste PWA (installation sur smartphone)
sw.js                 service worker (offline + notifications Android)
icons/                icônes générées
```

Il faut du **HTTPS** (ou `localhost`) pour les notifications et le service
worker. Pour un test local : `python3 -m http.server` dans ce dossier.
