using System.Security.Claims;
using System.Security.Principal;
using Microsoft.AspNetCore.Authentication;

namespace RegReport.Api.Security;

/// <summary>
/// Maps the authenticated Windows identity to application roles:
///  - every authenticated user gets "Reader";
///  - users listed in Security:AdminUsers (case-insensitive; "DOMAIN\user",
///    "user" alone, or with "/" — the domain part is optional) or members of
///    an AD group listed in Security:AdminGroups get "Admin".
/// </summary>
public class RoleClaimsTransformation : IClaimsTransformation
{
    private readonly IConfiguration _config;
    public RoleClaimsTransformation(IConfiguration config) => _config = config;

    /// <summary>"DESKTOP-X\savi" → "savi" (accepts \ or / separators).</summary>
    public static string ShortName(string name)
    {
        var i = name.LastIndexOfAny(new[] { '\\', '/' });
        return i >= 0 ? name[(i + 1)..] : name;
    }

    /// <summary>Entry matches if the full name or the bare username (without domain) matches.</summary>
    public static bool UserMatches(string configured, string identityName) =>
        string.Equals(configured, identityName, StringComparison.OrdinalIgnoreCase)
        || string.Equals(ShortName(configured), ShortName(identityName), StringComparison.OrdinalIgnoreCase);

    public Task<ClaimsPrincipal> TransformAsync(ClaimsPrincipal principal)
    {
        if (principal.Identity is not { IsAuthenticated: true })
            return Task.FromResult(principal);
        // Idempotent: claims transformations can run more than once per request.
        if (principal.HasClaim(c => c.Type == ClaimTypes.Role && c.Value == "Reader"))
            return Task.FromResult(principal);

        var identity = (ClaimsIdentity)principal.Identity;

        // WindowsIdentity uses the GroupSid claim type for IsInRole(), so a
        // plain ClaimTypes.Role claim would be invisible to it. Write the role
        // under BOTH types: ClaimTypes.Role (enumeration, /auth/me) and the
        // identity's own RoleClaimType (IsInRole, [Authorize(Roles=…)]).
        void AddRole(string role)
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, role));
            if (identity.RoleClaimType != ClaimTypes.Role)
                identity.AddClaim(new Claim(identity.RoleClaimType, role));
        }

        AddRole("Reader");

        var name = principal.Identity.Name ?? "";
        var adminUsers = _config.GetSection("Security:AdminUsers").Get<string[]>() ?? Array.Empty<string>();
        var isAdmin = adminUsers.Any(u => UserMatches(u, name));

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

        if (isAdmin) AddRole("Admin");
        return Task.FromResult(principal);
    }
}
