using System.Security.Claims;
using System.Security.Principal;
using Microsoft.AspNetCore.Authentication;

namespace RegReport.Api.Security;

/// <summary>
/// Maps the authenticated Windows identity to application roles:
///  - every authenticated user gets "Reader";
///  - users listed in Security:AdminUsers (DOMAIN\user, case-insensitive) or
///    members of an AD group listed in Security:AdminGroups get "Admin".
/// </summary>
public class RoleClaimsTransformation : IClaimsTransformation
{
    private readonly IConfiguration _config;
    public RoleClaimsTransformation(IConfiguration config) => _config = config;

    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.Identity is not { IsAuthenticated: true })
            return Task.FromResult(principal);
        // Idempotent: claims transformations can run more than once per request.
        if (principal.HasClaim(c => c.Type == ClaimTypes.Role && c.Value == "Reader"))
            return Task.FromResult(principal);

        var identity = (ClaimsIdentity)principal.Identity;
        identity.AddClaim(new Claim(ClaimTypes.Role, "Reader"));

        var name = principal.Identity.Name ?? "";
        var adminUsers = _config.GetSection("Security:AdminUsers").Get<string[]>() ?? Array.Empty<string>();
        var isAdmin = adminUsers.Any(u => string.Equals(u, name, StringComparison.OrdinalIgnoreCase));

        if (!isAdmin && OperatingSystem.IsWindows() && principal.Identity is WindowsIdentity winId)
        {
            var adminGroups = _config.GetSection("Security:AdminGroups").Get<string[]>() ?? Array.Empty<string>();
            var winPrincipal = new WindowsPrincipal(winId);
            isAdmin = adminGroups.Any(g =>
            {
                try { return winPrincipal.IsInRole(g); }
                catch { return false; } // unknown group name on this machine/domain
            });
        }

        if (isAdmin) identity.AddClaim(new Claim(ClaimTypes.Role, "Admin"));
        return Task.FromResult(principal);
    }
}
