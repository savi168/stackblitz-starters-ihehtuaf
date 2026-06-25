using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

/// <summary>
/// Granular GET/PUT for the two singleton settings blobs stored as JSON in AppSettings:
///   bilan       — balance sheet totals (key = "bilan")
///   riskAppetite — per-entity KPI thresholds (key = "riskAppetite")
/// </summary>
[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public SettingsController(AppDbContext db) => _db = db;

    // ---- Bilan ----

    [HttpGet("bilan")]
    public async Task<ActionResult<Bilan>> GetBilan()
    {
        var row = await _db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == "bilan");
        if (row is null) return new Bilan();
        return JsonSerializer.Deserialize<Bilan>(row.Value, _json) ?? new Bilan();
    }

    [HttpPut("bilan")]
    public async Task<ActionResult<Bilan>> PutBilan(Bilan bilan)
    {
        var json = JsonSerializer.Serialize(bilan, _json);
        var row = await _db.Settings.FirstOrDefaultAsync(s => s.Key == "bilan");
        if (row is null)
        {
            _db.Settings.Add(new AppSetting { Key = "bilan", Value = json });
        }
        else
        {
            row.Value = json;
        }
        await _db.SaveChangesAsync();
        return bilan;
    }

    // ---- Risk Appetite ----

    [HttpGet("risk-appetite")]
    public async Task<ActionResult<Dictionary<string, EntityThresholds>>> GetRiskAppetite()
    {
        var row = await _db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == "riskAppetite");
        if (row is null) return new Dictionary<string, EntityThresholds>();
        return JsonSerializer.Deserialize<Dictionary<string, EntityThresholds>>(row.Value, _json)
               ?? new Dictionary<string, EntityThresholds>();
    }

    [HttpPut("risk-appetite")]
    public async Task<ActionResult<Dictionary<string, EntityThresholds>>> PutRiskAppetite(
        Dictionary<string, EntityThresholds> appetite)
    {
        var json = JsonSerializer.Serialize(appetite, _json);
        var row = await _db.Settings.FirstOrDefaultAsync(s => s.Key == "riskAppetite");
        if (row is null)
        {
            _db.Settings.Add(new AppSetting { Key = "riskAppetite", Value = json });
        }
        else
        {
            row.Value = json;
        }
        await _db.SaveChangesAsync();
        return appetite;
    }

    /// <summary>Update thresholds for a single entity without touching the others.</summary>
    [HttpPut("risk-appetite/{entity}")]
    public async Task<ActionResult<EntityThresholds>> PutEntityThresholds(
        string entity, EntityThresholds thresholds)
    {
        var row = await _db.Settings.FirstOrDefaultAsync(s => s.Key == "riskAppetite");
        var appetite = row is null
            ? new Dictionary<string, EntityThresholds>()
            : JsonSerializer.Deserialize<Dictionary<string, EntityThresholds>>(row.Value, _json)
              ?? new Dictionary<string, EntityThresholds>();

        appetite[entity] = thresholds;
        var json = JsonSerializer.Serialize(appetite, _json);

        if (row is null)
            _db.Settings.Add(new AppSetting { Key = "riskAppetite", Value = json });
        else
            row.Value = json;

        await _db.SaveChangesAsync();
        return thresholds;
    }
}
