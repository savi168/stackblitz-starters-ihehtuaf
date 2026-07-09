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
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

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

    // Quick start: create the schema from the model and seed demo data.
    // For production, replace this with EF Core migrations (see README.md).
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
    DbSeeder.Seed(db);
}

app.UseCors(CorsPolicy);
if (windowsAuth)
{
    app.UseAuthentication();
    app.UseAuthorization();
}
// For Entra ID / JWT instead of Windows auth, see docs/BACKEND.md §7 — the
// role model (Reader/Admin + MutationsRequireAdminFilter) stays the same.
app.MapControllers();

app.Run();
