import { useState, useEffect, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getSettings, applyThemeMode } from "@/lib/settings";
import { applyTheme } from "@/lib/themes";
import { toastWithSound as toast } from "@/lib/toast-with-sound";
import { logger } from "@/lib/logger";

// Components
import { TitleBar } from "@/components/TitleBar";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { MediaList } from "@/components/MediaList";
import { DatabaseView } from "@/components/DatabaseView";
import type { HistoryItem } from "@/components/FetchHistory";
import type { TwitterResponse } from "@/types/api";

// Wails bindings
import { ExtractTimeline, ExtractDateRange, SaveAccountToDB } from "../wailsjs/go/main/App";

const HISTORY_KEY = "twitter_media_fetch_history";
const MAX_HISTORY = 10;
const CURRENT_VERSION = "4.0";

function App() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TwitterResponse | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [fetchHistory, setFetchHistory] = useState<HistoryItem[]>([]);
  const [showDatabase, setShowDatabase] = useState(false);
  const stopFetchRef = useRef(false);

  useEffect(() => {
    const settings = getSettings();
    applyThemeMode(settings.themeMode);
    applyTheme(settings.theme);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentSettings = getSettings();
      if (currentSettings.themeMode === "auto") {
        applyThemeMode("auto");
        applyTheme(currentSettings.theme);
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    checkForUpdates();
    loadHistory();

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      const response = await fetch(
        "https://api.github.com/repos/afkarxyz/Twitter-X-Media-Batch-Downloader/releases/latest"
      );
      const data = await response.json();
      const latestVersion = data.tag_name?.replace(/^v/, "") || "";

      if (latestVersion && latestVersion > CURRENT_VERSION) {
        setHasUpdate(true);
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
    }
  };

  const loadHistory = () => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        setFetchHistory(JSON.parse(saved));
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  const saveHistory = (history: HistoryItem[]) => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  };

  const addToHistory = (data: TwitterResponse, inputUsername: string) => {
    // Clean username (remove @ and extract from URL if needed)
    let cleanUsername = inputUsername.trim();
    if (cleanUsername.startsWith("@")) {
      cleanUsername = cleanUsername.slice(1);
    }
    if (cleanUsername.includes("x.com/") || cleanUsername.includes("twitter.com/")) {
      const match = cleanUsername.match(/(?:x\.com|twitter\.com)\/([^/?]+)/);
      if (match) cleanUsername = match[1];
    }

    setFetchHistory((prev) => {
      // Use username from API response (account_info.name) for consistency
      const apiUsername = data.account_info.name;
      const filtered = prev.filter((h) => h.username.toLowerCase() !== apiUsername.toLowerCase());
      const newItem: HistoryItem = {
        id: crypto.randomUUID(),
        username: apiUsername,           // username/handle from API
        name: data.account_info.nick,    // display name from API
        image: data.account_info.profile_image,
        mediaCount: data.total_urls,
        timestamp: Date.now(),
      };
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY);
      saveHistory(updated);
      return updated;
    });
  };

  const removeFromHistory = (id: string) => {
    setFetchHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      saveHistory(updated);
      return updated;
    });
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setUsername(item.username);
  };

  const handleStopFetch = () => {
    stopFetchRef.current = true;
    logger.info("Stopping after current batch completes...");
    toast.info("Stopping...");
  };

  const handleFetch = async (
    useDateRange: boolean,
    startDate?: string,
    endDate?: string,
    mediaType?: string,
    retweets?: boolean
  ) => {
    const settings = getSettings();

    if (!username.trim()) {
      toast.error("Please enter a username");
      return;
    }

    if (!settings.authToken?.trim()) {
      toast.error("Please set your auth token in Settings");
      return;
    }

    setLoading(true);
    setResult(null);
    stopFetchRef.current = false;
    logger.info(`Fetching media for @${username}...`);

    try {
      let finalData: TwitterResponse | null = null;

      if (useDateRange && startDate && endDate) {
        // Date range mode - single fetch
        logger.info(`Using date range: ${startDate} to ${endDate}`);
        const response = await ExtractDateRange({
          username: username.trim(),
          auth_token: settings.authToken.trim(),
          start_date: startDate,
          end_date: endDate,
          media_filter: "",
        });
        finalData = JSON.parse(response);
      } else {
        // Timeline mode
        const configBatchSize = settings.batchSize ?? 0;
        
        if (configBatchSize === 0) {
          // Fetch all at once (no batching)
          logger.info("Fetching all media...");
          const response = await ExtractTimeline({
            username: username.trim(),
            auth_token: settings.authToken.trim(),
            timeline_type: settings.timelineType || "media",
            batch_size: 0,
            page: 0,
            media_type: mediaType || "all",
            retweets: retweets || false,
          });
          finalData = JSON.parse(response);
        } else {
          // Fetch with batching
          const batchSize = Math.min(configBatchSize, 200); // Max 200 per batch
          let page = 0;
          let hasMore = true;
          let allTimeline: TwitterResponse["timeline"] = [];
          let accountInfo: TwitterResponse["account_info"] | null = null;

          while (hasMore) {
            logger.info(`Fetching page ${page + 1}...`);
            
            const response = await ExtractTimeline({
              username: username.trim(),
              auth_token: settings.authToken.trim(),
              timeline_type: settings.timelineType || "media",
              batch_size: batchSize,
              page: page,
              media_type: mediaType || "all",
              retweets: retweets || false,
            });

            // Always process the response first (complete current batch)
            const data: TwitterResponse = JSON.parse(response);
            
            if (!accountInfo) {
              accountInfo = data.account_info;
            }
            
            allTimeline = [...allTimeline, ...data.timeline];
            hasMore = data.metadata.has_more;
            page++;

            // Update result progressively
            setResult({
              account_info: accountInfo,
              timeline: allTimeline,
              total_urls: allTimeline.length,
              metadata: {
                ...data.metadata,
                has_more: hasMore,
              },
            });

            // Check if stopped AFTER processing current batch
            if (stopFetchRef.current) {
              logger.info(`Fetch stopped by user after ${allTimeline.length} items`);
              toast.info(`Stopped at ${allTimeline.length} items`);
              break;
            }

            // Small delay between batches to avoid rate limiting
            if (hasMore) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }

          finalData = {
            account_info: accountInfo!,
            timeline: allTimeline,
            total_urls: allTimeline.length,
            metadata: {
              new_entries: allTimeline.length,
              page: page - 1,
              batch_size: batchSize,
              has_more: false,
            },
          };
        }
      }

      if (finalData) {
        setResult(finalData);
        addToHistory(finalData, username);
        
        // Save to database
        try {
          await SaveAccountToDB(
            finalData.account_info.name,
            finalData.account_info.nick,
            finalData.account_info.profile_image,
            finalData.total_urls,
            JSON.stringify(finalData)
          );
        } catch (err) {
          console.error("Failed to save to database:", err);
        }
        
        logger.success(`Found ${finalData.total_urls} media items`);
        toast.success(`${finalData.total_urls} media items found`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to fetch: ${errorMsg}`);
      toast.error("Failed to fetch media");
    } finally {
      setLoading(false);
    }
  };



  const handleLoadFromDB = (responseJSON: string, loadedUsername: string) => {
    try {
      const data: TwitterResponse = JSON.parse(responseJSON);
      setResult(data);
      setUsername(loadedUsername);
      setShowDatabase(false);
      toast.success(`Loaded @${loadedUsername} from database`);
    } catch (error) {
      toast.error("Failed to parse saved data");
    }
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <TitleBar />
        <div className="flex-1 p-4 md:p-8">
          <div className="max-w-5xl mx-auto space-y-6">
            {showDatabase ? (
              <DatabaseView
                onBack={() => setShowDatabase(false)}
                onLoadAccount={handleLoadFromDB}
              />
            ) : (
              <>
                <Header
                  version={CURRENT_VERSION}
                  hasUpdate={hasUpdate}
                  onDatabaseClick={() => setShowDatabase(true)}
                />

                <SearchBar
                  username={username}
                  loading={loading}
                  onUsernameChange={setUsername}
                  onFetch={handleFetch}
                  onStopFetch={handleStopFetch}
                  history={fetchHistory}
                  onHistorySelect={handleHistorySelect}
                  onHistoryRemove={removeFromHistory}
                  hasResult={!!result}
                />

                {result && (
                  <MediaList
                    accountInfo={result.account_info}
                    timeline={result.timeline}
                    totalUrls={result.total_urls}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
