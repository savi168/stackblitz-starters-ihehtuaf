using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

/// <summary>
/// Document library: files stored INSIDE the RegReport database (varbinary),
/// so a DB backup covers every document and everything stays offline.
/// Deliberately outside the /api/data aggregate — the list returns metadata
/// only, the bytes are streamed on demand by the download endpoint.
/// Mutations (upload/delete) are Admin-only via the global mutations filter.
/// </summary>
[ApiController]
[Route("api/documents")]
public class DocumentsController : ControllerBase
{
    private const long MaxUploadBytes = 256L * 1024 * 1024; // 256 MB per file

    private readonly AppDbContext _db;
    public DocumentsController(AppDbContext db) { _db = db; }

    /// <summary>Metadata of every document — never the content.</summary>
    [HttpGet]
    public async Task<ActionResult<object>> List() =>
        await _db.Documents
            .Select(d => new
            {
                d.Id, d.Folder, d.Title, d.FileName, d.ContentType, d.SizeBytes,
                d.Entity, d.Date, d.Kind, d.Notes, d.UploadedBy, d.UploadedAt,
            })
            .OrderBy(d => d.Folder).ThenBy(d => d.FileName)
            .ToListAsync();

    [HttpGet("{id:long}/download")]
    public async Task<IActionResult> Download(long id)
    {
        var doc = await _db.Documents.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id);
        if (doc is null) return NotFound();
        return File(doc.Content,
            string.IsNullOrWhiteSpace(doc.ContentType) ? "application/octet-stream" : doc.ContentType,
            doc.FileName);
    }

    public class DocumentUpload
    {
        public IFormFile? File { get; set; }
        public string? Folder { get; set; }
        public string? Title { get; set; }
        public string? Entity { get; set; }
        public string? Date { get; set; }
        public string? Kind { get; set; }
        public string? Notes { get; set; }
    }

    [HttpPost]
    [RequestSizeLimit(MaxUploadBytes + 1024 * 1024)]
    public async Task<ActionResult<object>> Upload([FromForm] DocumentUpload form)
    {
        if (form.File is null || form.File.Length == 0)
            return Problem("A file is required.", statusCode: 400);
        if (form.File.Length > MaxUploadBytes)
            return Problem($"File too large (max {MaxUploadBytes / (1024 * 1024)} MB).", statusCode: 400);

        using var ms = new MemoryStream();
        await form.File.CopyToAsync(ms);

        var doc = new StoredDocument
        {
            Folder = (form.Folder ?? "").Replace('\\', '/').Trim().Trim('/'),
            Title = string.IsNullOrWhiteSpace(form.Title) ? form.File.FileName : form.Title.Trim(),
            FileName = Path.GetFileName(form.File.FileName),
            ContentType = string.IsNullOrWhiteSpace(form.File.ContentType)
                ? "application/octet-stream" : form.File.ContentType,
            SizeBytes = form.File.Length,
            Content = ms.ToArray(),
            Entity = string.IsNullOrWhiteSpace(form.Entity) ? null : form.Entity.Trim(),
            Date = string.IsNullOrWhiteSpace(form.Date) ? null : form.Date.Trim(),
            Kind = string.IsNullOrWhiteSpace(form.Kind) ? null : form.Kind.Trim(),
            Notes = string.IsNullOrWhiteSpace(form.Notes) ? null : form.Notes.Trim(),
            UploadedBy = User.Identity?.Name ?? "anonymous",
            UploadedAt = DateTime.UtcNow.ToString("o"),
        };
        _db.Documents.Add(doc);
        await _db.SaveChangesAsync();
        return new { doc.Id, doc.Folder, doc.Title, doc.FileName, doc.SizeBytes };
    }

    public class DocumentMetaUpdate
    {
        public string? Folder { get; set; }
        public string? Title { get; set; }
        public string? Entity { get; set; }
        public string? Date { get; set; }
        public string? Kind { get; set; }
        public string? Notes { get; set; }
    }

    /// <summary>Metadata-only update — move to another folder, rename, retag.
    /// Only provided fields change; the content never does.</summary>
    [HttpPut("{id:long}")]
    public async Task<IActionResult> Update(long id, DocumentMetaUpdate form)
    {
        var doc = await _db.Documents.FindAsync(id);
        if (doc is null) return NotFound();
        if (form.Folder is not null) doc.Folder = form.Folder.Replace('\\', '/').Trim().Trim('/');
        if (!string.IsNullOrWhiteSpace(form.Title)) doc.Title = form.Title.Trim();
        if (form.Entity is not null) doc.Entity = string.IsNullOrWhiteSpace(form.Entity) ? null : form.Entity.Trim();
        if (form.Date is not null) doc.Date = string.IsNullOrWhiteSpace(form.Date) ? null : form.Date.Trim();
        if (form.Kind is not null) doc.Kind = string.IsNullOrWhiteSpace(form.Kind) ? null : form.Kind.Trim();
        if (form.Notes is not null) doc.Notes = string.IsNullOrWhiteSpace(form.Notes) ? null : form.Notes.Trim();
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var doc = await _db.Documents.FindAsync(id);
        if (doc is null) return NotFound();
        _db.Documents.Remove(doc);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
