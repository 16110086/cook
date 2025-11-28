import re
import json
from datetime import datetime
from typing import Optional, Dict, List, Any
from gallery_dl.extractor import twitter

# Domain Constants
TWITTER_IMAGE_DOMAIN = "pbs.twimg.com"
TWITTER_VIDEO_DOMAIN = "video.twimg.com"

# Error Codes
WITHHELD_ERROR_CODE = "withheld"

# Error Messages
ERROR_MSG_WITHHELD = "Account withheld. Alternative version available at: https://www.patreon.com/exyezed"
ERROR_MSG_AUTH_FAILED = "Authentication failed. Verify your auth token is valid."
ERROR_MSG_ACCOUNT_NOT_FOUND = "Failed to fetch account information. Check the username and auth token."


def _parse_username(username_input: str) -> str:
    # If already in id:123456 format, return as-is
    if username_input.startswith("id:"):
        return username_input

    username_input = username_input.strip()

    # Extract username from URL patterns
    # Matches: https://x.com/USERNAME/*, https://twitter.com/USERNAME/*, etc.
    url_patterns = [
        r'(?:https?://)?(?:www\.)?(?:x\.com|twitter\.com)/([^/?#]+)',
        r'(?:https?://)?(?:www\.)?(?:x\.com|twitter\.com)/@([^/?#]+)',
    ]

    for pattern in url_patterns:
        match = re.match(pattern, username_input, re.IGNORECASE)
        if match:
            username = match.group(1)
            # Remove @ if present
            username = username.lstrip('@')
            return username.lower()

    # If no URL pattern matched, treat as plain username
    # Remove @ if present
    username = username_input.lstrip('@')
    return username.lower()


def _format_datetime(dt: Any) -> str:
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    return dt


def _build_timeline_entry(media_url: str, tweet_data: Dict[str, Any]) -> Dict[str, Any]:
    tweet_date = tweet_data.get('date', datetime.now())

    entry = {
        'url': media_url,
        'date': _format_datetime(tweet_date),
        'tweet_id': tweet_data.get('tweet_id', 0),
    }

    if 'type' in tweet_data:
        entry['type'] = tweet_data['type']

    if 'retweet_id' in tweet_data and tweet_data['retweet_id']:
        entry['retweet_id'] = tweet_data['retweet_id']
        entry['is_retweet'] = True
    else:
        entry['is_retweet'] = False

    return entry


def _is_twitter_media(media_url: str) -> bool:
    return TWITTER_IMAGE_DOMAIN in media_url or TWITTER_VIDEO_DOMAIN in media_url


def _should_include_media(media_url: str, tweet_data: Dict[str, Any], media_type: str) -> bool:
    if media_type == 'all':
        return True

    tweet_type = tweet_data.get('type')

    if media_type == 'image':
        return TWITTER_IMAGE_DOMAIN in media_url and tweet_type == 'photo'
    elif media_type == 'video':
        return TWITTER_VIDEO_DOMAIN in media_url and tweet_type == 'video'
    elif media_type == 'gif':
        return TWITTER_VIDEO_DOMAIN in media_url and tweet_type == 'animated_gif'

    return False


def _is_withheld_error(error: Exception) -> bool:
    error_msg = str(error).lower()
    is_withheld_value_error = isinstance(error, ValueError) and str(error) == WITHHELD_ERROR_CODE
    has_withheld_in_message = WITHHELD_ERROR_CODE in error_msg
    has_withheld_in_response = hasattr(error, "response") and WITHHELD_ERROR_CODE in str(error.response.text).lower()

    return is_withheld_value_error or has_withheld_in_message or has_withheld_in_response


def _build_account_info(user_data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'name': user_data.get('name', ''),
        'nick': user_data.get('nick', ''),
        'date': _format_datetime(user_data.get('date', '')),
        'followers_count': user_data.get('followers_count', 0),
        'friends_count': user_data.get('friends_count', 0),
        'profile_image': user_data.get('profile_image', ''),
        'statuses_count': user_data.get('statuses_count', 0)
    }


