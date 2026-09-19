package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

type Server struct {
	App      *fiber.App
	Draining atomic.Bool
}

type ErrorResponse struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

func New(logger *slog.Logger, ready func(context.Context) error) *Server {
	s := &Server{}
	errorHandler := func(c fiber.Ctx, err error) error {
		status, code, message := 500, "INTERNAL_ERROR", "Internal server error"
		var fe *fiber.Error
		if errors.As(err, &fe) {
			switch fe.Code {
			case 400:
				status, code, message = 400, "BAD_REQUEST", "Invalid request"
			case 404:
				status, code, message = 404, "NOT_FOUND", "Resource not found"
			case 405:
				status, code, message = 405, "METHOD_NOT_ALLOWED", "Method not allowed"
			case 413:
				status, code, message = 413, "REQUEST_TOO_LARGE", "Request too large"
			}
		}
		if status == 500 {
			logger.Error("http_request_failed", "error_code", code, "request_id", c.GetRespHeader("X-Request-ID"))
		}
		return c.Status(status).JSON(ErrorResponse{code, message, c.GetRespHeader("X-Request-ID")})
	}
	s.App = fiber.New(fiber.Config{
		AppName: "SummerGear API", ErrorHandler: errorHandler,
		ReadTimeout: 5 * time.Second, WriteTimeout: 30 * time.Second,
		IdleTimeout: 30 * time.Second, BodyLimit: 64 * 1024,
	})
	s.App.Use(func(c fiber.Ctx) error {
		var id [16]byte
		if _, err := rand.Read(id[:]); err != nil {
			return fiber.ErrInternalServerError
		}
		c.Set("X-Request-ID", hex.EncodeToString(id[:]))
		c.Set("Cache-Control", "no-store")
		c.Set("X-Content-Type-Options", "nosniff")
		start := time.Now()
		err := c.Next()
		if err != nil {
			err = errorHandler(c, err)
		}
		// Never log request URL, query, body, headers, or user-controlled IDs.
		logger.Info("http_request", "method", c.Method(), "status", c.Response().StatusCode(), "duration_ms", time.Since(start).Milliseconds(), "request_id", c.GetRespHeader("X-Request-ID"))
		return err
	})
	s.App.Use(recover.New(recover.Config{EnableStackTrace: false}))
	s.App.Get("/health/live", func(c fiber.Ctx) error { return c.JSON(fiber.Map{"status": "ok"}) })
	s.App.Get("/health/ready", func(c fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if s.Draining.Load() || ready(ctx) != nil {
			return c.Status(503).JSON(ErrorResponse{"NOT_READY", "Service is not ready", c.GetRespHeader("X-Request-ID")})
		}
		return c.JSON(fiber.Map{"status": "ready"})
	})
	// No sample writes or unauthenticated business routes are exposed.
	return s
}
