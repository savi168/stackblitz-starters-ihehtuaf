using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/lcr-reports")]
public class LcrReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    public LcrReportsController(AppDbContext db) => _db = db;

    /// <summary>List LCR reports, optionally filtered by entity and/or date.</summary>
    [HttpGet]
    public async Task<IEnumerable<LcrReport>> GetAll(
        [FromQuery] string? entity,
        [FromQuery] string? date)
    {
        var query = _db.LcrReports.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(r => r.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(r => r.Date == date);
        return await query.OrderBy(r => r.Entity).ThenByDescending(r => r.Date).ThenBy(r => r.Currency).ToListAsync();
    }

    [HttpGet("{id:long}")]
    public async Task<ActionResult<LcrReport>> Get(long id)
    {
        var report = await _db.LcrReports.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
        return report is null ? NotFound() : report;
    }

    /// <summary>Replace all currency reports for an entity+date in one shot (mirrors the Excel import).</summary>
    [HttpPut("bulk/{entity}/{date}")]
    public async Task<ActionResult<IEnumerable<LcrReport>>> BulkReplace(
        string entity, string date,
        IEnumerable<LcrReport> reports)
    {
        var existing = await _db.LcrReports
            .Where(r => r.Entity == entity && r.Date == date)
            .ToListAsync();
        _db.LcrReports.RemoveRange(existing);

        var list = reports.Select(r => { r.Id = 0; r.Entity = entity; r.Date = date; return r; }).ToList();
        _db.LcrReports.AddRange(list);
        await _db.SaveChangesAsync();
        return list;
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var report = await _db.LcrReports.FindAsync(id);
        if (report is null) return NotFound();
        _db.LcrReports.Remove(report);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
