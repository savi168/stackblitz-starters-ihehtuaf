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

    /// <summary>List the available loads (core_loads) so the user can pick
    /// which data to control. Query configurable via Production:LoadsQuery.</summary>
    [HttpGet("mercury/loads")]
    public async Task<ActionResult<object>> Loads()
    {
        var cs = _config.GetConnectionString("Mercury");
        if (string.IsNullOrWhiteSpace(cs)) return new List<object>();
        var q = _config["Production:LoadsQuery"]
            ?? "SELECT TOP 100 LoadId, ReportingDate, Name FROM core_loads WHERE IsVisible = 1 ORDER BY LoadId DESC";
        try
        {
            var list = new List<object>();
            await using var conn = new SqlConnection(cs);
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = q;
            await using var rd = await cmd.ExecuteReaderAsync();
            while (await rd.ReadAsync())
            {
                var loadId = rd.GetValue(0);
                var dateV = rd.GetValue(1);
                var name = rd.FieldCount > 2 && !rd.IsDBNull(2) ? Convert.ToString(rd.GetValue(2)) : null;
                list.Add(new
                {
                    loadId = Convert.ToString(loadId),
                    reportingDate = dateV is DateTime dt ? dt.ToString("yyyy-MM-dd") : Convert.ToString(dateV),
                    name,
                });
            }
            return list;
        }
        catch
        {
            return new List<object>(); // core_loads absent: the manual loadid input still works
        }
    }

    public class AdjMatchLine
    {
        public int Row { get; set; }
        public string Reference { get; set; } = "";
        public string? Client { get; set; }
        /// <summary>LegalAccountNumber expected from Mapping_GL_BALANCESHEET[LIGNE] — used to disambiguate.</summary>
        public string? LegalAccountNumber { get; set; }
    }

    public class AdjMatchRequest
    {
        public string LoadId { get; set; } = "";
        public List<AdjMatchLine> Lines { get; set; } = new();
    }

    /// <summary>
    /// Adjustments matching: for each accounting line, find the core_positions
    /// candidates of the load via the agreed composite LIKE key
    /// (InternalReference1 OR ContractId ~ REFERENCE, CounterpartyId ~ CLIENT),
    /// flagging those whose LegalAccountNumber equals the GL-mapping account.
    /// </summary>
    [HttpPost("mercury/adjustments/match")]
    public async Task<ActionResult<object>> MatchAdjustments(AdjMatchRequest req)
    {
        var cs = _config.GetConnectionString("Mercury");
        if (string.IsNullOrWhiteSpace(cs))
            return Problem("ConnectionStrings:Mercury is not configured.", statusCode: 400);
        if (string.IsNullOrWhiteSpace(req.LoadId) || req.Lines.Count == 0)
            return Problem("loadId and at least one line are required.", statusCode: 400);
        if (req.Lines.Count > 500)
            return Problem("Too many lines in one call (max 500).", statusCode: 400);

        var results = new List<object>();
        await using var conn = new SqlConnection(cs);
        await conn.OpenAsync();
        foreach (var line in req.Lines)
        {
            var candidates = new List<Dictionary<string, object?>>();
            if (!string.IsNullOrWhiteSpace(line.Reference))
            {
                await using var cmd = conn.CreateCommand();
                // SELECT * — the full row is needed client-side to build the
                // one-shot Excel export of the adjusted positions.
                cmd.CommandText = @"
SELECT TOP 25 *
FROM core_positions
WHERE LoadId = @loadId
  AND (InternalReference1 LIKE @ref OR ContractId LIKE @ref)
  AND (@client IS NULL OR CounterpartyId LIKE @client)";
                cmd.CommandTimeout = 120;
                cmd.Parameters.AddWithValue("@loadId", req.LoadId);
                cmd.Parameters.AddWithValue("@ref", $"%{line.Reference.Trim()}%");
                cmd.Parameters.AddWithValue("@client",
                    string.IsNullOrWhiteSpace(line.Client) ? DBNull.Value : (object)$"%{line.Client.Trim()}%");
                await using var rd = await cmd.ExecuteReaderAsync();
                while (await rd.ReadAsync())
                {
                    var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                    for (var i = 0; i < rd.FieldCount; i++)
                        row[rd.GetName(i)] = rd.IsDBNull(i) ? null : rd.GetValue(i);
                    row["accountMatch"] = !string.IsNullOrWhiteSpace(line.LegalAccountNumber)
                        && Convert.ToString(row["LegalAccountNumber"])?.Trim() == line.LegalAccountNumber.Trim();
                    candidates.Add(row);
                }
            }
            results.Add(new { row = line.Row, candidates });
        }
        return new { loadId = req.LoadId, results };
    }

    /// <summary>
    /// Base balance sheet of a load, aggregated by LEFT(LegalAccountNumber,3)
    /// — feeds the Adjustments impact preview (base + adjustments = after).
    /// </summary>
    [HttpGet("mercury/balance")]
    public async Task<ActionResult<object>> Balance([FromQuery] string loadId)
    {
        var cs = _config.GetConnectionString("Mercury");
        if (string.IsNullOrWhiteSpace(cs))
            return Problem("ConnectionStrings:Mercury is not configured.", statusCode: 400);
        if (string.IsNullOrWhiteSpace(loadId))
            return Problem("loadId is required.", statusCode: 400);

        var rows = new List<object>();
        await using var conn = new SqlConnection(cs);
        await conn.OpenAsync();
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = @"
SELECT LEFT(CAST(LegalAccountNumber AS varchar(20)), 3) AS Prefix,
       SUM(CAST(BookAmount AS float)) AS Amount,
       COUNT(*) AS Positions
FROM core_positions
WHERE LoadId = @loadId
GROUP BY LEFT(CAST(LegalAccountNumber AS varchar(20)), 3)
ORDER BY Prefix";
        cmd.CommandTimeout = 120;
        cmd.Parameters.AddWithValue("@loadId", loadId);
        await using var rd = await cmd.ExecuteReaderAsync();
        while (await rd.ReadAsync())
        {
            rows.Add(new
            {
                prefix = rd.IsDBNull(0) ? "" : rd.GetString(0),
                amount = rd.IsDBNull(1) ? 0d : rd.GetDouble(1),
                positions = rd.IsDBNull(2) ? 0 : rd.GetInt32(2),
            });
        }
        return rows;
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
        if (string.IsNullOrWhiteSpace(req.Entity) || string.IsNullOrWhiteSpace(req.LoadId))
            return Problem("entity and loadId are required.", statusCode: 400);

        var key = string.Equals(req.Target, "securities", StringComparison.OrdinalIgnoreCase) ? "securities" : "counterparties";
        var tvf = _config[$"Production:Sources:{key}"]
            ?? (key == "securities" ? "dbo.fn_regreport_prod_securities" : "dbo.fn_regreport_prod_counterparties");
        if (!Regex.IsMatch(tvf, @"^[A-Za-z0-9_\.\[\]]+$"))
            return Problem($"Invalid TVF name '{tvf}' in Production:Sources.", statusCode: 400);

        // Read the TVF result set (column names matched case-insensitively).
        var date = req.Date;
        var rows = new List<Dictionary<string, object?>>();
        await using (var conn = new SqlConnection(cs))
        {
            await conn.OpenAsync();

            // No reporting date supplied: resolve it from core_loads
            // (configurable via Production:LoadDateQuery).
            if (string.IsNullOrWhiteSpace(date))
            {
                var dq = _config["Production:LoadDateQuery"]
                    ?? "SELECT TOP 1 ReportingDate FROM core_loads WHERE LoadId = @loadId";
                await using var dc = conn.CreateCommand();
                dc.CommandText = dq;
                dc.Parameters.AddWithValue("@loadId", req.LoadId);
                var v = await dc.ExecuteScalarAsync();
                if (v is null || v is DBNull)
                    return Problem($"Load {req.LoadId} not found in core_loads and no reporting date provided.", statusCode: 400);
                date = v is DateTime dt ? dt.ToString("yyyy-MM-dd") : Convert.ToString(v)?.Trim();
                if (string.IsNullOrWhiteSpace(date))
                    return Problem($"core_loads returned an empty reporting date for load {req.LoadId}.", statusCode: 400);
            }

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
                Date = date,
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
                _db.ProdCounterparties.Where(x => x.Entity == req.Entity && x.Date == date && datasets.Contains(x.Dataset)));
            _db.ProdCounterparties.AddRange(records);
            inserted = records.Count;
        }
        else
        {
            var records = rows.Select(r => new ProdSecurityRecord
            {
                Entity = req.Entity,
                Date = date,
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
                _db.ProdSecurities.Where(x => x.Entity == req.Entity && x.Date == date));
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
            date,
            loadId = req.LoadId,
            productType = req.ProductType,
        };
    }
}
