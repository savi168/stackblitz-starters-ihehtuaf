using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/scenarios")]
public class ScenariosController : ControllerBase
{
    private readonly AppDbContext _db;
    public ScenariosController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IEnumerable<Scenario>> GetAll([FromQuery] string? entity)
    {
        var query = _db.Scenarios.AsNoTracking().Include(s => s.Shocks).AsQueryable();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(s => s.Entity == entity);
        return await query.OrderBy(s => s.Entity).ThenByDescending(s => s.BaseDate).ThenBy(s => s.Name).ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<Scenario>> Create(Scenario scenario)
    {
        scenario.Id = 0;
        foreach (var s in scenario.Shocks) { s.Id = 0; s.ScenarioId = 0; }
        _db.Scenarios.Add(scenario);
        await _db.SaveChangesAsync();
        return scenario;
    }

    /// <summary>Full replace of a scenario (with its shocks).</summary>
    [HttpPut("{id:long}")]
    public async Task<ActionResult<Scenario>> Update(long id, Scenario scenario)
    {
        var existing = await _db.Scenarios.Include(s => s.Shocks).FirstOrDefaultAsync(s => s.Id == id);
        if (existing is null) return NotFound();
        _db.ScenarioShocks.RemoveRange(existing.Shocks);
        _db.Scenarios.Remove(existing);
        await _db.SaveChangesAsync();

        scenario.Id = 0;
        foreach (var s in scenario.Shocks) { s.Id = 0; s.ScenarioId = 0; }
        _db.Scenarios.Add(scenario);
        await _db.SaveChangesAsync();
        return scenario;
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Delete(long id)
    {
        var scenario = await _db.Scenarios.Include(s => s.Shocks).FirstOrDefaultAsync(s => s.Id == id);
        if (scenario is null) return NotFound();
        _db.Scenarios.Remove(scenario);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
