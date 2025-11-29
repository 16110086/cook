package backend

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// getExecutableName returns the appropriate executable name for the current OS
func getExecutableName() string {
	if runtime.GOOS == "windows" {
		return "metadata-extractor.exe"
	}
	return "metadata-extractor"
}

// AccountInfo represents Twitter account information
type AccountInfo struct {
	Name           string `json:"name"`
	Nick           string `json:"nick"`
	Date           string `json:"date"`
	FollowersCount int    `json:"followers_count"`
	FriendsCount   int    `json:"friends_count"`
	ProfileImage   string `json:"profile_image"`
	StatusesCount  int    `json:"statuses_count"`
}

// TweetIDString is a custom type that unmarshals int64 but marshals as string
type TweetIDString int64

// MarshalJSON converts TweetIDString to JSON string to preserve precision in JavaScript
func (t TweetIDString) MarshalJSON() ([]byte, error) {
	return []byte(fmt.Sprintf(`"%d"`, t)), nil
}

// UnmarshalJSON accepts both number and string from JSON
func (t *TweetIDString) UnmarshalJSON(data []byte) error {
	// Try to unmarshal as number first (from metadata-extractor)
	var num int64
	if err := json.Unmarshal(data, &num); err == nil {
		*t = TweetIDString(num)
		return nil
	}
	// Try as string (for future compatibility)
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		parsed, err := fmt.Sscanf(str, "%d", &num)
		if err != nil || parsed != 1 {
			return fmt.Errorf("invalid tweet_id string: %s", str)
		}
		*t = TweetIDString(num)
		return nil
	}
	return fmt.Errorf("tweet_id must be number or string")
}

// TimelineEntry represents a single media entry
type TimelineEntry struct {
	URL       string        `json:"url"`
	Date      string        `json:"date"`
	TweetID   TweetIDString `json:"tweet_id"`
	Type      string        `json:"type"`
	IsRetweet bool          `json:"is_retweet"`
}

// Metadata represents extraction metadata
type ExtractMetadata struct {
	NewEntries int  `json:"new_entries"`
	Page       int  `json:"page"`
	BatchSize  int  `json:"batch_size"`
	HasMore    bool `json:"has_more"`
}

// TwitterResponse represents the full response from metadata-extractor
type TwitterResponse struct {
	AccountInfo AccountInfo     `json:"account_info"`
	TotalURLs   int             `json:"total_urls"`
	Timeline    []TimelineEntry `json:"timeline"`
	Metadata    ExtractMetadata `json:"metadata"`
}

// TimelineRequest represents request parameters for timeline extraction
type TimelineRequest struct {
	Username     string `json:"username"`
	AuthToken    string `json:"auth_token"`
	TimelineType string `json:"timeline_type"` // media, timeline, tweets, with_replies
	BatchSize    int    `json:"batch_size"`    // 0 = all
	Page         int    `json:"page"`
	MediaType    string `json:"media_type"` // all, image, video, gif
	Retweets     bool   `json:"retweets"`
}

// DateRangeRequest represents request parameters for date range extraction
type DateRangeRequest struct {
	Username    string `json:"username"`
	AuthToken   string `json:"auth_token"`
	StartDate   string `json:"start_date"` // YYYY-MM-DD
	EndDate     string `json:"end_date"`   // YYYY-MM-DD
	MediaFilter string `json:"media_filter"`
}

