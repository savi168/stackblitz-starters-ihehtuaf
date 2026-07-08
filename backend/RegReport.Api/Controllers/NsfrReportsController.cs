using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/nsfr-reports")]
public class NsfrReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    public NsfrReportsController(AppDbContext db) => _db = db;

    /// <summary>List NSFR reports (with line items), optionally filtered by entity and/or date.</summary>
    [HttpGet]
    public async Task<IEnumerable<NsfrReport>> GetAll(
        [FromQuery] string? entity,
        [FromQuery] string? date)
    {
        var query = _db.NsfrReports.AsNoTracking().Include(r => r.LineItems).AsQueryable();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(r => r.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(r => r.Date == date);
        return await query.OrderBy(r => r.Entity).ThenByDescending(r => r.Date).ToListAsync();
    }

    [HttpGet("{entity}/{date}")]
    public async Task<ActionResult<NsfrReport>> Get(string entity, string date)
    {
        var report = await _db.NsfrReports.AsNoTracking()
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Entity == entity && r.Date == date);
        return report is null ? NotFound() : report;
    }

    /// <summary>Upsert the full NSFR report (totals + line items) for an entity+date.</summary>
    [HttpPut("{entity}/{date}")]
    public async Task<ActionResult<NsfrReport>> Upsert(string entity, string date, NsfrReport report)
    {
        var existing = await _db.NsfrReports
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Entity == entity && r.Date == date);
        if (existing is not null)
        {
            _db.NsfrLineItems.RemoveRange(existing.LineItems);
            _db.NsfrReports.Remove(existing);
            await _db.SaveChangesAsync();
        }

        report.Id = 0;
        report.Entity = entity;
        report.Date = date;
        foreach (var i in report.LineItems) { i.Id = 0; i.NsfrReportId = 0; }
        _db.NsfrReports.Add(report);
        await _db.SaveChangesAsync();
        return report;
    }

    [HttpDelete("{entity}/{date}")]
    public async Task<IActionResult> Delete(string entity, string date)
    {
        var report = await _db.NsfrReports
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Entity == entity && r.Date == date);
        if (report is null) return NotFound();
        _db.NsfrReports.Remove(report); // line items cascade
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
