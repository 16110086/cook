#!/usr/bin/env python3
"""
Twitter/X Media Metadata Extractor CLI
A command-line interface for extracting media metadata from Twitter/X accounts.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional
from metadata import get_metadata, get_metadata_by_date


def print_success(message: str):
    print(f"Success: {message}")


def print_error(message: str):
    print(f"Error: {message}", file=sys.stderr)


def print_info(message: str):
    print(f"Info: {message}")


def print_result_summary(data: dict):
    if "error" in data:
        print_error(data["error"])
        return False

    print("\n" + "="*60)
    print("EXTRACTION SUMMARY")
    print("="*60)

    # Account Info
    if "account_info" in data and data["account_info"]:
        account = data["account_info"]
        print(f"\nAccount: @{account.get('nick', 'N/A')}")
        print(f"Name: {account.get('name', 'N/A')}")
        print(f"Followers: {account.get('followers_count', 0):,}")
        print(f"Following: {account.get('friends_count', 0):,}")
        print(f"Total Tweets: {account.get('statuses_count', 0):,}")
        print(f"Join Date: {account.get('date', 'N/A')}")

    # Extraction Stats
    print(f"\nMedia URLs Found: {data.get('total_urls', 0):,}")

    if "metadata" in data:
        meta = data["metadata"]
        print(f"New Entries: {meta.get('new_entries', 0):,}")

        if "method" in meta:
            print(f"Method: {meta['method']}")

        if "date_range" in meta:
            print(f"Date Range: {meta['date_range']}")

        if "page" in meta:
            print(f"Page: {meta['page']}")
            print(f"Batch Size: {meta.get('batch_size', 'N/A')}")
            print(f"Has More: {meta.get('has_more', False)}")

    # Timeline Preview
    if "timeline" in data and data["timeline"]:
        print(f"\n--- Timeline Preview (first 5 entries) ---")
        for i, entry in enumerate(data["timeline"][:5], 1):
            print(f"\n{i}. Date: {entry.get('date', 'N/A')}")
            print(f"   Type: {entry.get('type', 'N/A')}")
            print(f"   Tweet ID: {entry.get('tweet_id', 'N/A')}")
            print(f"   Retweet: {entry.get('is_retweet', False)}")
            print(f"   URL: {entry.get('url', 'N/A')[:80]}...")

    print("\n" + "="*60)
    return True


def timeline_mode(args):
    print_info(f"Extracting from @{args.username} ({args.timeline_type} timeline)...")

    data = get_metadata(
        username=args.username,
        auth_token=args.auth_token,
        timeline_type=args.timeline_type,
        batch_size=args.batch_size,
        page=args.page,
        media_type=args.media_type,
        retweets=args.retweets
    )

    # Save to file if specified
    if args.output:
        try:
            output_path = Path(args.output)
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print_success(f"Results saved to: {output_path}")
        except Exception as e:
            print_error(f"Failed to save output file: {e}")

    # Display results
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print_result_summary(data)

    return 0 if "error" not in data else 1


def date_range_mode(args):
    print_info(f"Searching @{args.username} from {args.start_date} to {args.end_date}...")

    data = get_metadata_by_date(
        username=args.username,
        auth_token=args.auth_token,
        date_start=args.start_date,
        date_end=args.end_date,
        media_filter=args.media_filter,
        output_file=args.output
    )

    # Display results
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        if args.output:
            print_success(f"Results saved to: {args.output}")
        print_result_summary(data)

    return 0 if "error" not in data else 1


def main():
    parser = argparse.ArgumentParser(
        description="Twitter/X Media Metadata Extractor - Extract media URLs and metadata from Twitter/X accounts",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract media timeline
  %(prog)s timeline masteraoko -t YOUR_TOKEN

  # Extract with pagination
  %(prog)s timeline masteraoko -t YOUR_TOKEN -b 100 -p 0

  # Extract only images, exclude retweets
  %(prog)s timeline masteraoko -t YOUR_TOKEN -m image --no-retweets

  # Extract by date range
  %(prog)s daterange masteraoko -t YOUR_TOKEN -s 2024-01-01 -e 2024-12-31

  # Save to file
  %(prog)s timeline masteraoko -t YOUR_TOKEN -o output.json

  # Get raw JSON output
  %(prog)s timeline masteraoko -t YOUR_TOKEN --json

Username formats supported:
  - Plain: masteraoko
  - With @: @masteraoko
  - URL: https://x.com/masteraoko
  - User ID: id:123456789
        """
    )

    # Global arguments
    parser.add_argument('-t', '--auth-token',
                       required=True,
                       help='Twitter/X authentication token (required)')
    parser.add_argument('-o', '--output',
                       help='Output JSON file path (optional)')
    parser.add_argument('--json',
                       action='store_true',
                       help='Output raw JSON instead of formatted summary')

    # Subcommands
    subparsers = parser.add_subparsers(dest='mode', help='Extraction mode')

    # Timeline mode
    timeline_parser = subparsers.add_parser('timeline',
                                            help='Extract from user timeline')
    timeline_parser.add_argument('username',
                                help='Twitter username (supports multiple formats)')
    timeline_parser.add_argument('--timeline-type',
                                default='media',
                                choices=['media', 'timeline', 'tweets', 'with_replies'],
                                help='Timeline type to extract (default: media)')
    timeline_parser.add_argument('-b', '--batch-size',
                                type=int,
                                default=100,
                                help='Number of items per request (0 = fetch all, default: 100)')
    timeline_parser.add_argument('-p', '--page',
                                type=int,
                                default=0,
                                help='Page number for pagination (0-based, default: 0)')
    timeline_parser.add_argument('-m', '--media-type',
                                default='all',
                                choices=['all', 'image', 'video', 'gif'],
                                help='Media type filter (default: all)')
    timeline_parser.add_argument('--retweets',
                                action='store_true',
                                help='Include retweets (default: exclude)')
    timeline_parser.add_argument('--no-retweets',
                                action='store_false',
                                dest='retweets',
                                help='Exclude retweets (default)')

    # Date range mode
    daterange_parser = subparsers.add_parser('daterange',
                                            help='Extract by date range')
    daterange_parser.add_argument('username',
                                 help='Twitter username (supports multiple formats)')
    daterange_parser.add_argument('-s', '--start-date',
                                 required=True,
                                 help='Start date (YYYY-MM-DD)')
    daterange_parser.add_argument('-e', '--end-date',
                                 required=True,
                                 help='End date (YYYY-MM-DD)')
    daterange_parser.add_argument('-f', '--media-filter',
                                 default='filter:media',
                                 help='Media filter (default: filter:media)')

    args = parser.parse_args()

    # Check if mode was specified
    if not args.mode:
        parser.print_help()
        return 1

    # Execute based on mode
    try:
        if args.mode == 'timeline':
            return timeline_mode(args)
        elif args.mode == 'daterange':
            return date_range_mode(args)
    except KeyboardInterrupt:
        print_error("Operation cancelled by user")
        return 130
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
