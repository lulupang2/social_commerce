package command

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/lulupang2/social_commerce/apps/api/internal/auth"
	"github.com/lulupang2/social_commerce/apps/api/internal/httpapi"
	"github.com/lulupang2/social_commerce/apps/api/internal/jobs"
	"github.com/lulupang2/social_commerce/apps/api/internal/listingimages"
	"github.com/lulupang2/social_commerce/apps/api/internal/listings"
	"github.com/lulupang2/social_commerce/apps/api/internal/migrate"
	"github.com/lulupang2/social_commerce/apps/api/internal/platform"
)

func Main(kind string) int {
	logger := platform.NewLogger(os.Stdout, "info")
	if err := run(kind, logger); err != nil {
		// All returned errors are static application errors or setting names.
		logger.Error("command_failed", "error_code", "STARTUP_OR_COMMAND_FAILED", "reason", err.Error())
		return 1
	}
	return 0
}

func run(kind string, logger *slog.Logger) error {
	flags := flag.NewFlagSet(kind, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	envFile := flags.String("env-file", os.Getenv("SUMMERGEAR_ENV_FILE"), "Private literal environment file")
	check := flags.Bool("check-config", false, "Validate settings without connecting")
	apply := flags.Bool("apply", false, "Apply migrations explicitly; otherwise inspect only")
	appSQL := flags.String("app-migration", "", "Legacy 0007-only fixture migration path")
	appDir := flags.String("app-migrations-dir", "../../supabase/migrations", "Directory containing ordered Go app migrations")
	key := flags.String("key", "", "Sample idempotency key")
	fail := flags.Int("fail-attempts", 0, "Fixture-only failed attempts")
	delay := flags.Int("delay-ms", 0, "Fixture-only first attempt delay")
	attempts := flags.Int("max-attempts", 3, "Maximum attempts")
	if flags.Parse(os.Args[1:]) != nil || flags.NArg() != 0 {
		return errors.New("invalid command arguments")
	}
	role := platform.Role(kind)
	if kind == "sample" {
		role = platform.API
	}
	if kind == "migrate" {
		role = platform.Migration
	}
	cfg, err := platform.LoadConfig(role, *envFile)
	if err != nil {
		return err
	}
	logger = platform.NewLogger(os.Stdout, cfg.LogLevel)
	var authConfig auth.Config
	if kind == "api" {
		authConfig, err = auth.LoadConfig(*envFile, cfg)
		if err != nil {
			return err
		}
		for _, provider := range authConfig.Statuses() {
			logger.Info("oauth_configuration", "provider", provider.Provider, "enabled", provider.Enabled, "missing_settings", provider.Missing)
		}
	}
	if *check {
		logger.Info("configuration_valid", "process", kind)
		return nil
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool, err := platform.OpenDatabase(ctx, cfg)
	if err != nil {
		return err
	}
	defer pool.Close()
	switch kind {
	case "api":
		// Construct an insert-only River client; the HTTP process never starts workers.
		if _, err = jobs.NewClient(pool, cfg, logger, false); err != nil {
			return err
		}
		if err = platform.Ready(ctx, pool); err != nil {
			return errors.New("API database schema is not ready")
		}
		authStore := &auth.Store{Pool: pool, Config: authConfig}
		listingStore := &listings.Store{Pool: pool}
		imageStore := &listingimages.Store{Pool: pool}
		imageStorage, storageConfigured, storageErr := listingimages.NewStorage(cfg, nil)
		if storageErr != nil {
			return storageErr
		}
		logger.Info("listing_image_storage_configuration", "configured", storageConfigured)
		imageService := &listingimages.Service{
			Repo: imageStore, Storage: imageStorage, TTL: cfg.ListingImageSignedURLTTL, Logger: logger,
		}
		ready := func(c context.Context) error {
			if err := platform.Ready(c, pool); err != nil {
				return err
			}
			if err := authStore.Ready(c); err != nil {
				return err
			}
			if err := listingStore.Ready(c); err != nil {
				return err
			}
			return imageStore.Ready(c)
		}
		if err = ready(ctx); err != nil {
			return errors.New("API application schema is not ready")
		}
		s := httpapi.New(logger, ready)
		authHandler := auth.Register(s.App, authConfig, pool, logger)
		listings.Register(s.App, pool, authHandler, imageService, logger)
		listingimages.Register(s.App, authHandler, imageService, logger)
		listenErr := make(chan error, 1)
		go func() { listenErr <- s.App.Listen(cfg.Address, fiber.ListenConfig{DisableStartupMessage: true}) }()
		logger.Info("api_starting")
		select {
		case err := <-listenErr:
			if err != nil {
				return errors.New("API listener failed")
			}
			return nil
		case <-ctx.Done():
		}
		s.Draining.Store(true)
		shutdown, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if s.App.ShutdownWithContext(shutdown) != nil {
			return errors.New("API shutdown timed out")
		}
		logger.Info("api_stopped")
		return nil
	case "worker":
		if err = platform.Ready(ctx, pool); err != nil {
			return errors.New("worker database schema is not ready")
		}
		client, err := jobs.NewClient(pool, cfg, logger, true)
		if err != nil {
			return err
		}
		// Signal cancellation starts a bounded drain; it does not immediately
		// cancel the running job's context.
		if err = client.Start(context.Background()); err != nil {
			return errors.New("worker start failed")
		}
		logger.Info("worker_started", "concurrency", cfg.MaxWorkers)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		err = client.Stop(shutdown)
		cancel()
		if err != nil {
			force, done := context.WithTimeout(context.Background(), 5*time.Second)
			defer done()
			_ = client.StopAndCancel(force)
			return errors.New("worker drain deadline exceeded; remaining jobs will be rescued")
		}
		logger.Info("worker_stopped")
		return nil
	case "migrate":
		deadline, cancel := context.WithTimeout(ctx, time.Minute)
		defer cancel()
		var migrationFiles []migrate.File
		if *appSQL != "" {
			if filepath.Base(*appSQL) != migrate.AppVersion+".sql" {
				return errors.New("--app-migration supports only the original 0007 fixture; use --app-migrations-dir")
			}
			sql, readErr := os.ReadFile(*appSQL)
			if readErr != nil {
				return errors.New("app migration file cannot be read")
			}
			migrationFiles = []migrate.File{{Version: migrate.AppVersion, SQL: sql}}
		} else {
			migrationFiles, err = migrate.LoadFiles(*appDir)
			if err != nil {
				return err
			}
		}
		result, err := migrate.Run(deadline, pool, migrationFiles, *apply, logger)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	case "sample":
		if *key == "" {
			return errors.New("sample requires --key with a stable idempotency key")
		}
		client, err := jobs.NewClient(pool, cfg, logger, false)
		if err != nil {
			return err
		}
		deadline, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		result, err := jobs.NewService(pool, client, cfg.Target == "fixture").Create(deadline, *key, jobs.Options{FailAttempts: *fail, DelayMS: *delay, MaxAttempts: *attempts})
		if err != nil {
			return errors.New("sample transaction failed")
		}
		return json.NewEncoder(os.Stdout).Encode(result)
	default:
		return fmt.Errorf("unsupported process")
	}
}
