// Package config reads the application configuration from environment variables.
package config

import (
	"crypto/tls"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds the settings for the HTTP server and the Cassandra connection.
type Config struct {
	Addr     string // HTTP listen address
	APIToken string // bearer token required by the REST API; empty disables auth

	// HTTPS: when both files are set the server speaks TLS instead of plain HTTP.
	ServerCertFile string
	ServerKeyFile  string
	MinTLSVersion  uint16

	Hosts       []string
	Port        int
	Keyspace    string
	Username    string
	Password    string
	LocalDC     string // preferred datacenter; empty means no DC-aware routing
	Consistency string

	TLS           bool
	TLSCAFile     string
	TLSSkipVerify bool
	// TLSCertFile and TLSKeyFile are a client certificate, for clusters that
	// require one (mutual TLS). TLSServerName overrides the name the server
	// certificate is checked against, for example when connecting by IP address.
	TLSCertFile   string
	TLSKeyFile    string
	TLSServerName string

	// DisableInitialHostLookup and IgnorePeerAddr make the driver use only the
	// configured hosts. They are needed when the cluster advertises addresses
	// that are not reachable from here (SSH tunnel, NAT, port forwarding).
	DisableInitialHostLookup bool
	IgnorePeerAddr           bool

	ApplySchema bool          // run the embedded cql files at startup
	StartupWait time.Duration // how long to keep retrying the first connection
}

// HTTPS reports whether the server should speak TLS.
func (c Config) HTTPS() bool { return c.ServerCertFile != "" }

// Load reads the configuration from the environment.
func Load() (Config, error) {
	c := Config{
		Addr:        env("ADDR", ":8080"),
		APIToken:    os.Getenv("API_TOKEN"),
		Port:        9042,
		Keyspace:    env("CASSANDRA_KEYSPACE", "mlw"),
		Username:    os.Getenv("CASSANDRA_USERNAME"),
		Password:    os.Getenv("CASSANDRA_PASSWORD"),
		LocalDC:     os.Getenv("CASSANDRA_LOCAL_DC"),
		Consistency: strings.ToUpper(env("CASSANDRA_CONSISTENCY", "LOCAL_QUORUM")),
		TLSCAFile:   os.Getenv("CASSANDRA_TLS_CA_FILE"),
		TLSCertFile: os.Getenv("CASSANDRA_TLS_CERT_FILE"),
		TLSKeyFile:  os.Getenv("CASSANDRA_TLS_KEY_FILE"),

		TLSServerName:  os.Getenv("CASSANDRA_TLS_SERVER_NAME"),
		ServerCertFile: os.Getenv("TLS_CERT_FILE"),
		ServerKeyFile:  os.Getenv("TLS_KEY_FILE"),
		StartupWait:    2 * time.Minute,
	}
	for _, h := range strings.Split(env("CASSANDRA_HOSTS", "localhost"), ",") {
		if h = strings.TrimSpace(h); h != "" {
			c.Hosts = append(c.Hosts, h)
		}
	}
	var err error
	if c.Port, err = intEnv("CASSANDRA_PORT", c.Port); err != nil {
		return c, err
	}
	if c.TLS, err = boolEnv("CASSANDRA_TLS", false); err != nil {
		return c, err
	}
	if c.TLSSkipVerify, err = boolEnv("CASSANDRA_TLS_SKIP_VERIFY", false); err != nil {
		return c, err
	}
	if c.DisableInitialHostLookup, err = boolEnv("CASSANDRA_DISABLE_INITIAL_HOST_LOOKUP", false); err != nil {
		return c, err
	}
	if c.IgnorePeerAddr, err = boolEnv("CASSANDRA_IGNORE_PEER_ADDR", false); err != nil {
		return c, err
	}
	if c.ApplySchema, err = boolEnv("APPLY_SCHEMA", false); err != nil {
		return c, err
	}
	if v := os.Getenv("CASSANDRA_STARTUP_WAIT"); v != "" {
		if c.StartupWait, err = time.ParseDuration(v); err != nil {
			return c, fmt.Errorf("CASSANDRA_STARTUP_WAIT: %w", err)
		}
	}
	switch v := env("TLS_MIN_VERSION", "1.2"); v {
	case "1.2":
		c.MinTLSVersion = tls.VersionTLS12
	case "1.3":
		c.MinTLSVersion = tls.VersionTLS13
	default:
		return c, fmt.Errorf("TLS_MIN_VERSION must be 1.2 or 1.3, got %q", v)
	}
	if (c.ServerCertFile == "") != (c.ServerKeyFile == "") {
		return c, fmt.Errorf("TLS_CERT_FILE and TLS_KEY_FILE must be set together")
	}
	if (c.TLSCertFile == "") != (c.TLSKeyFile == "") {
		return c, fmt.Errorf("CASSANDRA_TLS_CERT_FILE and CASSANDRA_TLS_KEY_FILE must be set together")
	}
	if len(c.Hosts) == 0 {
		return c, fmt.Errorf("CASSANDRA_HOSTS is empty")
	}
	if (c.Username == "") != (c.Password == "") {
		return c, fmt.Errorf("CASSANDRA_USERNAME and CASSANDRA_PASSWORD must be set together")
	}
	return c, nil
}

func env(name, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

func intEnv(name string, def int) (int, error) {
	v := os.Getenv(name)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("%s: %w", name, err)
	}
	return n, nil
}

func boolEnv(name string, def bool) (bool, error) {
	v := os.Getenv(name)
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s: %w", name, err)
	}
	return b, nil
}
