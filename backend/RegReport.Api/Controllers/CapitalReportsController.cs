using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/capital-reports")]
public class CapitalReportsController : ControllerBase
{
    private readonly AppDbContext _db;
    public CapitalReportsController(AppDbContext db) => _db = db;

    /// <summary>List capital reports (with line items), optionally filtered by entity and/or date.</summary>
    [HttpGet]
    public async Task<IEnumerable<CapitalReport>> GetAll(
        [FromQuery] string? entity,
        [FromQuery] string? date)
    {
        var query = _db.CapitalReports.AsNoTracking().Include(r => r.LineItems).AsQueryable();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(r => r.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(r => r.Date == date);
        return await query.OrderBy(r => r.Entity).ThenByDescending(r => r.Date).ToListAsync();
    }

    [HttpGet("{entity}/{date}")]
    public async Task<ActionResult<CapitalReport>> Get(string entity, string date)
    {
        var report = await _db.CapitalReports.AsNoTracking()
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Entity == entity && r.Date == date);
        return report is null ? NotFound() : report;
    }

    /// <summary>Upsert the full capital report (key metrics + line items) for an entity+date.</summary>
    [HttpPut("{entity}/{date}")]
    public async Task<ActionResult<CapitalReport>> Upsert(string entity, string date, CapitalReport report)
    {
        var existing = await _db.CapitalReports
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Entity == entity && r.Date == date);
        if (existing is not null)
        {
            _db.CapitalLineItems.RemoveRange(existing.LineItems);
            _db.CapitalReports.Remove(existing);
            await _db.SaveChangesAsync();
        }

        report.Id = 0;
        report.Entity = entity;
        report.Date = date;
        foreach (var i in report.LineItems) { i.Id = 0; i.CapitalReportId = 0; }
        _db.CapitalReports.Add(report);
        await _db.SaveChangesAsync();
        return report;
    }

    [HttpDelete("{entity}/{date}")]
    public async Task<IActionResult> Delete(string entity, string date)
    {
        var report = await _db.CapitalReports
            .Include(r => r.LineItems)
            .FirstOrDefaultAsync(r => r.Entity == entity && r.Date == date);
        if (report is null) return NotFound();
        _db.CapitalReports.Remove(report); // line items cascade
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
