using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

/// <summary>
/// Granular GET/PUT for the singleton documents:
///   bilan         — balance-sheet totals (single-row Bilan table)
///   riskAppetite  — per-entity KPI thresholds (RiskAppetite table, one row per entity)
///   importMapping — Excel template anchors (the only JSON setting, owned by the frontend parser)
/// </summary>
[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly AppDbContext _db;
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public SettingsController(AppDbContext db) => _db = db;

    // ---- Bilan (single-row table) ----

    [HttpGet("bilan")]
    public async Task<ActionResult<Bilan>> GetBilan() =>
        await _db.Bilans.AsNoTracking().FirstOrDefaultAsync() ?? new Bilan();

    [HttpPut("bilan")]
    public async Task<ActionResult<Bilan>> PutBilan(Bilan bilan)
    {
        _db.Bilans.RemoveRange(_db.Bilans);
        _db.Bilans.Add(bilan);
        await _db.SaveChangesAsync();
        return bilan;
    }

    // ---- Risk Appetite (one row per entity) ----

    [HttpGet("risk-appetite")]
    public async Task<ActionResult<Dictionary<string, EntityThresholds>>> GetRiskAppetite()
    {
        var rows = await _db.RiskAppetite.AsNoTracking().ToListAsync();
        return rows.ToDictionary(r => r.Entity, r => r.Thresholds ?? new EntityThresholds());
    }

    [HttpPut("risk-appetite")]
    public async Task<ActionResult<Dictionary<string, EntityThresholds>>> PutRiskAppetite(
        Dictionary<string, EntityThresholds> appetite)
    {
        _db.RiskAppetite.RemoveRange(_db.RiskAppetite);
        _db.RiskAppetite.AddRange(appetite.Select(kv =>
            new RiskAppetiteEntry { Entity = kv.Key, Thresholds = kv.Value }));
        await _db.SaveChangesAsync();
        return appetite;
    }

    /// <summary>Update thresholds for a single entity without touching the others.</summary>
    [HttpPut("risk-appetite/{entity}")]
    public async Task<ActionResult<EntityThresholds>> PutEntityThresholds(
        string entity, EntityThresholds thresholds)
    {
        var row = await _db.RiskAppetite.FirstOrDefaultAsync(r => r.Entity == entity);
        if (row is null)
        {
            _db.RiskAppetite.Add(new RiskAppetiteEntry { Entity = entity, Thresholds = thresholds });
        }
        else
        {
            row.Thresholds = thresholds;
        }
        await _db.SaveChangesAsync();
        return thresholds;
    }

    // ---- Import mapping (Excel template anchors) ----

    [HttpGet("import-mapping")]
    public async Task<ActionResult<JsonElement?>> GetImportMapping()
    {
        var row = await _db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Key == "importMapping");
        if (row is null) return NoContent();
        return JsonSerializer.Deserialize<JsonElement>(row.Value, _json);
    }

    [HttpPut("import-mapping")]
    public async Task<ActionResult<JsonElement>> PutImportMapping(JsonElement mapping)
    {
        var json = JsonSerializer.Serialize(mapping, _json);
        var row = await _db.Settings.FirstOrDefaultAsync(s => s.Key == "importMapping");
        if (row is null)
        {
            _db.Settings.Add(new AppSetting { Key = "importMapping", Value = json });
        }
        else
        {
            row.Value = json;
        }
        await _db.SaveChangesAsync();
        return mapping;
    }
}
