using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/kpis")]
public class KpisController : ControllerBase
{
    private readonly AppDbContext _db;
    public KpisController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IEnumerable<KpiHistoryEntry>> GetAll([FromQuery] string? entity)
    {
        var query = _db.KpiHistory.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(k => k.Entity == entity);
        return await query.OrderBy(k => k.Entity).ThenBy(k => k.Date).ToListAsync();
    }

    [HttpGet("{entity}/{date}")]
    public async Task<ActionResult<KpiHistoryEntry>> Get(string entity, string date)
    {
        var item = await _db.KpiHistory.AsNoTracking()
            .FirstOrDefaultAsync(k => k.Entity == entity && k.Date == date);
        return item is null ? NotFound() : item;
    }

    // Upsert by (entity, date).
    [HttpPut("{entity}/{date}")]
    public async Task<ActionResult<KpiHistoryEntry>> Upsert(string entity, string date, KpiHistoryEntry entry)
    {
        entry.Entity = entity;
        entry.Date = date;

        var existing = await _db.KpiHistory.FirstOrDefaultAsync(k => k.Entity == entity && k.Date == date);
        if (existing is null)
        {
            entry.Id = 0;
            _db.KpiHistory.Add(entry);
        }
        else
        {
            entry.Id = existing.Id;
            _db.Entry(existing).CurrentValues.SetValues(entry);
            existing.Cet1CapitalBreakdown = entry.Cet1CapitalBreakdown;
            existing.Liquidity = entry.Liquidity;
        }
        await _db.SaveChangesAsync();
        return entry;
    }

    [HttpDelete("{entity}/{date}")]
    public async Task<IActionResult> Delete(string entity, string date)
    {
        var item = await _db.KpiHistory.FirstOrDefaultAsync(k => k.Entity == entity && k.Date == date);
        if (item is null) return NotFound();
        _db.KpiHistory.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
