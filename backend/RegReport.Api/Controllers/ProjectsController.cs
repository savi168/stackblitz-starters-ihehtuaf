using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController : ControllerBase
{
    private readonly AppDbContext _db;
    public ProjectsController(AppDbContext db) => _db = db;

    [HttpGet]
    public async Task<IEnumerable<Project>> GetAll() =>
        await _db.Projects.AsNoTracking().ToListAsync();

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Project>> Get(int id)
    {
        var item = await _db.Projects.FindAsync(id);
        return item is null ? NotFound() : item;
    }

    [HttpGet("{id:int}/tasks")]
    public async Task<IEnumerable<ProjectTask>> GetTasks(int id) =>
        await _db.ProjectTasks.AsNoTracking().Where(t => t.ProjectId == id).ToListAsync();

    [HttpPost]
    public async Task<ActionResult<Project>> Create(Project project)
    {
        _db.Projects.Add(project);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(Get), new { id = project.Id }, project);
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, Project project)
    {
        if (id != project.Id) return BadRequest("Route id and body id differ.");
        if (!await _db.Projects.AnyAsync(p => p.Id == id)) return NotFound();
        _db.Entry(project).State = EntityState.Modified;
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _db.Projects.FindAsync(id);
        if (item is null) return NotFound();
        _db.ProjectTasks.RemoveRange(_db.ProjectTasks.Where(t => t.ProjectId == id));
        _db.Projects.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
