//go:build linux || darwin

package backend

import _ "embed"

//go:embed bin/metadata-extractor
var metadataExtractorBin []byte
