package store

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/gocql/gocql"

	"github.com/magic-lantern-workbench/mlw-platform/app/internal/config"
	"github.com/magic-lantern-workbench/mlw-platform/app/internal/schema"
)

func newCluster(cfg config.Config, keyspace string) (*gocql.ClusterConfig, error) {
	cl := gocql.NewCluster(cfg.Hosts...)
	cl.Port = cfg.Port
	cl.Keyspace = keyspace
	cl.Timeout = 10 * time.Second
	cl.ConnectTimeout = 10 * time.Second
	cl.DisableInitialHostLookup = cfg.DisableInitialHostLookup
	cl.IgnorePeerAddr = cfg.IgnorePeerAddr

	cons, err := gocql.ParseConsistencyWrapper(cfg.Consistency)
	if err != nil {
		return nil, fmt.Errorf("CASSANDRA_CONSISTENCY: %w", err)
	}
	cl.Consistency = cons
	if strings.HasPrefix(cfg.Consistency, "LOCAL_") {
		cl.SerialConsistency = gocql.LocalSerial
	}
	if cfg.Username != "" {
		cl.Authenticator = gocql.PasswordAuthenticator{Username: cfg.Username, Password: cfg.Password}
	}
	if cfg.TLS {
		cl.SslOpts = &gocql.SslOptions{
			Config:                 &tls.Config{MinVersion: tls.VersionTLS12, ServerName: cfg.TLSServerName},
			CaPath:                 cfg.TLSCAFile,
			CertPath:               cfg.TLSCertFile,
			KeyPath:                cfg.TLSKeyFile,
			EnableHostVerification: !cfg.TLSSkipVerify,
		}
	}
	if cfg.LocalDC != "" {
		cl.PoolConfig.HostSelectionPolicy = gocql.TokenAwareHostPolicy(gocql.DCAwareRoundRobinPolicy(cfg.LocalDC))
	}
	return cl, nil
}

// Connect opens the connection, optionally applies the embedded schema, and
// reads the table definitions. The first connection is retried until
// cfg.StartupWait has passed, so the application can start before Cassandra.
func Connect(ctx context.Context, cfg config.Config, log *slog.Logger) (*Store, error) {
	if cfg.ApplySchema {
		cl, err := newCluster(cfg, "")
		if err != nil {
			return nil, err
		}
		sess, err := retrySession(ctx, cl, cfg.StartupWait, log)
		if err != nil {
			return nil, err
		}
		log.Info("applying schema")
		err = schema.Apply(sess)
		sess.Close()
		if err != nil {
			return nil, err
		}
	}
	cl, err := newCluster(cfg, cfg.Keyspace)
	if err != nil {
		return nil, err
	}
	sess, err := retrySession(ctx, cl, cfg.StartupWait, log)
	if err != nil {
		if strings.Contains(err.Error(), "keyspace") {
			return nil, fmt.Errorf("%w (create the schema first, or set APPLY_SCHEMA=true)", err)
		}
		return nil, err
	}
	tables, skipped, err := loadTables(sess, cfg.Keyspace)
	if err != nil {
		sess.Close()
		return nil, err
	}
	for _, s := range skipped {
		log.Warn("column type not supported by the API; column ignored", "column", s)
	}
	return &Store{session: sess, keyspace: cfg.Keyspace, tables: tables, log: log}, nil
}

func retrySession(ctx context.Context, cl *gocql.ClusterConfig, wait time.Duration, log *slog.Logger) (*gocql.Session, error) {
	deadline := time.Now().Add(wait)
	for {
		sess, err := cl.CreateSession()
		if err == nil {
			return sess, nil
		}
		// a missing keyspace will not appear by waiting
		if strings.Contains(err.Error(), "keyspace") && strings.Contains(err.Error(), "exist") {
			return nil, err
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("connecting to Cassandra at %v:%d: %w", cl.Hosts, cl.Port, err)
		}
		log.Info("waiting for Cassandra", "hosts", cl.Hosts, "error", err.Error())
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
}
