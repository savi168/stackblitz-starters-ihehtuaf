using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Models;

namespace RegReport.Api.Controllers;

/// <summary>
/// Feeds the production-control tables straight from the MERCURY reporting
/// database. The API calls a table-valued function (TVF) with (@loadId,
/// @productType) — the TVF, owned by the MERCURY side, encapsulates the data
/// model (core_positions × list_counterparty…) and returns a fixed column
/// contract (see docs/MERCURY_INTEGRATION.md). Configuration:
///   ConnectionStrings:Mercury          — the MERCURY database
///   Production:Sources:counterparties  — TVF name (default dbo.fn_regreport_prod_counterparties)
///   Production:Sources:securities      — TVF name (default dbo.fn_regreport_prod_securities)
/// </summary>
[ApiController]
[Route("api/production")]
public class ProductionController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;
    public ProductionController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    [HttpGet("mercury/status")]
    public async Task<ActionResult<object>> Status()
    {
        var cs = _config.GetConnectionString("Mercury");
        if (string.IsNullOrWhiteSpace(cs))
            return new { configured = false, connected = false };
        try
        {
            await using var conn = new SqlConnection(cs);
            await conn.OpenAsync();
            return new { configured = true, connected = true, database = conn.Database, server = conn.DataSource };
        }
        catch (Exception ex)
        {
            return new { configured = true, connected = false, error = ex.Message };
        }
    }

    public class MercuryLoadRequest
    {
        /// <summary>counterparties | securities</summary>
        public string Target { get; set; } = "counterparties";
        public string Entity { get; set; } = "";
        public string Date { get; set; } = "";   // reporting period YYYY-MM-DD
        public string LoadId { get; set; } = "";
        public string? ProductType { get; set; }
        /// <summary>Fallback dataset when the TVF result has no Dataset column.</summary>
        public string? Dataset { get; set; }
    }

    [HttpPost("mercury/load")]
    public async Task<ActionResult<object>> Load(MercuryLoadRequest req)
    {
        var cs = _config.GetConnectionString("Mercury");
        if (string.IsNullOrWhiteSpace(cs))
            return Problem("ConnectionStrings:Mercury is not configured (appsettings.Development.local.json).", statusCode: 400);
        if (string.IsNullOrWhiteSpace(req.Entity) || string.IsNullOrWhiteSpace(req.Date) || string.IsNullOrWhiteSpace(req.LoadId))
            return Problem("entity, date and loadId are required.", statusCode: 400);

        var key = string.Equals(req.Target, "securities", StringComparison.OrdinalIgnoreCase) ? "securities" : "counterparties";
        var tvf = _config[$"Production:Sources:{key}"]
            ?? (key == "securities" ? "dbo.fn_regreport_prod_securities" : "dbo.fn_regreport_prod_counterparties");
        if (!Regex.IsMatch(tvf, @"^[A-Za-z0-9_\.\[\]]+$"))
            return Problem($"Invalid TVF name '{tvf}' in Production:Sources.", statusCode: 400);

        // Read the TVF result set (column names matched case-insensitively).
        var rows = new List<Dictionary<string, object?>>();
        await using (var conn = new SqlConnection(cs))
        {
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = $"SELECT * FROM {tvf}(@loadId, @productType)";
            cmd.CommandTimeout = 120;
            cmd.Parameters.AddWithValue("@loadId", req.LoadId);
            cmd.Parameters.AddWithValue("@productType", (object?)req.ProductType ?? DBNull.Value);
            await using var rd = await cmd.ExecuteReaderAsync();
            while (await rd.ReadAsync())
            {
                var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < rd.FieldCount; i++)
                    row[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
                rows.Add(row);
            }
        }

        static string? S(Dictionary<string, object?> r, string name) =>
            r.TryGetValue(name, out var v) && v is not null ? Convert.ToString(v)?.Trim() : null;
        static double? D(Dictionary<string, object?> r, string name) =>
            r.TryGetValue(name, out var v) && v is not null ? Convert.ToDouble(v) : null;
        static bool? B(Dictionary<string, object?> r, string name)
        {
            if (!r.TryGetValue(name, out var v) || v is null) return null;
            if (v is bool b) return b;
            var s = Convert.ToString(v)?.Trim().ToLowerInvariant();
            return s is "1" or "true" or "yes" or "y" or "x";
        }

        int inserted;
        if (key == "counterparties")
        {
            var records = rows.Select(r => new ProdCounterpartyRecord
            {
                Entity = req.Entity,
                Date = req.Date,
                Dataset = S(r, "Dataset") ?? req.Dataset ?? "liquidityAssets",
                ClientNumber = S(r, "ClientNumber") ?? S(r, "CounterpartyId") ?? "",
                ClientType = S(r, "ClientType") ?? "",
                GroupLexId = S(r, "GroupLexId") ?? S(r, "GroupLexid") ?? "",
                CounterpartyType = S(r, "CounterpartyType") ?? "",
                IssuerRating = S(r, "IssuerRating") ?? S(r, "Rating"),
                Amount = D(r, "Amount"),
                Currency = S(r, "Currency"),
            }).Where(x => x.ClientNumber != "").ToList();

            var datasets = records.Select(x => x.Dataset).Distinct().ToList();
            _db.ProdCounterparties.RemoveRange(
                _db.ProdCounterparties.Where(x => x.Entity == req.Entity && x.Date == req.Date && datasets.Contains(x.Dataset)));
            _db.ProdCounterparties.AddRange(records);
            inserted = records.Count;
        }
        else
        {
            var records = rows.Select(r => new ProdSecurityRecord
            {
                Entity = req.Entity,
                Date = req.Date,
                Isin = S(r, "Isin") ?? "",
                SecurityMaster = S(r, "SecurityMaster"),
                SecurityType = S(r, "SecurityType") ?? S(r, "Type"),
                Rating = S(r, "Rating"),
                DailyReval = B(r, "DailyReval"),
                IssuerLexId = S(r, "IssuerLexId"),
                GuarantorLexId = S(r, "GuarantorLexId"),
                GuarantorName = S(r, "GuarantorName"),
                HqlaLevel = S(r, "HqlaLevel"),
                Amount = D(r, "Amount"),
            }).Where(x => x.Isin != "").ToList();

            _db.ProdSecurities.RemoveRange(
                _db.ProdSecurities.Where(x => x.Entity == req.Entity && x.Date == req.Date));
            _db.ProdSecurities.AddRange(records);
            inserted = records.Count;
        }
        await _db.SaveChangesAsync();

        return new
        {
            inserted,
            skipped = rows.Count - inserted,
            target = key,
            tvf,
            entity = req.Entity,
            date = req.Date,
            loadId = req.LoadId,
            productType = req.ProductType,
        };
    }
}
