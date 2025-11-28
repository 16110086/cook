import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Image,
  Video,
  Film,
  ExternalLink,
  Repeat2,
  Download,
  FolderOpen,
  LayoutGrid,
  Grid3X3,
  List,
  StopCircle,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { TimelineEntry, AccountInfo } from "@/types/api";
import { logger } from "@/lib/logger";
import { toastWithSound as toast } from "@/lib/toast-with-sound";
import { getSettings } from "@/lib/settings";
import { DownloadMediaWithMetadata, OpenFolder, IsFFmpegInstalled, ConvertGIFs, StopDownload } from "../../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime";
import { main } from "../../wailsjs/go/models";

interface DownloadProgress {
  current: number;
  total: number;
  percent: number;
}

interface MediaListProps {
  accountInfo: AccountInfo;
  timeline: TimelineEntry[];
  totalUrls: number;
}

function getThumbnailUrl(url: string): string {
  if (url.includes("pbs.twimg.com/media/")) {
    if (url.includes("?format=")) {
      if (url.includes("&name=")) {
        const parts = url.split("&name=");
        return parts[0] + "&name=thumb";
      }
      return url + "&name=thumb";
    }
    if (url.includes("?")) {
      return url + "&name=thumb";
    }
    return url + "?format=jpg&name=thumb";
  }
  return url;
}

function getMediaIcon(type: string) {
  switch (type) {
    case "photo":
      return <Image className="h-4 w-4" />;
    case "video":
      return <Video className="h-4 w-4" />;
    case "gif":
    case "animated_gif":
      return <Film className="h-4 w-4" />;
    default:
      return <Image className="h-4 w-4" />;
  }
}

function getRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays > 0) {
      const remainingHours = diffHours % 24;
      return `(${diffDays}d ${remainingHours}h ago)`;
    } else if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60;
      return `(${diffHours}h ${remainingMinutes}m ago)`;
    } else if (diffMinutes > 0) {
      return `(${diffMinutes}m ago)`;
    } else {
      return "(just now)";
    }
  } catch {
    return "";
  }
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export function MediaList({
  accountInfo,
  timeline,
  totalUrls,
}: MediaListProps) {
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [viewMode, setViewMode] = useState<"large" | "small" | "list">("list");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [hasGifs, setHasGifs] = useState(false);
  const [ffmpegInstalled, setFfmpegInstalled] = useState(false);

  // Listen for download progress events
  useEffect(() => {
    const unsubscribe = EventsOn("download-progress", (progress: DownloadProgress) => {
      setDownloadProgress(progress);
    });
    return () => {
      EventsOff("download-progress");
      unsubscribe();
    };
  }, []);

  // Filter and sort timeline
  const filteredTimeline = useMemo(() => {
    const filtered = [...timeline];

    if (sortBy === "date-asc") {
      filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } else {
      filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return filtered;
  }, [timeline, sortBy]);

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredTimeline.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredTimeline.map((_, i) => i)));
    }
  };

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  const handleDownload = async () => {
    const settings = getSettings();
    const items = selectedItems.size > 0
      ? Array.from(selectedItems).map((i) => filteredTimeline[i])
      : filteredTimeline;

    if (items.length === 0) {
      toast.error("No media to download");
      return;
    }

    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: items.length, percent: 0 });
    logger.info(`Starting download of ${items.length} files...`);

    try {
      const request = new main.DownloadMediaWithMetadataRequest({
        items: items.map((item) => new main.MediaItemRequest({
          url: item.url,
          date: item.date,
          tweet_id: item.tweet_id,
          type: item.type,
        })),
        output_dir: settings.downloadPath,
        username: accountInfo.name,
      });
      const response = await DownloadMediaWithMetadata(request);

      if (response.success) {
        logger.success(`Downloaded ${response.downloaded} files`);
        toast.success(`Downloaded ${response.downloaded} files`);
        setHasDownloaded(true);
        
        // Check if there are GIFs and FFmpeg is installed
        const hasGifItems = items.some((item) => item.type === "gif" || item.type === "animated_gif");
        if (hasGifItems) {
          setHasGifs(true);
          const installed = await IsFFmpegInstalled();
          setFfmpegInstalled(installed);
        }
      } else {
        logger.error(response.message);
        toast.error(response.message);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Download failed: ${errorMsg}`);
      toast.error(`Download failed: ${errorMsg}`);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  const handleStopDownload = async () => {
    try {
      const stopped = await StopDownload();
      if (stopped) {
        logger.info("Download stopped by user");
        toast.info("Download stopped");
      }
    } catch (error) {
      console.error("Failed to stop download:", error);
    }
  };

  const handleOpenFolder = async () => {
    const settings = getSettings();
    const folderPath = settings.downloadPath 
      ? `${settings.downloadPath}\\${accountInfo.name}`
      : accountInfo.name;
    
    try {
      await OpenFolder(folderPath);
    } catch {
      try {
        await OpenFolder(settings.downloadPath);
      } catch {
        toast.error("Could not open folder");
      }
    }
  };

  const handleOpenTweet = (tweetId: string) => {
    window.open(`https://x.com/${accountInfo.name}/status/${tweetId}`, "_blank");
  };

  const handleConvertGifs = async () => {
    const settings = getSettings();
    const folderPath = `${settings.downloadPath}\\${accountInfo.name}`;

    setIsConverting(true);
    logger.info("Converting GIFs...");

    try {
      const response = await ConvertGIFs({
        folder_path: folderPath,
        fps: 15,
        width: 0, // Keep original size
        delete_original: false, // Keep MP4 original
      });

      if (response.success) {
        logger.success(`Converted ${response.converted} GIFs`);
        toast.success(`Converted ${response.converted} GIFs`);
        setHasGifs(false);
      } else {
        logger.error(response.message);
        toast.error(response.message);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Convert failed: ${errorMsg}`);
      toast.error(`Convert failed: ${errorMsg}`);
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Account Info Card */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <img
          src={accountInfo.profile_image}
          alt={accountInfo.nick}
          className="w-16 h-16 rounded-full"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl">{accountInfo.nick}</h2>
            <span className="text-muted-foreground">@{accountInfo.name}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span>{formatNumber(accountInfo.followers_count)} followers</span>
            <span>{formatNumber(accountInfo.friends_count)} following</span>
            <span>{formatNumber(accountInfo.statuses_count)} tweets</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-primary">{totalUrls}</div>
          <div className="text-sm text-muted-foreground">media found</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-auto">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest</SelectItem>
            <SelectItem value="date-asc">Oldest</SelectItem>
          </SelectContent>
        </Select>

        {/* View Mode Toggle */}
        <div className="flex items-center border rounded-md">
          <Button
            variant={viewMode === "large" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-r-none"
            onClick={() => setViewMode("large")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "small" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-none border-x"
            onClick={() => setViewMode("small")}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-l-none"
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1" />
        {hasDownloaded && (
          <Button variant="outline" onClick={handleOpenFolder}>
            <FolderOpen className="h-4 w-4" />
            Open Folder
          </Button>
        )}
        {hasGifs && ffmpegInstalled && (
          <Button variant="outline" onClick={handleConvertGifs} disabled={isConverting}>
            {isConverting ? (
              <>
                <Spinner />
                Converting...
              </>
            ) : (
              <>
                <Film className="h-4 w-4" />
                Convert GIFs
              </>
            )}
          </Button>
        )}
        <div className="flex items-center gap-2">
          {isDownloading && (
            <Button variant="destructive" onClick={handleStopDownload}>
              <StopCircle className="h-4 w-4" />
              Stop
            </Button>
          )}
          <Button onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? (
            <>
              <Spinner />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Download {selectedItems.size > 0 ? `${selectedItems.size}` : "All"}
            </>
          )}
          </Button>
        </div>
      </div>

      {/* Download Progress Bar */}
      {isDownloading && downloadProgress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Downloading {downloadProgress.current} of {downloadProgress.total}
            </span>
            <span className="font-medium">{downloadProgress.percent}%</span>
          </div>
          <Progress value={downloadProgress.percent} className="h-2" />
        </div>
      )}

      {/* Select All */}
      <div className="flex items-center gap-2">
        <Checkbox
          checked={selectedItems.size === filteredTimeline.length && filteredTimeline.length > 0}
          onCheckedChange={toggleSelectAll}
        />
        <span className="text-sm text-muted-foreground">
          Select all ({filteredTimeline.length} items)
        </span>
        {selectedItems.size > 0 && (
          <Badge variant="secondary">{selectedItems.size} selected</Badge>
        )}
      </div>

      {/* Media Grid/List */}
      {viewMode === "list" ? (
        <div className="space-y-2">
          {filteredTimeline.map((item, index) => {
            const isSelected = selectedItems.has(index);
            return (
              <div
                key={`${item.tweet_id}-${index}`}
                className={`flex items-center gap-4 p-3 rounded-lg border-2 transition-all ${
                  isSelected ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleItem(index)}
                />
                <div className="w-16 h-16 rounded overflow-hidden bg-muted shrink-0">
                  {item.type === "photo" ? (
                    <img
                      src={getThumbnailUrl(item.url)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {getMediaIcon(item.type)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.tweet_id}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.date} {getRelativeTime(item.date)}
                  </p>
                  {item.is_retweet && (
                    <Badge variant="outline" className="text-xs mt-1 w-fit">
                      <Repeat2 className="h-3 w-3 mr-1" />
                      Retweet
                    </Badge>
                  )}
                </div>
                <div className="flex items-center shrink-0">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs ${
                      item.type === "photo" 
                        ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" 
                        : item.type === "video" 
                        ? "bg-purple-500/20 text-purple-700 dark:text-purple-300"
                        : "bg-green-500/20 text-green-700 dark:text-green-300"
                    }`}
                  >
                    {item.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="icon"
                    variant="default"
                    onClick={async () => {
                      const settings = getSettings();
                      setIsDownloading(true);
                      try {
                        const request = new main.DownloadMediaWithMetadataRequest({
                          items: [new main.MediaItemRequest({
                            url: item.url,
                            date: item.date,
                            tweet_id: item.tweet_id,
                            type: item.type,
                          })],
                          output_dir: settings.downloadPath,
                          username: accountInfo.name,
                        });
                        const response = await DownloadMediaWithMetadata(request);
                        if (response.success) {
                          toast.success("Downloaded 1 file");
                          setHasDownloaded(true);
                        } else {
                          toast.error(response.message);
                        }
                      } catch (error) {
                        const errorMsg = error instanceof Error ? error.message : String(error);
                        toast.error(`Download failed: ${errorMsg}`);
                      } finally {
                        setIsDownloading(false);
                      }
                    }}
                    disabled={isDownloading}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handleOpenTweet(item.tweet_id)}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`grid gap-3 ${viewMode === "large" ? "grid-cols-4" : "grid-cols-6"}`}>
          {filteredTimeline.map((item, index) => {
            const isSelected = selectedItems.has(index);

            return (
              <div
                key={`${item.tweet_id}-${index}`}
                className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                }`}
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-muted relative">
                  {item.type === "photo" ? (
                    <img
                      src={getThumbnailUrl(item.url)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      {getMediaIcon(item.type)}
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="default"
                      className="h-8 w-8"
                      onClick={async () => {
                        const settings = getSettings();
                        setIsDownloading(true);
                        try {
                          const request = new main.DownloadMediaWithMetadataRequest({
                            items: [new main.MediaItemRequest({
                              url: item.url,
                              date: item.date,
                              tweet_id: item.tweet_id,
                              type: item.type,
                            })],
                            output_dir: settings.downloadPath,
                            username: accountInfo.name,
                          });
                          const response = await DownloadMediaWithMetadata(request);
                          if (response.success) {
                            toast.success("Downloaded 1 file");
                            setHasDownloaded(true);
                          } else {
                            toast.error(response.message);
                          }
                        } catch (error) {
                          const errorMsg = error instanceof Error ? error.message : String(error);
                          toast.error(`Download failed: ${errorMsg}`);
                        } finally {
                          setIsDownloading(false);
                        }
                      }}
                      disabled={isDownloading}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => handleOpenTweet(item.tweet_id)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Checkbox */}
                  <div className="absolute top-2 left-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleItem(index)}
                      className="bg-background/80"
                    />
                  </div>

                  {/* Type Badge */}
                  <div className="absolute top-2 right-2">
                    <Badge 
                      variant="secondary" 
                      className={`text-xs px-1.5 py-0.5 ${
                        item.type === "photo" 
                          ? "bg-blue-500/20 text-blue-700 dark:text-blue-300" 
                          : item.type === "video" 
                          ? "bg-purple-500/20 text-purple-700 dark:text-purple-300"
                          : "bg-green-500/20 text-green-700 dark:text-green-300"
                      }`}
                    >
                      {getMediaIcon(item.type)}
                    </Badge>
                  </div>

                  {/* Retweet indicator */}
                  {item.is_retweet && (
                    <div className="absolute bottom-2 right-2">
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-background/80">
                        <Repeat2 className="h-3 w-3" />
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2 text-xs text-muted-foreground">
                  <div className="truncate">{item.date}</div>
                  <div className="text-[10px] mt-0.5">{getRelativeTime(item.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
