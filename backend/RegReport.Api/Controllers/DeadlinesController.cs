using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DeadlinesController : ControllerBase
{
    private readonly AppDbContext _db;
    public DeadlinesController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IEnumerable<Deadline>> GetAll() =>
        await _db.Deadlines.AsNoTracking().ToListAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Deadline>> Get(int id)
    {
        var item = await _db.Deadlines.FindAsync(id);
        return item is null ? NotFound() : item;
    }

    [HttpPost]
    public async Task<ActionResult<Deadline>> Create(Deadline deadline)
    {
        _db.Deadlines.Add(deadline);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = deadline.Id }, deadline);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Deadline deadline)
    {
        if (id != deadline.Id) return BadRequest("Route id and body id differ.");
        // Load + copy (instead of attaching as Modified) so the owned
        // History/Attachments rows are replaced correctly.
        var existing = await _db.Deadlines.FirstOrDefaultAsync(d => d.Id == id);
        if (existing is null) return NotFound();
        _db.Entry(existing).CurrentValues.SetValues(deadline);
        existing.History = deadline.History;
        existing.Attachments = deadline.Attachments;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.Deadlines.FindAsync(id);
        if (item is null) return NotFound();
        _db.Deadlines.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
