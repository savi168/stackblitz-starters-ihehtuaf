using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using RegReport.Api.Models;

namespace RegReport.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<KpiHistoryEntry> KpiHistory => Set<KpiHistoryEntry>();
    public DbSet<Deadline> Deadlines => Set<Deadline>();
    public DbSet<CounterpartyRwa> CounterpartyRwa => Set<CounterpartyRwa>();
    public DbSet<LargeExposure> LargeExposures => Set<LargeExposure>();
    public DbSet<TeamMember> Team => Set<TeamMember>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<ProjectTask> ProjectTasks => Set<ProjectTask>();
    public DbSet<CapitalReport> CapitalReports => Set<CapitalReport>();
    public DbSet<CapitalLineItem> CapitalLineItems => Set<CapitalLineItem>();
    public DbSet<LcrReport> LcrReports => Set<LcrReport>();
    public DbSet<AppSetting> Settings => Set<AppSetting>();

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<KpiHistoryEntry>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date }).IsUnique();
            e.Property(x => x.Cet1CapitalBreakdown).HasJsonConversion();
            e.Property(x => x.Liquidity).HasJsonConversion();
        });

        b.Entity<Deadline>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever(); // ids come from the frontend
            e.Property(x => x.History).HasJsonConversion();
            e.Property(x => x.Attachments).HasJsonConversion();
        });

        b.Entity<CounterpartyRwa>().HasKey(x => x.Id);
        b.Entity<LargeExposure>().HasKey(x => x.Id);

        b.Entity<TeamMember>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        b.Entity<Project>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        b.Entity<ProjectTask>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
        });

        b.Entity<CapitalReport>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date }).IsUnique();
            e.Property(x => x.KeyMetrics).HasJsonConversion();
            e.HasMany(x => x.LineItems)
                .WithOne()
                .HasForeignKey(x => x.CapitalReportId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<CapitalLineItem>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.CapitalReportId);
        });

        b.Entity<LcrReport>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Entity, x.Date, x.Currency }).IsUnique();
        });

        b.Entity<AppSetting>().HasKey(x => x.Key);
    }
}

internal static class JsonConversionExtensions
{
    private static readonly JsonSerializerOptions Opts = new(JsonSerializerDefaults.Web);

    /// <summary>Stores a property as a JSON string in an nvarchar(max) column.</summary>
    public static PropertyBuilder<T> HasJsonConversion<T>(this PropertyBuilder<T> builder)
    {
        var converter = new ValueConverter<T, string>(
            v => JsonSerializer.Serialize(v, Opts),
            v => JsonSerializer.Deserialize<T>(v, Opts)!);

        var comparer = new ValueComparer<T>(
            (a, b) => JsonSerializer.Serialize(a, Opts) == JsonSerializer.Serialize(b, Opts),
            v => v == null ? 0 : JsonSerializer.Serialize(v, Opts).GetHashCode(),
            v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, Opts), Opts)!);

        builder.HasConversion(converter, comparer).HasColumnType("nvarchar(max)");
        return builder;
    }
}
