using System.Reflection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;

namespace RegReport.Api.Controllers;

/// <summary>
/// Deployment metadata for the frontend badge and the Admin "System" panel:
/// assembly version (stamped by scripts/release.ps1), environment label
/// (PROD / TEST / DEV — override with App:EnvironmentLabel) and the applied
/// schema migrations (__SchemaMigrations audit table).
/// </summary>
[ApiController]
[Route("api/meta")]
public class MetaController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;
    public MetaController(AppDbContext db, IConfiguration config, IWebHostEnvironment env)
    {
        _db = db;
        _config = config;
        _env = env;
    }

    [HttpGet]
    public async Task<ActionResult<object>> Get()
    {
        var info = Assembly.GetExecutingAssembly()
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "0.0.0";
        var version = info.Split('+')[0]; // strip the commit-hash suffix

        var label = _config["App:EnvironmentLabel"] ?? _env.EnvironmentName switch
        {
            "Production" => "PROD",
            "Staging" => "TEST",
            "Development" => "DEV",
            var other => other.ToUpperInvariant(),
        };

        var migrations = new List<object>();
        try
        {
            var conn = _db.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "SELECT [Name], [AppliedAt] FROM [__SchemaMigrations] ORDER BY [AppliedAt]";
            await using var rd = await cmd.ExecuteReaderAsync();
            while (await rd.ReadAsync())
                migrations.Add(new { name = rd.GetString(0), appliedAt = rd.GetDateTime(1).ToString("yyyy-MM-dd HH:mm") });
        }
        catch
        {
            // Table absent (fresh database before the first migrator run) — not an error.
        }

        return new
        {
            version,
            environment = _env.EnvironmentName,
            environmentLabel = label,
            migrations,
        };
    }
}
