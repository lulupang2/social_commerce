package platform

import (
	"io"
	"log/slog"
	"regexp"
	"strings"
)

var credentialURL = regexp.MustCompile(`(?i)(postgres(?:ql)?|https?)://[^\s]+`)

// Redaction is defense in depth. Call sites must still never log bodies, query
// strings, configuration structs or credentials, even at debug level.
func NewLogger(out io.Writer, level string) *slog.Logger {
	var l slog.Level
	_ = l.UnmarshalText([]byte(level))
	return slog.New(slog.NewJSONHandler(out, &slog.HandlerOptions{
		Level: l,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			key := strings.ToLower(a.Key)
			for _, sensitive := range []string{"password", "secret", "token", "authorization", "cookie", "database_url", "dsn", "payload", "args", "query", "sql", "stack"} {
				if strings.Contains(key, sensitive) {
					return slog.String(a.Key, "[redacted]")
				}
			}
			if key == "error" || key == "err" {
				return slog.String(a.Key, "[redacted; inspect error_code]")
			}
			if _, ok := a.Value.Any().(error); ok {
				return slog.String(a.Key, "[redacted]")
			}
			if a.Value.Kind() == slog.KindString {
				a.Value = slog.StringValue(credentialURL.ReplaceAllString(a.Value.String(), "[redacted-url]"))
			}
			return a
		},
	}))
}
