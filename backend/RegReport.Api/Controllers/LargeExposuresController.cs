using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/large-exposures")]
public class LargeExposuresController : ControllerBase
{
    private readonly AppDbContext _db;
    public LargeExposuresController(AppDbContext db) => _db = db;

    /// <summary>List large exposure entries, optionally filtered by entity and/or date.</summary>
    [HttpGet]
    public async Task<IEnumerable<LargeExposure>> GetAll(
        [FromQuery] string? entity,
        [FromQuery] string? date)
    {
        var query = _db.LargeExposures.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(le => le.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(le => le.Date == date);
        return await query.OrderBy(le => le.Entity).ThenBy(le => le.Date).ThenBy(le => le.Counterparty).ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<LargeExposure>> Get(int id)
    {
        var item = await _db.LargeExposures.AsNoTracking().FirstOrDefaultAsync(le => le.Id == id);
        return item is null ? NotFound() : item;
    }

    [HttpPost]
    public async Task<ActionResult<LargeExposure>> Create(LargeExposure entry)
    {
        entry.Id = 0;
        _db.LargeExposures.Add(entry);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = entry.Id }, entry);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<LargeExposure>> Update(int id, LargeExposure entry)
    {
        var existing = await _db.LargeExposures.FindAsync(id);
        if (existing is null) return NotFound();
        entry.Id = id;
        _db.Entry(existing).CurrentValues.SetValues(entry);
        await _db.SaveChangesAsync();
        return entry;
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.LargeExposures.FindAsync(id);
        if (item is null) return NotFound();
        _db.LargeExposures.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Replace all large exposures for a given entity+date in one shot.</summary>
    [HttpPut("bulk/{entity}/{date}")]
    public async Task<ActionResult<IEnumerable<LargeExposure>>> BulkReplace(
        string entity, string date,
        IEnumerable<LargeExposure> entries)
    {
        var existing = await _db.LargeExposures
            .Where(le => le.Entity == entity && le.Date == date)
            .ToListAsync();
        _db.LargeExposures.RemoveRange(existing);

        var list = entries.Select(e => { e.Id = 0; e.Entity = entity; e.Date = date; return e; }).ToList();
        _db.LargeExposures.AddRange(list);
        await _db.SaveChangesAsync();
        return list;
    }
}
