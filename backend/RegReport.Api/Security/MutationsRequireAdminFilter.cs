using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace RegReport.Api.Security;

/// <summary>
/// Method-based authorization applied to every controller when security is
/// enabled: reads (GET/HEAD/OPTIONS) are open to any authenticated user
/// ("Reader"), every mutation (PUT/POST/DELETE) requires the "Admin" role.
/// Enforced server-side — hiding buttons in the frontend is cosmetic only.
/// </summary>
public class MutationsRequireAdminFilter : IAuthorizationFilter
{
    private readonly ILogger<MutationsRequireAdminFilter> _logger;
    public MutationsRequireAdminFilter(ILogger<MutationsRequireAdminFilter> logger) => _logger = logger;

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var method = context.HttpContext.Request.Method;
        if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsOptions(method))
            return;
        if (!context.HttpContext.User.IsInRole("Admin"))
        {
            _logger.LogWarning(
                "403 mutation denied: {Method} {Path} — user '{User}' is not Admin (check Security:AdminUsers)",
                method, context.HttpContext.Request.Path, context.HttpContext.User.Identity?.Name ?? "(anonymous)");
            context.Result = new ForbidResult();
        }
    }
}
