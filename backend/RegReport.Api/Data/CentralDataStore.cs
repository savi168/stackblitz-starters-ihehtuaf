using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Models;

namespace RegReport.Api.Data;

/// <summary>
/// Composes the aggregate <see cref="CentralData"/> from the relational tables,
/// and performs a transactional full replace (the contract the frontend uses
/// when it PUTs the whole document).
/// </summary>
public static class CentralDataStore
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public static async Task<CentralData> ComposeAsync(AppDbContext db)
    {
        var settings = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);

        T? Get<T>(string key) =>
            settings.TryGetValue(key, out var json) ? JsonSerializer.Deserialize<T>(json, JsonOpts) : default;

        return new CentralData
        {
            Deadlines = await db.Deadlines.AsNoTracking().ToListAsync(),
            KpisHistory = await db.KpiHistory.AsNoTracking().ToListAsync(),
            CounterpartyRwa = await db.CounterpartyRwa.AsNoTracking().ToListAsync(),
            LargeExposures = await db.LargeExposures.AsNoTracking().ToListAsync(),
            Team = await db.Team.AsNoTracking().ToListAsync(),
            Projects = await db.Projects.AsNoTracking().ToListAsync(),
            ProjectTasks = await db.ProjectTasks.AsNoTracking().ToListAsync(),
            Bilan = Get<Bilan>("bilan") ?? new Bilan(),
            RiskAppetite = Get<Dictionary<string, EntityThresholds>>("riskAppetite") ?? new(),
            DiagnosisResults = Get<Dictionary<string, List<DiagnosisResult>>>("diagnosisResults"),
        };
    }

    public static async Task ReplaceAsync(AppDbContext db, CentralData data)
    {
        await using var tx = await db.Database.BeginTransactionAsync();

        db.Deadlines.RemoveRange(db.Deadlines);
        db.KpiHistory.RemoveRange(db.KpiHistory);
        db.CounterpartyRwa.RemoveRange(db.CounterpartyRwa);
        db.LargeExposures.RemoveRange(db.LargeExposures);
        db.Team.RemoveRange(db.Team);
        db.ProjectTasks.RemoveRange(db.ProjectTasks);
        db.Projects.RemoveRange(db.Projects);
        await db.SaveChangesAsync();

        // Reset surrogate identity ids so they are auto-generated on insert.
        foreach (var k in data.KpisHistory) k.Id = 0;
        foreach (var c in data.CounterpartyRwa) c.Id = 0;
        foreach (var l in data.LargeExposures) l.Id = 0;

        db.Deadlines.AddRange(data.Deadlines);
        db.KpiHistory.AddRange(data.KpisHistory);
        db.CounterpartyRwa.AddRange(data.CounterpartyRwa);
        db.LargeExposures.AddRange(data.LargeExposures);
        db.Team.AddRange(data.Team);
        db.Projects.AddRange(data.Projects);
        db.ProjectTasks.AddRange(data.ProjectTasks);

        Upsert(db, "bilan", data.Bilan);
        Upsert(db, "riskAppetite", data.RiskAppetite);
        if (data.DiagnosisResults is not null) Upsert(db, "diagnosisResults", data.DiagnosisResults);

        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }

    /// <summary>Synchronous variant used by the seeder at startup.</summary>
    public static void Replace(AppDbContext db, CentralData data) => ReplaceAsync(db, data).GetAwaiter().GetResult();

    private static void Upsert<T>(AppDbContext db, string key, T value)
    {
        var json = JsonSerializer.Serialize(value, JsonOpts);
        var existing = db.Settings.Find(key);
        if (existing is null) db.Settings.Add(new AppSetting { Key = key, Value = json });
        else existing.Value = json;
    }
}