def get_metadata_by_date(
    username: str,
    auth_token: str,
    date_start: str,
    date_end: str,
    media_filter: str = "filter:media",
    output_file: Optional[str] = None
) -> Dict[str, Any]:
    # Parse username from various input formats
    username = _parse_username(username)

    query = f"from:{username} since:{date_start} until:{date_end}"
    if media_filter:
        query += f" {media_filter}"

    url = f"https://x.com/search?q={query}"

    extractor_class = twitter.TwitterSearchExtractor
    match = re.match(extractor_class.pattern, url)

    if not match:
        raise ValueError(f"Invalid search URL: {url}")

    extractor = extractor_class(match)

    config_dict = {
        "cookies": {
            "auth_token": auth_token
        },
        "retweets": False
    }

    extractor.config = lambda key, default=None: config_dict.get(key, default)

    try:
        extractor.initialize()

        api = twitter.TwitterAPI(extractor)

        try:
            user = api.user_by_screen_name(username)

            if "legacy" in user and user["legacy"].get("withheld_scope"):
                raise ValueError(WITHHELD_ERROR_CODE)

        except Exception as e:
            if _is_withheld_error(e):
                raise ValueError(WITHHELD_ERROR_CODE)
            raise

        user_data = extractor._transform_user(user)

        structured_output = {
            'account_info': _build_account_info(user_data),
            'total_urls': 0,
            'timeline': [],
            'search_query': query,
            'date_filter': {
                'start': date_start,
                'end': date_end,
                'method': 'search_api'
            }
        }

        new_timeline_entries = []

        try:
            iterator = iter(extractor)

            while True:
                try:
                    item = next(iterator)

                    if isinstance(item, tuple) and len(item) >= 3:
                        media_url = item[1]
                        tweet_data = item[2]

                        if _is_twitter_media(media_url):
                            timeline_entry = _build_timeline_entry(media_url, tweet_data)
                            new_timeline_entries.append(timeline_entry)
                            structured_output['total_urls'] += 1

                except StopIteration:
                    break

        except Exception as e:
            print(f"Warning: Error while fetching timeline items: {e}")

        structured_output['timeline'] = new_timeline_entries

        structured_output['metadata'] = {
            "new_entries": len(new_timeline_entries),
            "method": "search_api",
            "date_range": f"{date_start} to {date_end}"
        }

        if output_file:
            try:
                with open(output_file, 'w', encoding='utf-8') as f:
                    json.dump(structured_output, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"Warning: Failed to write output file '{output_file}': {e}")

        return structured_output

    except Exception as e:
        if _is_withheld_error(e):
            return {"error": ERROR_MSG_WITHHELD}

        error_str = str(e)
        if error_str == "None":
            return {"error": ERROR_MSG_AUTH_FAILED}

        return {"error": error_str}