// ExtractTimeline extracts media from user timeline
func ExtractTimeline(req TimelineRequest) (*TwitterResponse, error) {
	// Create temporary file for metadata-extractor
	tempDir := os.TempDir()
	exePath := filepath.Join(tempDir, getExecutableName())

	// Write embedded binary to temporary file
	err := os.WriteFile(exePath, metadataExtractorBin, 0755)
	if err != nil {
		return nil, fmt.Errorf("failed to write metadata-extractor: %v", err)
	}
	defer os.Remove(exePath)

	// Build command arguments - global args first, then subcommand
	args := []string{"--token", req.AuthToken, "--json", "timeline", req.Username}

	// Add optional parameters for timeline subcommand
	if req.TimelineType != "" && req.TimelineType != "media" {
		args = append(args, "--timeline-type", req.TimelineType)
	}

	// BatchSize: 0 = all (no limit), >0 = specific batch size
	args = append(args, "--batch-size", fmt.Sprintf("%d", req.BatchSize))

	if req.Page > 0 {
		args = append(args, "--page", fmt.Sprintf("%d", req.Page))
	}

	if req.MediaType != "" && req.MediaType != "all" {
		args = append(args, "--media-type", req.MediaType)
	}

	if req.Retweets {
		args = append(args, "--retweets")
	} else {
		args = append(args, "--no-retweets")
	}

	// Execute command with UTF-8 encoding
	cmd := exec.Command(exePath, args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	hideWindow(cmd) // Hide console window on Windows
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to execute metadata-extractor: %v, output: %s", err, string(output))
	}

	// Find JSON in output (skip any info messages)
	jsonStr := extractJSON(string(output))
	if jsonStr == "" {
		return nil, fmt.Errorf("no JSON found in output: %s", string(output))
	}

	// Parse JSON response
	var response TwitterResponse
	if err := json.Unmarshal([]byte(jsonStr), &response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v, output: %s", err, jsonStr)
	}

	return &response, nil
}

// ExtractDateRange extracts media based on date range
func ExtractDateRange(req DateRangeRequest) (*TwitterResponse, error) {
	// Create temporary file for metadata-extractor
	tempDir := os.TempDir()
	exePath := filepath.Join(tempDir, getExecutableName())

	// Write embedded binary to temporary file
	err := os.WriteFile(exePath, metadataExtractorBin, 0755)
	if err != nil {
		return nil, fmt.Errorf("failed to write metadata-extractor: %v", err)
	}
	defer os.Remove(exePath)

	// Build command arguments - global args first, then subcommand
	args := []string{
		"--token", req.AuthToken,
		"--json",
		"daterange", req.Username,
		"--start-date", req.StartDate,
		"--end-date", req.EndDate,
	}

	// Add optional media filter
	if req.MediaFilter != "" {
		args = append(args, "--filter", req.MediaFilter)
	}

	// Execute command with UTF-8 encoding
	cmd := exec.Command(exePath, args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	hideWindow(cmd) // Hide console window on Windows
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to execute metadata-extractor: %v, output: %s", err, string(output))
	}

	// Find JSON in output (skip any info messages)
	jsonStr := extractJSON(string(output))
	if jsonStr == "" {
		return nil, fmt.Errorf("no JSON found in output: %s", string(output))
	}

	// Parse JSON response
	var response TwitterResponse
	if err := json.Unmarshal([]byte(jsonStr), &response); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v, output: %s", err, jsonStr)
	}

	return &response, nil
}

// extractJSON finds and extracts JSON object from output string
func extractJSON(output string) string {
	// Find the start of JSON object
	start := strings.Index(output, "{")
	if start == -1 {
		return ""
	}

	// Find the matching closing brace
	depth := 0
	for i := start; i < len(output); i++ {
		if output[i] == '{' {
			depth++
		} else if output[i] == '}' {
			depth--
			if depth == 0 {
				return output[start : i+1]
			}
		}
	}

	return ""
}

// GetThumbnailURL converts a Twitter media URL to thumbnail size
func GetThumbnailURL(url string) string {
	// For images: https://pbs.twimg.com/media/XXX?format=jpg&name=thumb
	if strings.Contains(url, "pbs.twimg.com/media/") {
		// Check if it already has format parameter
		if strings.Contains(url, "?format=") {
			// Replace name parameter with thumb
			if strings.Contains(url, "&name=") {
				parts := strings.Split(url, "&name=")
				return parts[0] + "&name=thumb"
			}
			return url + "&name=thumb"
		}
		// Add format and name parameters
		if strings.Contains(url, "?") {
			return url + "&name=thumb"
		}
		return url + "?format=jpg&name=thumb"
	}
	return url
}
