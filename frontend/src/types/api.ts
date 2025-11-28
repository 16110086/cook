// Twitter/X Media Batch Downloader Types

export interface AccountInfo {
  name: string;      // This is actually the username/handle from metadata-extractor
  nick: string;      // This is actually the display name from metadata-extractor
  date: string;
  followers_count: number;
  friends_count: number;
  profile_image: string;
  statuses_count: number;
}

export interface TimelineEntry {
  url: string;
  date: string;
  tweet_id: string;
  type: string; // photo, video, gif
  is_retweet: boolean;
}

export interface ExtractMetadata {
  new_entries: number;
  page: number;
  batch_size: number;
  has_more: boolean;
}

export interface TwitterResponse {
  account_info: AccountInfo;
  total_urls: number;
  timeline: TimelineEntry[];
  metadata: ExtractMetadata;
}

export interface TimelineRequest {
  username: string;
  auth_token: string;
  timeline_type: string; // media, timeline, tweets, with_replies
  batch_size: number;
  page: number;
  media_type: string; // all, image, video, gif
  retweets: boolean;
}

export interface DateRangeRequest {
  username: string;
  auth_token: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  media_filter: string;
}

// Settings types
export interface Settings {
  downloadPath: string;
  authToken: string;
  timelineType: "media" | "timeline" | "tweets" | "with_replies";
  batchSize: number;
  theme: string;
  themeMode: "auto" | "light" | "dark";
}
