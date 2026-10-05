// Package tlsutil loads the server certificate for HTTPS and reloads it when
// the files change, so a renewed certificate is used without a restart.
package tlsutil

import (
	"crypto/tls"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"
)

// Reloader serves a certificate read from a PEM certificate and key file.
type Reloader struct {
	certFile, keyFile string
	log               *slog.Logger

	mu       sync.Mutex
	cert     *tls.Certificate
	certTime time.Time
	keyTime  time.Time
	checked  time.Time
}

// recheck is how often the files are looked at, at most.
const recheck = 10 * time.Second

// NewReloader loads the certificate and fails if it cannot be read.
func NewReloader(certFile, keyFile string, log *slog.Logger) (*Reloader, error) {
	r := &Reloader{certFile: certFile, keyFile: keyFile, log: log}
	if err := r.load(); err != nil {
		return nil, err
	}
	return r, nil
}

func (r *Reloader) load() error {
	cert, err := tls.LoadX509KeyPair(r.certFile, r.keyFile)
	if err != nil {
		return fmt.Errorf("loading TLS certificate %s and key %s: %w", r.certFile, r.keyFile, err)
	}
	ci, err1 := os.Stat(r.certFile)
	ki, err2 := os.Stat(r.keyFile)
	if err1 != nil || err2 != nil {
		return fmt.Errorf("reading TLS certificate files: %v %v", err1, err2)
	}
	r.cert, r.certTime, r.keyTime = &cert, ci.ModTime(), ki.ModTime()
	return nil
}

// GetCertificate is for tls.Config.GetCertificate. It reloads the files when
// they have changed. A failed reload keeps the certificate in use.
func (r *Reloader) GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if time.Since(r.checked) >= recheck {
		r.checked = time.Now()
		ci, err1 := os.Stat(r.certFile)
		ki, err2 := os.Stat(r.keyFile)
		if err1 == nil && err2 == nil && (!ci.ModTime().Equal(r.certTime) || !ki.ModTime().Equal(r.keyTime)) {
			if err := r.load(); err != nil {
				r.log.Error("reloading the TLS certificate failed; keeping the old one", "error", err)
			} else {
				r.log.Info("reloaded the TLS certificate", "file", r.certFile)
			}
		}
	}
	return r.cert, nil
}