def get_metadata(
    username: str,
    auth_token: str,
    timeline_type: str = "timeline",
    batch_size: int = 0,
    page: int = 0,
    media_type: str = "all",
    retweets: bool = False
) -> Dict[str, Any]:
    # Parse username from various input formats
    username = _parse_username(username)

    url = f"https://x.com/{username}/{timeline_type}"

    if timeline_type == "media":
        extractor_class = twitter.TwitterMediaExtractor
    elif timeline_type == "tweets":
        extractor_class = twitter.TwitterTweetsExtractor
    elif timeline_type == "with_replies":
        extractor_class = twitter.TwitterRepliesExtractor
    else:
        extractor_class = twitter.TwitterTimelineExtractor

    match = re.match(extractor_class.pattern, url)
    if not match:
        raise ValueError(f"Invalid URL for {timeline_type}: {url}")

    extractor = extractor_class(match)

    config_dict = {
        "cookies": {
            "auth_token": auth_token
        },
        "retweets": retweets
    }

    if batch_size > 0:
        config_dict["count"] = batch_size

    extractor.config = lambda key, default=None: config_dict.get(key, default)

    try:
        extractor.initialize()

        api = twitter.TwitterAPI(extractor)
        try:
            if username.startswith("id:"):
                user = api.user_by_rest_id(username[3:])
            else:
                user = api.user_by_screen_name(username)

            if "legacy" in user and user["legacy"].get("withheld_scope"):
                raise ValueError(WITHHELD_ERROR_CODE)

        except Exception as e:
            if _is_withheld_error(e):
                raise ValueError(WITHHELD_ERROR_CODE)
            raise

        structured_output = {
            'account_info': {},
            'total_urls': 0,
            'timeline': []
        }

        iterator = iter(extractor)

        if batch_size > 0 and page > 0:
            items_to_skip = page * batch_size

            if hasattr(extractor, '_cursor') and extractor._cursor:
                pass
            else:
                skipped = 0
                try:
                    for _ in range(items_to_skip):
                        next(iterator)
                        skipped += 1
                except StopIteration:
                    pass

        new_timeline_entries = []

        items_to_fetch = batch_size if batch_size > 0 else float('inf')
        items_fetched = 0

        try:
            while items_fetched < items_to_fetch:
                item = next(iterator)
                items_fetched += 1

                if isinstance(item, tuple) and len(item) >= 3:
                    media_url = item[1]
                    tweet_data = item[2]

                    if not structured_output['account_info'] and 'user' in tweet_data:
                        user = tweet_data['user']
                        structured_output['account_info'] = _build_account_info(user)

                    if _is_twitter_media(media_url):
                        timeline_entry = _build_timeline_entry(media_url, tweet_data)

                        if _should_include_media(media_url, tweet_data, media_type):
                            new_timeline_entries.append(timeline_entry)
                            structured_output['total_urls'] += 1
        except StopIteration:
            pass

        structured_output['timeline'].extend(new_timeline_entries)

        cursor_info = None
        if hasattr(extractor, '_cursor') and extractor._cursor:
            cursor_info = extractor._cursor

        structured_output['metadata'] = {
            "new_entries": len(new_timeline_entries),
            "page": page,
            "batch_size": batch_size,
            "has_more": batch_size > 0 and items_fetched == batch_size,
            "cursor": cursor_info
        }

        if not structured_output['account_info']:
            raise ValueError(ERROR_MSG_ACCOUNT_NOT_FOUND)

        return structured_output

    except Exception as e:
        if _is_withheld_error(e):
            return {"error": ERROR_MSG_WITHHELD}

        error_str = str(e)
        if error_str == "None":
            return {"error": ERROR_MSG_AUTH_FAILED}

        return {"error": error_str}


def main():
    # Username supports multiple formats (all are valid):
    # - Plain username: "masteraoko" or "MasterAoko"
    # - With @: "@MasterAoko"
    # - Full URL: "https://x.com/MasterAoko"
    # - URL with path: "https://x.com/MasterAoko/media"
    # - Status URL: "https://x.com/MasterAoko/status/123456789"
    # - Twitter domain: "https://twitter.com/MasterAoko"
    # - User ID format: "id:123456789" (for suspended/private accounts)
    username = "xbatchdemo"
    auth_token = "88701c68bcb7af43c937222bb6a295c73924d63e"

    # ============================================
    # TIMELINE MODE Configuration
    # ============================================
    timeline_type = "timeline"  # Options: "media", "timeline", "tweets", "with_replies"
    batch_size = 100         # Number of items per request (0 = fetch all)
    page = 0                 # Page number for pagination (0-based)
    media_type = "all"       # Options: "all", "image", "video", "gif"
    retweets = False         # Set to True to include retweets

    # ============================================
    # DATE RANGE MODE Configuration
    # ============================================
    use_date_range = False           # Set to True to use date range search instead
    date_start = "2024-01-01"        # Start date (YYYY-MM-DD)
    date_end = "2024-12-31"          # End date (YYYY-MM-DD)
    media_filter = "filter:timeline"    # Additional filter (can be empty string)
    output_file = None               # Optional: "output.json" to save results to file

    try:
        if use_date_range:
            # Use date range search
            data = get_metadata_by_date(
                username=username,
                auth_token=auth_token,
                date_start=date_start,
                date_end=date_end,
                media_filter=media_filter,
                output_file=output_file
            )
        else:
            # Use timeline extraction
            data = get_metadata(
                username=username,
                auth_token=auth_token,
                timeline_type=timeline_type,
                batch_size=batch_size,
                page=page,
                media_type=media_type,
                retweets=retweets
            )

        print(json.dumps(data, ensure_ascii=False, indent=2))
    except Exception as e:
        error_str = str(e)
        if error_str == "None":
            print(json.dumps({"error": ERROR_MSG_AUTH_FAILED}, ensure_ascii=False))
        else:
            print(json.dumps({"error": error_str}, ensure_ascii=False))

if __name__ == '__main__':
    main()
