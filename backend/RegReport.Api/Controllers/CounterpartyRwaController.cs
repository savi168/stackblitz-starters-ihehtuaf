using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/counterparty-rwa")]
public class CounterpartyRwaController : ControllerBase
{
    private readonly AppDbContext _db;
    public CounterpartyRwaController(AppDbContext db) => _db = db;

    /// <summary>List counterparty RWA entries, optionally filtered by entity and/or date.</summary>
    [HttpGet]
    public async Task<IEnumerable<CounterpartyRwa>> GetAll(
        [FromQuery] string? entity,
        [FromQuery] string? date)
    {
        var query = _db.CounterpartyRwa.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(c => c.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(c => c.Date == date);
        return await query.OrderBy(c => c.Entity).ThenBy(c => c.Date).ThenByDescending(c => c.Rwa).ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CounterpartyRwa>> Get(int id)
    {
        var item = await _db.CounterpartyRwa.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        return item is null ? NotFound() : item;
    }

    [HttpPost]
    public async Task<ActionResult<CounterpartyRwa>> Create(CounterpartyRwa entry)
    {
        entry.Id = 0;
        _db.CounterpartyRwa.Add(entry);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = entry.Id }, entry);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CounterpartyRwa>> Update(int id, CounterpartyRwa entry)
    {
        var existing = await _db.CounterpartyRwa.FindAsync(id);
        if (existing is null) return NotFound();
        entry.Id = id;
        _db.Entry(existing).CurrentValues.SetValues(entry);
        await _db.SaveChangesAsync();
        return entry;
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.CounterpartyRwa.FindAsync(id);
        if (item is null) return NotFound();
        _db.CounterpartyRwa.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>Replace all counterparty RWA for a given entity+date in one shot (mirrors the CSV import in the frontend).</summary>
    [HttpPut("bulk/{entity}/{date}")]
    public async Task<ActionResult<IEnumerable<CounterpartyRwa>>> BulkReplace(
        string entity, string date,
        IEnumerable<CounterpartyRwa> entries)
    {
        var existing = await _db.CounterpartyRwa
            .Where(c => c.Entity == entity && c.Date == date)
            .ToListAsync();
        _db.CounterpartyRwa.RemoveRange(existing);

        var list = entries.Select(e => { e.Id = 0; e.Entity = entity; e.Date = date; return e; }).ToList();
        _db.CounterpartyRwa.AddRange(list);
        await _db.SaveChangesAsync();
        return list;
    }
}
