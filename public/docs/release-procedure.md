# RegReport — Release & upgrade procedure

This procedure covers both deployment modes (Windows zip and Docker). In
both cases the golden rule is the same: **data is never lost** — the database
schema is upgraded automatically when the API starts (additive, idempotent
migrations, recorded in the `__SchemaMigrations` table).

---

## 0. Before any release — backups (know your two safety nets)

There are two layers, for two situations:

**A. The IT database backups — the real safety net.**
In the enterprise you will typically be an *application* admin, not a
sysadmin on the SQL server — and that is fine: database backups are the
DBA's job, not yours. Before go-live, ask IT three questions, once:

1. Is the `RegReport` database included in the standard backup plan
   (full + transaction-log backups)?
2. Is the database in **FULL recovery model**? That is what makes
   **point-in-time restore** possible.
3. What is the process to request a restore (ticket, SLA)?

On your own machine (where you ARE the admin), the equivalent is simply:

```sql
BACKUP DATABASE RegReport TO DISK = 'C:\Backups\RegReport_before_vX.Y.Z.bak'
```

**B. The self-service application archive — what YOU can always do.**
Admin → Backup & restore → **Download full archive (ZIP)** produces one
file containing the whole central data (`central-data.json`) and every
Library document. No server rights needed — store it on a network share.
Take one before each release; it takes seconds.

Finally, note the version currently in production (header badge, or
Admin → System).

---

## 1. Prepare the release (development side)

1. Bump the version number — **one single place**:
   `src/version.ts` → `APP_VERSION = 'X.Y.Z'`.
2. Append a section to the **release notes**
   (`public/docs/release-notes.md`, newest first): what changed, the schema
   migrations shipped, upgrade notes. They stay consultable forever in
   Library → *Release notes (version history)*.
3. Commit, then build the deliverable:
   - **Zip mode**: `.\scripts\release.ps1` (the version is read from
     version.ts automatically) → `releases\RegReport-vX.Y.Z.zip`;
   - **Docker mode**: `docker build -t regreport:X.Y.Z .` then, with a
     registry, `docker push <registry>/regreport:X.Y.Z`. Rebuild at every
     release (base-image and NuGet security patches come with the build)
     and, if the platform scans images, run Trivy yourself first — see
     "Security scanning" in `docs/DOCKER.md`.
4. The number propagates everywhere: header badge, VERSION.txt, the API
   assembly, `GET /api/meta`.

---

## 2A. Upgrade — Windows zip deployment

1. Copy the zip to the target machine.
2. **Stop the API**: `Ctrl+C` in its window, or
   `Stop-Process -Name RegReport.Api -Force`.
3. Rename the current folder (e.g. `RegReport_old`) — that is your instant
   rollback — then unzip the new version in its place.
4. **Copy `appsettings.Production.local.json` back** from the old folder
   into the new one (it holds THIS machine's connections and security; it
   never ships inside the zip).
5. Start `RegReport.Api.exe`.
6. In the console, watch for `Schema migration applied: ...` lines — that
   is the database upgrading itself.

## 2B. Upgrade — Docker deployment

1. On the host/platform: pull the new image
   (`docker pull <registry>/regreport:X.Y.Z`, or `--build` locally).
2. Update the image tag in `docker-compose.yml` (or the deployment
   definition), then:

```
docker compose up -d
```

   The container is stateless: it is replaced, the data stays in SQL
   Server. Downtime: a few seconds.
3. `docker compose logs regreport` → check the
   `Schema migration applied: ...` lines.

---

## 3. Post-upgrade checks (1 minute)

- [ ] The **header badge** shows the new version and the right environment
      (PROD/TEST);
- [ ] **Admin → System**: same API version, the new migrations listed with
      today's date, MERCURY connected;
- [ ] **Admin → Data inventory**: counters consistent with pre-release
      (no dataset dropped to zero);
- [ ] Open the **Management Report** on a known entity: the numbers are
      there;
- [ ] `Ctrl+F5` on user machines if the interface looks stale (browser
      cache).

---

## 4. Rolling back — and what if a release breaks the DATA?

Two very different situations:

**Rolling back the application (no data damage).**
The schema is **additive** (migrations add, never drop), so the previous
application version runs fine on the upgraded database:

- **Zip**: stop the API, put back the `RegReport_old` folder, restart;
- **Docker**: `docker compose up -d` with the previous image tag.

No database restore needed.

**Restoring data to a given point in time (data was damaged).**
This is where the IT backups earn their keep. With FULL recovery model and
log backups, the DBA can restore the database **to any chosen moment**:

```sql
RESTORE DATABASE RegReport_Restore FROM DISK = '…full.bak' WITH NORECOVERY;
RESTORE LOG RegReport_Restore FROM DISK = '…log.trn'
    WITH STOPAT = '2026-09-09 14:00', RECOVERY;
```

Best practice: ask for the restore into a **side-by-side copy**
(`RegReport_Restore`), compare with the live database, and copy back only
what was damaged — instead of wiping everything since the incident.
The application-level fallback, if IT restore is unavailable: restore the
`central-data.json` of your ZIP archive through Admin → Restore, and
re-upload the documents from the archive's `documents/` folder.

---

## 5. Edge cases

- **A major release that transforms data**: the migrator runs such a step
  exactly once (`__SchemaMigrations`) — the release note will call it out;
  the step-0 backups matter even more that day.
- **A migration fails at startup**: the API deliberately refuses to start
  and the log names the failing step; the equivalent manual script is in
  the repository's `docs/` folder for a fix via SSMS, then restart.
- **Several environments**: always roll the release on **TEST** first
  (container or second folder), run the checklist, then PROD.
