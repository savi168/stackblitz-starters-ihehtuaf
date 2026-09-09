using System.Collections.Concurrent;

namespace RegReport.Api.Data;

/// <summary>
/// In-memory ring buffer of technical log entries, exposed through
/// GET /api/logs/tech for in-app debugging. Two feeds:
///  - a request-logging middleware (every /api call: method, path, status,
///    duration, user) registered in Program.cs;
///  - a BufferLoggerProvider capturing the application's ILogger output
///    (startup, schema migrations, warnings, unhandled errors).
/// The buffer is process-local and bounded — it is a debugging aid, not an
/// audit trail (that is the ChangeLogs table).
/// </summary>
public class TechLogBuffer
{
    public record Entry(DateTime At, string Level, string Category, string Message);

    private const int Capacity = 1000;
    private readonly ConcurrentQueue<Entry> _entries = new();

    public void Add(string level, string category, string message)
    {
        _entries.Enqueue(new Entry(DateTime.UtcNow, level, category, message));
        while (_entries.Count > Capacity && _entries.TryDequeue(out _)) { }
    }

    public IReadOnlyList<Entry> Snapshot(int take = 500) =>
        _entries.Reverse().Take(take).ToList();
}

/// <summary>Routes ILogger output into the TechLogBuffer.</summary>
public sealed class BufferLoggerProvider : ILoggerProvider
{
    private readonly TechLogBuffer _buffer;
    public BufferLoggerProvider(TechLogBuffer buffer) { _buffer = buffer; }

    public ILogger CreateLogger(string categoryName) => new BufferLogger(_buffer, categoryName);
    public void Dispose() { }

    private sealed class BufferLogger : ILogger
    {
        private readonly TechLogBuffer _buffer;
        private readonly string _category;
        public BufferLogger(TechLogBuffer buffer, string category)
        {
            _buffer = buffer;
            // Keep the tail of the namespace — "RegReport.Api.Controllers.X" → "X".
            _category = category.Contains('.') ? category[(category.LastIndexOf('.') + 1)..] : category;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
            Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;
            var msg = formatter(state, exception);
            if (exception is not null) msg += $" — {exception.GetType().Name}: {exception.Message}";
            _buffer.Add(logLevel.ToString(), _category, msg);
        }
    }
}
