using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TeamController : ControllerBase
{
    private readonly AppDbContext _db;
    public TeamController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IEnumerable<TeamMember>> GetAll() =>
        await _db.Team.AsNoTracking().OrderBy(m => m.Name).ToListAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TeamMember>> Get(int id)
    {
        var item = await _db.Team.FindAsync(id);
        return item is null ? NotFound() : item;
    }

    [HttpPost]
    public async Task<ActionResult<TeamMember>> Create(TeamMember member)
    {
        _db.Team.Add(member);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = member.Id }, member);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, TeamMember member)
    {
        if (id != member.Id) return BadRequest("Route id and body id differ.");
        if (!await _db.Team.AnyAsync(m => m.Id == id)) return NotFound();
        _db.Entry(member).State = EntityState.Modified;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.Team.FindAsync(id);
        if (item is null) return NotFound();
        _db.Team.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
