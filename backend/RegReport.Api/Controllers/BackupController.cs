using System.IO.Compression;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;

namespace RegReport.Api.Controllers;

/// <summary>
/// Self-service application-level archive: a single ZIP containing the whole
/// central data document (central-data.json) plus every Library document
/// (documents/manifest.json + the files). Designed for users who administer
/// the APPLICATION but have no rights on the SQL server itself — they can
/// download an archive before a release and store it wherever they want.
/// It complements, not replaces, the IT database backups (BACKUP DATABASE /
/// point-in-time restore remain the real safety net).
/// </summary>
[ApiController]
[Route("api/backup")]
public class BackupController : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOpts =
        new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private readonly AppDbContext _db;
    public BackupController(AppDbContext db) { _db = db; }

    [HttpGet("archive")]
    public async Task Archive()
    {
        Response.ContentType = "application/zip";
        Response.Headers.ContentDisposition =
            $"attachment; filename=RegReport-archive-{DateTime.Now:yyyyMMdd-HHmm}.zip";

        using var zip = new ZipArchive(Response.BodyWriter.AsStream(), ZipArchiveMode.Create);

        // 1. The whole central data document (same shape as GET /api/data —
        //    restorable through the Admin JSON restore).
        var data = await CentralDataStore.ComposeAsync(_db);
        await using (var s = zip.CreateEntry("central-data.json").Open())
            await JsonSerializer.SerializeAsync(s, data, JsonOpts);

        // 2. Library documents: metadata manifest + one file per document,
        //    loaded one at a time so a large library does not sit in memory.
        var metas = await _db.Documents.AsNoTracking()
            .Select(d => new
            {
                d.Id, d.Folder, d.Title, d.FileName, d.ContentType, d.SizeBytes,
                d.Entity, d.Date, d.Kind, d.Notes, d.UploadedBy, d.UploadedAt,
            })
            .OrderBy(d => d.Id)
            .ToListAsync();
        await using (var s = zip.CreateEntry("documents/manifest.json").Open())
            await JsonSerializer.SerializeAsync(s, metas, JsonOpts);

        foreach (var m in metas)
        {
            var content = await _db.Documents.AsNoTracking()
                .Where(d => d.Id == m.Id)
                .Select(d => d.Content)
                .FirstOrDefaultAsync();
            if (content is null) continue;
            var safe = string.Join("_", m.FileName.Split(Path.GetInvalidFileNameChars()));
            await using var s = zip.CreateEntry($"documents/{m.Id}_{safe}").Open();
            await s.WriteAsync(content);
        }
    }
}
