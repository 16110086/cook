## Usage

### Timeline Mode

Extract media from a user's timeline:

```bash
# Basic - extract media timeline
metadata-extractor.exe --token TOKEN timeline USERNAME

# With pagination (50 items per page)
metadata-extractor.exe --token TOKEN timeline USERNAME --batch-size 50 --page 0

# Filter images only, exclude retweets
metadata-extractor.exe --token TOKEN timeline USERNAME --media-type image --no-retweets

# Include retweets
metadata-extractor.exe --token TOKEN timeline USERNAME --retweets

# Timeline with replies
metadata-extractor.exe --token TOKEN timeline USERNAME --timeline-type with_replies

# Save to JSON file
metadata-extractor.exe --token TOKEN --output output.json timeline USERNAME

# Output raw JSON (pipe to other tools)
metadata-extractor.exe --token TOKEN --json timeline USERNAME
```

**Timeline Type Options**:

* `media` – Media timeline (default)
* `timeline` – Full timeline
* `tweets` – Tweets only
* `with_replies` – Tweets with replies

**Media Type Options**:

* `all` – All media (default)
* `image` – Images only
* `video` – Videos only
* `gif` – GIFs only

---

### Date Range Mode

Extract media based on date range:

```bash
# Basic date range
metadata-extractor.exe --token TOKEN daterange USERNAME --start-date 2024-01-01 --end-date 2024-12-31

# With custom filter
metadata-extractor.exe --token TOKEN daterange USERNAME --start-date 2024-01-01 --end-date 2024-12-31 --filter "filter:timeline"

# Save to file
metadata-extractor.exe --token TOKEN --output archive.json daterange USERNAME --start-date 2024-01-01 --end-date 2024-12-31
```

---

### Username Format Support

The tool supports multiple username input formats:

```bash
# Plain username
metadata-extractor.exe --token TOKEN timeline masteraoko

# With @
metadata-extractor.exe --token TOKEN timeline @masteraoko

# Full URL
metadata-extractor.exe --token TOKEN timeline "https://x.com/masteraoko"

# Twitter domain URL
metadata-extractor.exe --token TOKEN timeline "https://twitter.com/masteraoko"

# User ID (for suspended/private accounts)
metadata-extractor.exe --token TOKEN timeline "id:123456789"
```

---

## Command-Line Options

### Global Options

```
--token TOKEN       Twitter auth token (required)
--output FILE       Output JSON file path (optional)
--json              Output raw JSON without formatting
```

### Timeline Mode Options

```
--timeline-type TYPE    Timeline type: media, timeline, tweets, with_replies
--batch-size NUM        Items per request (default: 100, 0 = all)
--page NUM              Page number for pagination (default: 0)
--media-type TYPE       Media filter: all, image, video, gif
--retweets              Include retweets
--no-retweets           Exclude retweets (default)
```

### Date Range Mode Options

```
--start-date YYYY-MM-DD   Start date (required)
--end-date YYYY-MM-DD     End date (required)
--filter FILTER           Media filter (default: filter:media)
```

---

## Output Format

### Summary Mode (Default)

Human-readable output with complete information:

```
============================================================
EXTRACTION SUMMARY
============================================================

Account: @masteraoko
Name: 青青子Js
Followers: 10,000
Following: 500
Total Tweets: 5,000
Join Date: 2020-01-01 00:00:00

Media URLs Found: 150
New Entries: 150
Page: 0
Batch Size: 100
Has More: True

--- Timeline Preview (first 5 entries) ---

1. Date: 2024-01-15 10:30:00
   Type: photo
   Tweet ID: 1234567890
   Retweet: False
   URL: https://pbs.twimg.com/media/...
```

### JSON Mode (--json)

Raw JSON for automation:

```json
{
  "account_info": {
    "name": "青青子Js",
    "nick": "masteraoko",
    "date": "2020-01-01 00:00:00",
    "followers_count": 10000,
    "friends_count": 500,
    "profile_image": "https://...",
    "statuses_count": 5000
  },
  "total_urls": 150,
  "timeline": [
    {
      "url": "https://pbs.twimg.com/media/...",
      "date": "2024-01-15 10:30:00",
      "tweet_id": 1234567890,
      "type": "photo",
      "is_retweet": false
    }
  ],
  "metadata": {
    "new_entries": 150,
    "page": 0,
    "batch_size": 100,
    "has_more": true
  }
}
```

---

## Use Cases & Examples

### 1. Download All Media from a User

```bash
# Step 1: Extract metadata
metadata-extractor.exe --token TOKEN --output metadata.json timeline USERNAME

# Step 2: Extract URLs (PowerShell)
Get-Content metadata.json | ConvertFrom-Json | Select-Object -ExpandProperty timeline | Select-Object -ExpandProperty url > urls.txt

# Step 3: Download with wget
wget -i urls.txt -P downloads/
```

---

### 2. Archive by Date

```bash
# Yearly archive
metadata-extractor.exe --token TOKEN --output 2024.json daterange USERNAME --start-date 2024-01-01 --end-date 2024-12-31

# Monthly archive
metadata-extractor.exe --token TOKEN --output jan_2024.json daterange USERNAME --start-date 2024-01-01 --end-date 2024-01-31
```

---

### 3. Extract Videos Only

```bash
metadata-extractor.exe --token TOKEN --output videos.json timeline USERNAME --media-type video
```

---

### 4. Pagination for Large Datasets

```batch
@echo off
set TOKEN=YOUR_TOKEN
set USER=username

REM Extract page by page
for /L %%i in (0,1,9) do (
    echo Extracting page %%i...
    metadata-extractor.exe --token %TOKEN% --output page_%%i.json timeline %USER% --batch-size 100 --page %%i
    timeout /t 2 /nobreak >nul
)
```

---

### 5. Monitor Multiple Accounts

```batch
@echo off
set TOKEN=YOUR_TOKEN

for %%u in (user1 user2 user3) do (
    echo Processing %%u...
    metadata-extractor.exe --token %TOKEN% --output %%u.json timeline %%u
    timeout /t 5 /nobreak >nul
)
```
