// Command mlw-app serves the REST API and web UI for the MLW Cassandra database.
package main

import (
	"context"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/magic-lantern-workbench/mlw-platform/app/internal/api"
	"github.com/magic-lantern-workbench/mlw-platform/app/internal/config"
	"github.com/magic-lantern-workbench/mlw-platform/app/internal/store"
	"github.com/magic-lantern-workbench/mlw-platform/app/internal/tlsutil"
	"github.com/magic-lantern-workbench/mlw-platform/app/web"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "query the running server's health endpoint and exit (for Docker HEALTHCHECK)")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "configuration error:", err)
		os.Exit(2)
	}
	if *healthcheck {
		os.Exit(check(cfg))
	}

	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Info("connecting to Cassandra", "hosts", cfg.Hosts, "port", cfg.Port, "keyspace", cfg.Keyspace,
		"auth", cfg.Username != "", "tls", cfg.TLS, "applySchema", cfg.ApplySchema)
	st, err := store.Connect(ctx, cfg, log)
	if err != nil {
		log.Error("cannot start", "error", err)
		os.Exit(1)
	}
	defer st.Close()
	if cfg.APIToken == "" {
		log.Warn("API_TOKEN is not set: the REST API is unauthenticated")
	}
	if cfg.TLS && cfg.TLSSkipVerify {
		log.Warn("CASSANDRA_TLS_SKIP_VERIFY is set: the Cassandra server certificate is not verified")
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(st, cfg.APIToken, web.Files(), log).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
	if cfg.HTTPS() {
		certs, err := tlsutil.NewReloader(cfg.ServerCertFile, cfg.ServerKeyFile, log)
		if err != nil {
			log.Error("cannot start", "error", err)
			os.Exit(1)
		}
		srv.TLSConfig = &tls.Config{MinVersion: cfg.MinTLSVersion, GetCertificate: certs.GetCertificate}
	} else if cfg.APIToken != "" {
		log.Warn("serving plain HTTP: the API token is sent unencrypted; set TLS_CERT_FILE and TLS_KEY_FILE, or put an HTTPS proxy in front")
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		srv.Shutdown(shutdown)
	}()
	log.Info("listening", "addr", cfg.Addr, "https", cfg.HTTPS(), "tables", len(st.Tables()))
	var serveErr error
	if cfg.HTTPS() {
		serveErr = srv.ListenAndServeTLS("", "") // certificates come from TLSConfig
	} else {
		serveErr = srv.ListenAndServe()
	}
	if err := serveErr; !errors.Is(err, http.ErrServerClosed) {
		log.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

// check asks the local server whether it is healthy; it returns the exit code.
// It talks to the loopback address, so the certificate name is not checked.
func check(cfg config.Config) int {
	host, port, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return 1
	}
	if host == "" {
		host = "127.0.0.1"
	}
	scheme := "http"
	c := http.Client{Timeout: 4 * time.Second}
	if cfg.HTTPS() {
		scheme = "https"
		c.Transport = &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}
	}
	resp, err := c.Get(scheme + "://" + net.JoinHostPort(host, port) + "/api/v1/health")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
