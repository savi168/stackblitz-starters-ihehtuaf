# Sécurité — Windows Authentication (Negotiate / Kerberos) + rôles

Comment restreindre le **Workbench**, le **Backend Cockpit** et l'**Admin** à
certains utilisateurs, avec l'authentification Windows (le modèle intranet
bancaire classique : pas de mot de passe géré par l'app, pas de token à
stocker — c'est la session Windows du poste qui authentifie).

## Le modèle

```
Navigateur (session Windows)          API .NET                      Rôles
────────────────────────────  Negotiate/Kerberos  ─────────────────────────
GET  /api/...        ──────────────────────────►  authentifié ?  → Reader
PUT/POST/DELETE /api/...  ──────────────────────►  rôle Admin ?  → Admin
```

- **Reader** (tout utilisateur Windows authentifié) : lecture seule — Management
  Report, KPI Analysis… Toute mutation (PUT/POST/DELETE) est refusée par
  l'API avec un **403** (`MutationsRequireAdminFilter`).
- **Admin** (utilisateurs/groupes configurés) : tout, y compris Workbench,
  Cockpit, imports et éditions.
- Le front masque les modules admin (menu, Hub, routes) pour les non-admins —
  mais c'est du confort : **la règle est appliquée côté API**, contourner
  l'interface ne sert à rien.

## Activer (dev sur ton PC — testable sans IIS)

Kestrel supporte Negotiate/NTLM sous Windows. Dans
`backend/RegReport.Api/appsettings.Development.local.json` (gitignoré) :

```json
{
  "Security": {
    "Mode": "Windows",
    "AdminUsers": [ "DESKTOP-4K3DKKG\\savi" ],
    "AdminGroups": []
  }
}
```

> Ton identité exacte : ouvre PowerShell → `whoami` (ex. `desktop-4k3dkkg\savi`).
> La casse est ignorée.

Relance `dotnet run`, recharge le front :
- Le navigateur fait le handshake NTLM automatiquement sur `localhost`
  (Edge/Chrome : aucun prompt ; Firefox demande éventuellement une fois).
- En haut à droite du menu : ton nom d'utilisateur (et « read-only » si Reader).
- Test lecture seule : retire-toi de `AdminUsers`, relance l'API → les onglets
  Workbench/Backend/Admin disparaissent et tout PUT renvoie 403.

Pour revenir en mode ouvert : `"Mode": "None"` (ou supprime la section).

## Déploiement entreprise (IIS, plus tard)

1. Héberger l'API sur **IIS** (module ASP.NET Core) avec
   **Windows Authentication activée** (et Anonymous désactivée) — l'app
   fonctionne à l'identique, IIS fait le Kerberos.
2. Remplacer `AdminUsers` par des **groupes AD** gérés par l'IT :
   ```json
   "AdminGroups": [ "EFG\\RegReport-Admins" ]
   ```
   L'appartenance au groupe donne le rôle Admin, révocation centralisée.
3. `Cors:AllowedOrigins` : ajouter l'URL de déploiement du front
   (`AllowCredentials` est déjà activé — origines explicites obligatoires).
4. Kerberos : si le front et l'API sont sur des hosts différents, demander à
   l'IT d'enregistrer le **SPN** (`setspn -S HTTP/regreport-api.efg.local …`).

## Endpoints & composants

| Élément | Rôle |
|---|---|
| `GET /api/auth/me` | Renvoie `{ name, roles, securityMode }` — appelé par le front au démarrage |
| `Security/RoleClaimsTransformation.cs` | Mappe l'identité Windows → rôles Reader/Admin |
| `Security/MutationsRequireAdminFilter.cs` | GET = authentifié ; PUT/POST/DELETE = Admin |
| Front `dataRepository.currentUser()` | `credentials: 'include'` sur tous les fetch |
| Front `AdminRoute` + filtres nav/Hub | Masque Workbench / Cockpit / Admin aux Readers |

## Migration Entra ID (Azure AD) plus tard

Le filtre de rôles et le front ne changent pas. Côté API, remplacer le bloc
`AddNegotiate()` par `Microsoft.Identity.Web` (validation JWT) et mapper les
rôles depuis les *app roles* / groupes du token — voir `docs/BACKEND.md` §7.
Côté front, ajouter MSAL pour obtenir le token et l'injecter dans
`ApiRepository.headers()` (l'emplacement est déjà commenté dans le code).
