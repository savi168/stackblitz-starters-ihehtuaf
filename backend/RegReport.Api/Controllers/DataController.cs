using Microsoft.AspNetCore.Mvc;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

/// <summary>
/// The contract the frontend uses (src/services/dataRepository.ts):
///   GET  /api/data  -> the full CentralData document
///   PUT  /api/data  -> replace the full CentralData document
/// Implementing just these two endpoints makes the whole app work on the backend.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class DataController : ControllerBase
{
    private readonly AppDbContext _db;
    public DataController(AppDbContext db) => _db = db;

    [HttpGet]
    public Task<CentralData> Get() => CentralDataStore.ComposeAsync(_db);

    [HttpPut]
    public async Task<IActionResult> Put([FromBody] CentralData data)
    {
        await CentralDataStore.ReplaceAsync(_db, data);
        return NoContent();
    }
}
