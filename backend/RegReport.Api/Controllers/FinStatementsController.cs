using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/fin-statements")]
public class FinStatementsController : ControllerBase
{
    private readonly AppDbContext _db;
    public FinStatementsController(AppDbContext db) => _db = db;

    /// <summary>List financial statements, optionally filtered by entity / date / kind.</summary>
    [HttpGet]
    public async Task<IEnumerable<FinStatement>> GetAll(
        [FromQuery] string? entity, [FromQuery] string? date, [FromQuery] string? kind, [FromQuery] string? gaap)
    {
        var query = _db.FinStatements.AsNoTracking().Include(s => s.LineItems).AsQueryable();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(s => s.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(s => s.Date == date);
        if (!string.IsNullOrWhiteSpace(kind))   query = query.Where(s => s.Kind == kind);
        if (!string.IsNullOrWhiteSpace(gaap))   query = query.Where(s => s.Gaap == gaap);
        return await query.OrderBy(s => s.Entity).ThenByDescending(s => s.Date).ThenBy(s => s.Kind).ThenBy(s => s.Gaap).ToListAsync();
    }

    /// <summary>Upsert the full statement (with line items) for an entity+date+kind (+gaap from the body; default Swiss GAAP).</summary>
    [HttpPut("{entity}/{date}/{kind}")]
    public async Task<ActionResult<FinStatement>> Upsert(string entity, string date, string kind, FinStatement statement)
    {
        var gaap = string.IsNullOrWhiteSpace(statement.Gaap) ? "Swiss GAAP" : statement.Gaap;
        var existing = await _db.FinStatements.Include(s => s.LineItems)
            .FirstOrDefaultAsync(s => s.Entity == entity && s.Date == date && s.Kind == kind
                && (s.Gaap == gaap || (s.Gaap == null && gaap == "Swiss GAAP")));
        if (existing is not null)
        {
            _db.FinStatementLineItems.RemoveRange(existing.LineItems);
            _db.FinStatements.Remove(existing);
            await _db.SaveChangesAsync();
        }
        statement.Id = 0;
        statement.Entity = entity;
        statement.Date = date;
        statement.Kind = kind;
        statement.Gaap = gaap;
        foreach (var i in statement.LineItems) { i.Id = 0; i.FinStatementId = 0; }
        _db.FinStatements.Add(statement);
        await _db.SaveChangesAsync();
        return statement;
    }

    [HttpDelete("{entity}/{date}/{kind}")]
    public async Task<IActionResult> Delete(string entity, string date, string kind, [FromQuery] string? gaap)
    {
        var g = string.IsNullOrWhiteSpace(gaap) ? "Swiss GAAP" : gaap;
        var statement = await _db.FinStatements.Include(s => s.LineItems)
            .FirstOrDefaultAsync(s => s.Entity == entity && s.Date == date && s.Kind == kind
                && (s.Gaap == g || (s.Gaap == null && g == "Swiss GAAP")));
        if (statement is null) return NotFound();
        _db.FinStatements.Remove(statement);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
