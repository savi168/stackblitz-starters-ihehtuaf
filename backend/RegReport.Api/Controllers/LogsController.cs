using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

/// <summary>
/// In-app logs.
///  - /api/logs/tech: the process-local technical ring buffer (HTTP requests,
///    startup, migrations, errors) — a debugging aid.
///  - /api/logs/business: the persistent ChangeLogs audit trail (who changed
///    which dataset, when, and what). Writes go through the standard
///    admin-only mutation filter.
/// </summary>
[ApiController]
[Route("api/logs")]
public class LogsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly TechLogBuffer _buffer;
    public LogsController(AppDbContext db, TechLogBuffer buffer) { _db = db; _buffer = buffer; }

    [HttpGet("tech")]
    public IActionResult Tech([FromQuery] int take = 500) =>
        Ok(_buffer.Snapshot(Math.Clamp(take, 1, 1000)));

    /// <summary>
    /// Audit trail, newest first. `dataset` + `rowKey` narrow the query to a
    /// single row's history (served by the (Dataset, RowKey) index).
    /// </summary>
    [HttpGet("business")]
    public async Task<IActionResult> Business(
        [FromQuery] int take = 300,
        [FromQuery] string? dataset = null,
        [FromQuery] string? rowKey = null)
    {
        var q = _db.ChangeLogs.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(dataset)) q = q.Where(x => x.Dataset == dataset);
        if (!string.IsNullOrEmpty(rowKey)) q = q.Where(x => x.RowKey == rowKey);
        var rows = await q
            .OrderByDescending(x => x.Id)
            .Take(Math.Clamp(take, 1, 1000))
            .ToListAsync();
        return Ok(rows);
    }

    public record BusinessEntryDto(string Dataset, string Action, string Details, string? RowKey);

    [HttpPost("business")]
    public async Task<IActionResult> Append([FromBody] BusinessEntryDto[] entries)
    {
        if (entries.Length == 0) return NoContent();
        var user = User.Identity?.Name ?? "local";
        var now = DateTime.UtcNow;
        foreach (var e in entries.Take(50))
        {
            _db.ChangeLogs.Add(new ChangeLog
            {
                At = now,
                UserName = user,
                Dataset = e.Dataset.Length > 64 ? e.Dataset[..64] : e.Dataset,
                RowKey = (e.RowKey ?? "").Length > 200 ? e.RowKey![..200] : e.RowKey ?? "",
                Action = e.Action.Length > 32 ? e.Action[..32] : e.Action,
                Details = e.Details,
            });
        }
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
