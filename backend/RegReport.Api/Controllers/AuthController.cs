using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace RegReport.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IConfiguration _config;
    public AuthController(IConfiguration config) => _config = config;

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
        return new { name = User.Identity.Name, roles, securityMode = mode };
    }
}
