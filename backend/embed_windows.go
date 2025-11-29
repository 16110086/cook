//go:build windows

package backend

import _ "embed"

//go:embed bin/metadata-extractor.exe
var metadataExtractorBin []byte
