// Package web embeds the built Vue application.
package web

import (
	"embed"
	"io/fs"
)

// dist is produced by `npm run build` in this directory.
//
//go:embed all:dist
var dist embed.FS

// Files returns the built web UI.
func Files() fs.FS {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	return sub
}
