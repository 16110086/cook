package main

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"twitterxmediabatchdownloader/backend"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx            context.Context
	downloadCtx    context.Context
	downloadCancel context.CancelFunc
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Initialize database
	backend.InitDB()
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	backend.CloseDB()
}

// TimelineRequest represents the request structure for timeline extraction
type TimelineRequest struct {
	Username     string `json:"username"`
	AuthToken    string `json:"auth_token"`
	TimelineType string `json:"timeline_type"`
	BatchSize    int    `json:"batch_size"`
	Page         int    `json:"page"`
	MediaType    string `json:"media_type"`
	Retweets     bool   `json:"retweets"`
}

// DateRangeRequest represents the request structure for date range extraction
type DateRangeRequest struct {
	Username    string `json:"username"`
	AuthToken   string `json:"auth_token"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	MediaFilter string `json:"media_filter"`
}

// ExtractTimeline extracts media from user timeline
func (a *App) ExtractTimeline(req TimelineRequest) (string, error) {
	if req.Username == "" {
		return "", fmt.Errorf("username is required")
	}
	if req.AuthToken == "" {
		return "", fmt.Errorf("auth token is required")
	}

	backendReq := backend.TimelineRequest{
		Username:     req.Username,
		AuthToken:    req.AuthToken,
		TimelineType: req.TimelineType,
		BatchSize:    req.BatchSize,
		Page:         req.Page,
		MediaType:    req.MediaType,
		Retweets:     req.Retweets,
	}

	response, err := backend.ExtractTimeline(backendReq)
	if err != nil {
		return "", fmt.Errorf("failed to extract timeline: %v", err)
	}

	jsonData, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to encode response: %v", err)
	}

	return string(jsonData), nil
}

// ExtractDateRange extracts media based on date range
func (a *App) ExtractDateRange(req DateRangeRequest) (string, error) {
	if req.Username == "" {
		return "", fmt.Errorf("username is required")
	}
	if req.AuthToken == "" {
		return "", fmt.Errorf("auth token is required")
	}
	if req.StartDate == "" {
		return "", fmt.Errorf("start date is required")
	}
	if req.EndDate == "" {
		return "", fmt.Errorf("end date is required")
	}

	backendReq := backend.DateRangeRequest{
		Username:    req.Username,
		AuthToken:   req.AuthToken,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
		MediaFilter: req.MediaFilter,
	}

	response, err := backend.ExtractDateRange(backendReq)
	if err != nil {
		return "", fmt.Errorf("failed to extract date range: %v", err)
	}

	jsonData, err := json.MarshalIndent(response, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to encode response: %v", err)
	}

	return string(jsonData), nil
}

// OpenFolder opens a folder in the file explorer
func (a *App) OpenFolder(path string) error {
	if path == "" {
		return fmt.Errorf("path is required")
	}

	err := backend.OpenFolderInExplorer(path)
	if err != nil {
		return fmt.Errorf("failed to open folder: %v", err)
	}

	return nil
}

// SelectFolder opens a folder selection dialog and returns the selected path
func (a *App) SelectFolder(defaultPath string) (string, error) {
	return backend.SelectFolderDialog(a.ctx, defaultPath)
}

// GetDefaults returns the default configuration
func (a *App) GetDefaults() map[string]string {
	return map[string]string{
		"downloadPath": backend.GetDefaultDownloadPath(),
	}
}

// Quit closes the application
func (a *App) Quit() {
	panic("quit")
}

// DownloadMediaRequest represents the request for downloading media (legacy)
type DownloadMediaRequest struct {
	URLs      []string `json:"urls"`
	OutputDir string   `json:"output_dir"`
	Username  string   `json:"username"`
}

// MediaItemRequest represents a media item with metadata
type MediaItemRequest struct {
	URL     string                `json:"url"`
	Date    string                `json:"date"`
	TweetID backend.TweetIDString `json:"tweet_id"`
	Type    string                `json:"type"`
}

// DownloadMediaWithMetadataRequest represents the request for downloading media with metadata
type DownloadMediaWithMetadataRequest struct {
	Items     []MediaItemRequest `json:"items"`
	OutputDir string             `json:"output_dir"`
	Username  string             `json:"username"`
}

// DownloadMediaResponse represents the response for download operation
type DownloadMediaResponse struct {
	Success    bool   `json:"success"`
	Downloaded int    `json:"downloaded"`
	Failed     int    `json:"failed"`
	Message    string `json:"message"`
}

// DownloadMedia downloads media files from URLs (legacy)
func (a *App) DownloadMedia(req DownloadMediaRequest) (DownloadMediaResponse, error) {
	if len(req.URLs) == 0 {
		return DownloadMediaResponse{
			Success: false,
			Message: "No URLs provided",
		}, fmt.Errorf("no URLs provided")
	}

	outputDir := req.OutputDir
	if outputDir == "" {
		outputDir = backend.GetDefaultDownloadPath()
	}

	// Create subfolder for username if provided
	if req.Username != "" {
		outputDir = filepath.Join(outputDir, req.Username)
	}

	downloaded, failed, err := backend.DownloadMediaFiles(req.URLs, outputDir)
	if err != nil {
		return DownloadMediaResponse{
			Success:    false,
			Downloaded: downloaded,
			Failed:     failed,
			Message:    err.Error(),
		}, err
	}

	return DownloadMediaResponse{
		Success:    true,
		Downloaded: downloaded,
		Failed:     failed,
		Message:    fmt.Sprintf("Downloaded %d files, %d failed", downloaded, failed),
	}, nil
}

// DownloadProgress represents download progress event data
type DownloadProgress struct {
	Current int `json:"current"`
	Total   int `json:"total"`
	Percent int `json:"percent"`
}

// DownloadMediaWithMetadata downloads media files with proper naming and categorization
func (a *App) DownloadMediaWithMetadata(req DownloadMediaWithMetadataRequest) (DownloadMediaResponse, error) {
	if len(req.Items) == 0 {
		return DownloadMediaResponse{
			Success: false,
			Message: "No items provided",
		}, fmt.Errorf("no items provided")
	}

	outputDir := req.OutputDir
	if outputDir == "" {
		outputDir = backend.GetDefaultDownloadPath()
	}

	// Convert request items to backend items
	items := make([]backend.MediaItem, len(req.Items))
	for i, item := range req.Items {
		items[i] = backend.MediaItem{
			URL:      item.URL,
			Date:     item.Date,
			TweetID:  int64(item.TweetID),
			Type:     item.Type,
			Username: req.Username,
		}
	}

	// Create cancellable context
	a.downloadCtx, a.downloadCancel = context.WithCancel(context.Background())

	// Progress callback
	progressCallback := func(current, total int) {
		percent := 0
		if total > 0 {
			percent = (current * 100) / total
		}
		runtime.EventsEmit(a.ctx, "download-progress", DownloadProgress{
			Current: current,
			Total:   total,
			Percent: percent,
		})
	}

	downloaded, failed, err := backend.DownloadMediaWithMetadataProgress(items, outputDir, req.Username, progressCallback, a.downloadCtx)
	if err != nil {
		return DownloadMediaResponse{
			Success:    false,
			Downloaded: downloaded,
			Failed:     failed,
			Message:    err.Error(),
		}, err
	}

	// Clear cancel function
	a.downloadCancel = nil

	return DownloadMediaResponse{
		Success:    true,
		Downloaded: downloaded,
		Failed:     failed,
		Message:    fmt.Sprintf("Downloaded %d files, %d failed", downloaded, failed),
	}, nil
}

// StopDownload cancels the current download operation
func (a *App) StopDownload() bool {
	if a.downloadCancel != nil {
		a.downloadCancel()
		a.downloadCancel = nil
		return true
	}
	return false
}

// Database functions

// SaveAccountToDB saves account data to database
func (a *App) SaveAccountToDB(username, name, profileImage string, totalMedia int, responseJSON string) error {
	return backend.SaveAccount(username, name, profileImage, totalMedia, responseJSON)
}

// GetAllAccountsFromDB returns all saved accounts
func (a *App) GetAllAccountsFromDB() ([]backend.AccountListItem, error) {
	return backend.GetAllAccounts()
}

// GetAccountFromDB returns account data by ID
func (a *App) GetAccountFromDB(id int64) (string, error) {
	acc, err := backend.GetAccountByID(id)
	if err != nil {
		return "", err
	}
	return acc.ResponseJSON, nil
}

// DeleteAccountFromDB deletes an account from database
func (a *App) DeleteAccountFromDB(id int64) error {
	return backend.DeleteAccount(id)
}

// ExportAccountJSON exports account to JSON file in specified directory
func (a *App) ExportAccountJSON(id int64, outputDir string) (string, error) {
	return backend.ExportAccountToFile(id, outputDir)
}

// FFmpeg functions

// IsFFmpegInstalled checks if ffmpeg is available
func (a *App) IsFFmpegInstalled() bool {
	return backend.IsFFmpegInstalled()
}

// DownloadFFmpeg downloads ffmpeg binary
func (a *App) DownloadFFmpeg() error {
	return backend.DownloadFFmpeg(nil)
}

// ConvertGIFsRequest represents request for converting GIFs
type ConvertGIFsRequest struct {
	FolderPath     string `json:"folder_path"`
	FPS            int    `json:"fps"`
	Width          int    `json:"width"`
	DeleteOriginal bool   `json:"delete_original"`
}

// ConvertGIFsResponse represents response for GIF conversion
type ConvertGIFsResponse struct {
	Success   bool   `json:"success"`
	Converted int    `json:"converted"`
	Failed    int    `json:"failed"`
	Message   string `json:"message"`
}

// ConvertGIFs converts MP4 files in gifs folder to actual GIF format
func (a *App) ConvertGIFs(req ConvertGIFsRequest) (ConvertGIFsResponse, error) {
	if !backend.IsFFmpegInstalled() {
		return ConvertGIFsResponse{
			Success: false,
			Message: "FFmpeg not installed. Please download it first.",
		}, nil
	}

	converted, failed, err := backend.ConvertGIFsInFolder(req.FolderPath, req.FPS, req.Width, req.DeleteOriginal)
	if err != nil {
		return ConvertGIFsResponse{
			Success: false,
			Message: err.Error(),
		}, err
	}

	return ConvertGIFsResponse{
		Success:   true,
		Converted: converted,
		Failed:    failed,
		Message:   fmt.Sprintf("Converted %d GIFs, %d failed", converted, failed),
	}, nil
}
