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
        [FromQuery] string? entity, [FromQuery] string? date, [FromQuery] string? kind)
    {
        var query = _db.FinStatements.AsNoTracking().Include(s => s.LineItems).AsQueryable();
        if (!string.IsNullOrWhiteSpace(entity)) query = query.Where(s => s.Entity == entity);
        if (!string.IsNullOrWhiteSpace(date))   query = query.Where(s => s.Date == date);
        if (!string.IsNullOrWhiteSpace(kind))   query = query.Where(s => s.Kind == kind);
        return await query.OrderBy(s => s.Entity).ThenByDescending(s => s.Date).ThenBy(s => s.Kind).ToListAsync();
    }

    /// <summary>Upsert the full statement (with line items) for an entity+date+kind.</summary>
    [HttpPut("{entity}/{date}/{kind}")]
    public async Task<ActionResult<FinStatement>> Upsert(string entity, string date, string kind, FinStatement statement)
    {
        var existing = await _db.FinStatements.Include(s => s.LineItems)
            .FirstOrDefaultAsync(s => s.Entity == entity && s.Date == date && s.Kind == kind);
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
        foreach (var i in statement.LineItems) { i.Id = 0; i.FinStatementId = 0; }
        _db.FinStatements.Add(statement);
        await _db.SaveChangesAsync();
        return statement;
    }

    [HttpDelete("{entity}/{date}/{kind}")]
    public async Task<IActionResult> Delete(string entity, string date, string kind)
    {
        var statement = await _db.FinStatements.Include(s => s.LineItems)
            .FirstOrDefaultAsync(s => s.Entity == entity && s.Date == date && s.Kind == kind);
        if (statement is null) return NotFound();
        _db.FinStatements.Remove(statement);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
