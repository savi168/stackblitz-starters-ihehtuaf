using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RegReport.Api.Security;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;
    public AuthController(IConfiguration config, IWebHostEnvironment env)
    {
        _config = config;
        _env = env;
    }

    /// <summary>
    /// Who am I: identity + roles as seen by the API. The frontend calls this
    /// once at startup to decide which modules to show (Workbench, Cockpit,
    /// Admin are Admin-only). When security is disabled (Security:Mode=None)
    /// it reports an anonymous admin so the app behaves as before.
    /// </summary>
    [HttpGet("me")]
    [AllowAnonymous]
    public ActionResult<object> Me()
    {
        var mode = _config["Security:Mode"] ?? "None";
        if (!string.Equals(mode, "Windows", StringComparison.OrdinalIgnoreCase))
        {
            return new { name = "anonymous", roles = new[] { "Reader", "Admin" }, securityMode = mode };
        }

        // Challenge() (not a bare 401) so the Negotiate handler sends the
        // WWW-Authenticate header and the browser starts the Kerberos/NTLM
        // handshake automatically.
        if (User.Identity is not { IsAuthenticated: true })
            return Challenge();

        var roles = User.Claims
            .Where(c => c.Type == ClaimTypes.Role)
            .Select(c => c.Value)
            .Distinct()
            .ToArray();

        // Development only: expose what the role mapping compared, so a
        // config/identity mismatch is diagnosable from the browser.
        if (_env.IsDevelopment())
        {
            var name = User.Identity.Name ?? "";
            var adminUsers = _config.GetSection("Security:AdminUsers").Get<string[]>() ?? Array.Empty<string>();
            return new
            {
                name = User.Identity.Name,
                roles,
                securityMode = mode,
                diagnostics = new
                {
                    identitySeenByApi = name,
                    shortName = RoleClaimsTransformation.ShortName(name),
                    adminUsersConfigured = adminUsers,
                    matchesAdminUsers = adminUsers.Any(u => RoleClaimsTransformation.UserMatches(u, name)),
                    // The exact check the mutation filter performs — must be
                    // true for PUT/POST/DELETE to be allowed.
                    isInRoleAdmin = User.IsInRole("Admin"),
                },
            };
        }
        return new { name = User.Identity.Name, roles, securityMode = mode };
    }
}
