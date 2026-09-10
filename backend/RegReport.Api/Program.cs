using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RegReport.Api.Data;
using RegReport.Api.Security;

var builder = WebApplication.CreateBuilder(args);

// Per-machine overrides (real SQL Server connection string, etc.) that must
// never be committed. Matches the appsettings.*.local.json glob in .gitignore.
builder.Configuration.AddJsonFile(
    $"appsettings.{builder.Environment.EnvironmentName}.local.json",
    optional: true,
    reloadOnChange: true);

// --- Services ---
builder.Services.AddControllers();
// Document library uploads (PDF regulations, working papers…): raise the
// body-size limits — per-action caps live on DocumentsController.
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 300L * 1024 * 1024);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(
    o => o.MultipartBodyLengthLimit = 300L * 1024 * 1024);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

// In-app technical log (GET /api/logs/tech): ring buffer fed by the request
// middleware below and by the application's own ILogger output.
var techLog = new TechLogBuffer();
builder.Services.AddSingleton(techLog);
builder.Logging.AddProvider(new BufferLoggerProvider(techLog));

// CORS: allow the Vite dev server (and any configured production origins).
// AllowCredentials is required so the browser sends the Windows-auth handshake
// (and cookies, if any) on cross-origin calls — hence explicit origins only.
const string CorsPolicy = "frontend";
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173" };
builder.Services.AddCors(options => options.AddPolicy(CorsPolicy, policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// --- Security (optional): Windows Authentication (Negotiate / Kerberos) ---
// Off by default (Security:Mode = "None") so the quick-start keeps working.
// Set Security:Mode = "Windows" to require an authenticated Windows user on
// every endpoint: reads for everyone ("Reader"), mutations for "Admin" only
// (Security:AdminUsers / Security:AdminGroups). See docs/SECURITY_WINDOWS_AUTH.md.
var windowsAuth = string.Equals(builder.Configuration["Security:Mode"], "Windows", StringComparison.OrdinalIgnoreCase);
if (windowsAuth)
{
    builder.Services.AddAuthentication(NegotiateDefaults.AuthenticationScheme).AddNegotiate();
    builder.Services.AddAuthorization(options =>
    {
        // Every endpoint requires an authenticated user unless [AllowAnonymous].
        options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
    });
    builder.Services.AddSingleton<IClaimsTransformation, RoleClaimsTransformation>();
    builder.Services.Configure<MvcOptions>(o => o.Filters.Add<MutationsRequireAdminFilter>());
}

var app = builder.Build();

// Startup diagnostics: which security config is actually in effect (the #1
// support question is "why am I still read-only?").
{
    var localFile = Path.Combine(builder.Environment.ContentRootPath,
        $"appsettings.{builder.Environment.EnvironmentName}.local.json");
    var adminUsers = builder.Configuration.GetSection("Security:AdminUsers").Get<string[]>() ?? Array.Empty<string>();
    app.Logger.LogInformation(
        "Security mode: {Mode} | local overrides file {File}: {Found} | AdminUsers: [{Users}]",
        windowsAuth ? "Windows" : "None",
        localFile,
        File.Exists(localFile) ? "FOUND" : "NOT FOUND",
        string.Join(", ", adminUsers));
}

// --- Pipeline ---
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Schema lifecycle, every environment: EnsureCreated builds the full schema
// on an EMPTY database; SchemaMigrator then applies the additive, idempotent
// upgrade steps on an existing one (new tables/columns of later releases) —
// existing data is never dropped, so releases upgrade themselves without a
// manual SSMS session. Demo data is only seeded in Development.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    SchemaMigrator.Apply(db, app.Logger);
    if (app.Environment.IsDevelopment()) DbSeeder.Seed(db);

    // Optional audit retention (App:ChangeLogRetentionDays). Default 0 = keep
    // everything — in banking the audit trail usually stays for years, and the
    // (Dataset, RowKey)/(At) indexes keep it fast even with millions of rows.
    // Set a value (e.g. 3650 = 10 years) to purge older entries at startup.
    var retentionDays = builder.Configuration.GetValue<int>("App:ChangeLogRetentionDays");
    if (retentionDays > 0)
    {
        var cutoff = DateTime.UtcNow.AddDays(-retentionDays);
        var purged = db.ChangeLogs.Where(x => x.At < cutoff).ExecuteDelete();
        if (purged > 0)
            app.Logger.LogInformation(
                "Audit retention: purged {Count} ChangeLogs entries older than {Days} days", purged, retentionDays);
    }
}

app.UseCors(CorsPolicy);

// --- Single-deliverable deployment (releases) ---
// scripts/release.ps1 copies the built frontend (dist/) into wwwroot: when
// index.html is there, the API serves the SPA itself — same origin, so the
// front is built with VITE_API_BASE_URL=/api and CORS becomes irrelevant.
// In dev (no wwwroot/index.html) nothing changes.
var webRoot = !string.IsNullOrEmpty(app.Environment.WebRootPath)
    ? app.Environment.WebRootPath
    : Path.Combine(app.Environment.ContentRootPath, "wwwroot");
var servesSpa = File.Exists(Path.Combine(webRoot, "index.html"));
if (servesSpa)
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

if (windowsAuth)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

// Request logging into the tech buffer (after auth so the user is known).
// Reading the tech log itself is excluded, otherwise refreshing the Logs
// page would fill the buffer with its own requests.
app.Use(async (ctx, next) =>
{
    if (!ctx.Request.Path.StartsWithSegments("/api")
        || ctx.Request.Path.StartsWithSegments("/api/logs/tech"))
    {
        await next();
        return;
    }
    var sw = System.Diagnostics.Stopwatch.StartNew();
    try
    {
        await next();
    }
    finally
    {
        var status = ctx.Response.StatusCode;
        techLog.Add(
            status >= 500 ? "Error" : status >= 400 ? "Warning" : "Information",
            "HTTP",
            $"{ctx.Request.Method} {ctx.Request.Path}{ctx.Request.QueryString} → {status} in {sw.ElapsedMilliseconds} ms ({ctx.User.Identity?.Name ?? "anonymous"})");
    }
});

// For Entra ID / JWT instead of Windows auth, see docs/BACKEND.md §7 — the
// role model (Reader/Admin + MutationsRequireAdminFilter) stays the same.
app.MapControllers();
if (servesSpa)
    app.MapFallbackToFile("index.html").AllowAnonymous(); // SPA routes (deep links)

app.Run();
