package backend

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// AccountDB represents a saved account in the database
type AccountDB struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Name         string    `json:"name"`
	ProfileImage string    `json:"profile_image"`
	TotalMedia   int       `json:"total_media"`
	LastFetched  time.Time `json:"last_fetched"`
	ResponseJSON string    `json:"response_json"`
}

// AccountListItem represents a simplified account for listing
type AccountListItem struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	Name         string `json:"name"`
	ProfileImage string `json:"profile_image"`
	TotalMedia   int    `json:"total_media"`
	LastFetched  string `json:"last_fetched"`
}

var db *sql.DB

// GetDBPath returns the database file path
func GetDBPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	return filepath.Join(homeDir, ".twitterxmediabatchdownloader", "accounts.db")
}

// InitDB initializes the database connection
func InitDB() error {
	dbPath := GetDBPath()

	// Create directory if not exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	var err error
	db, err = sql.Open("sqlite3", dbPath)
	if err != nil {
		return err
	}

	// Create tables
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS accounts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			name TEXT,
			profile_image TEXT,
			total_media INTEGER DEFAULT 0,
			last_fetched DATETIME,
			response_json TEXT
		)
	`)
	return err
}

// CloseDB closes the database connection
func CloseDB() {
	if db != nil {
		db.Close()
	}
}

// SaveAccount saves or updates an account in the database
func SaveAccount(username, name, profileImage string, totalMedia int, responseJSON string) error {
	if db == nil {
		if err := InitDB(); err != nil {
			return err
		}
	}

	_, err := db.Exec(`
		INSERT INTO accounts (username, name, profile_image, total_media, last_fetched, response_json)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(username) DO UPDATE SET
			name = excluded.name,
			profile_image = excluded.profile_image,
			total_media = excluded.total_media,
			last_fetched = excluded.last_fetched,
			response_json = excluded.response_json
	`, username, name, profileImage, totalMedia, time.Now(), responseJSON)

	return err
}

// GetAllAccounts returns all saved accounts
func GetAllAccounts() ([]AccountListItem, error) {
	if db == nil {
		if err := InitDB(); err != nil {
			return nil, err
		}
	}

	rows, err := db.Query(`
		SELECT id, username, name, profile_image, total_media, last_fetched
		FROM accounts
		ORDER BY last_fetched DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []AccountListItem
	for rows.Next() {
		var acc AccountListItem
		var lastFetched time.Time
		if err := rows.Scan(&acc.ID, &acc.Username, &acc.Name, &acc.ProfileImage, &acc.TotalMedia, &lastFetched); err != nil {
			continue
		}
		acc.LastFetched = lastFetched.Format("2006-01-02 15:04")
		accounts = append(accounts, acc)
	}

	return accounts, nil
}

// GetAccountByUsername returns a specific account by username
func GetAccountByUsername(username string) (*AccountDB, error) {
	if db == nil {
		if err := InitDB(); err != nil {
			return nil, err
		}
	}

	var acc AccountDB
	var lastFetched time.Time
	err := db.QueryRow(`
		SELECT id, username, name, profile_image, total_media, last_fetched, response_json
		FROM accounts WHERE username = ?
	`, username).Scan(&acc.ID, &acc.Username, &acc.Name, &acc.ProfileImage, &acc.TotalMedia, &lastFetched, &acc.ResponseJSON)

	if err != nil {
		return nil, err
	}
	acc.LastFetched = lastFetched

	return &acc, nil
}

// GetAccountByID returns a specific account by ID
func GetAccountByID(id int64) (*AccountDB, error) {
	if db == nil {
		if err := InitDB(); err != nil {
			return nil, err
		}
	}

	var acc AccountDB
	var lastFetched time.Time
	err := db.QueryRow(`
		SELECT id, username, name, profile_image, total_media, last_fetched, response_json
		FROM accounts WHERE id = ?
	`, id).Scan(&acc.ID, &acc.Username, &acc.Name, &acc.ProfileImage, &acc.TotalMedia, &lastFetched, &acc.ResponseJSON)

	if err != nil {
		return nil, err
	}
	acc.LastFetched = lastFetched

	return &acc, nil
}

// DeleteAccount deletes an account from the database
func DeleteAccount(id int64) error {
	if db == nil {
		if err := InitDB(); err != nil {
			return err
		}
	}

	_, err := db.Exec("DELETE FROM accounts WHERE id = ?", id)
	return err
}

// ParseResponseJSON parses the stored JSON response
func ParseResponseJSON(jsonStr string) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := json.Unmarshal([]byte(jsonStr), &result)
	return result, err
}

// ExportAccountToFile exports account JSON to a file
func ExportAccountToFile(id int64, outputDir string) (string, error) {
	acc, err := GetAccountByID(id)
	if err != nil {
		return "", err
	}

	// Create export directory if not exists
	exportDir := filepath.Join(outputDir, "twitterxmediabatchdownloader_backups")
	if err := os.MkdirAll(exportDir, 0755); err != nil {
		return "", err
	}

	// Use username (nick) for filename
	filename := acc.Username
	if filename == "" {
		filename = acc.Name
	}

	filePath := filepath.Join(exportDir, filename+".json")

	if err := os.WriteFile(filePath, []byte(acc.ResponseJSON), 0644); err != nil {
		return "", err
	}

	return filePath, nil
}
