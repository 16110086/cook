import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InputWithContext } from "@/components/ui/input-with-context";
import { Label } from "@/components/ui/label";
import { Search, XCircle, Calendar, StopCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FetchHistory } from "@/components/FetchHistory";
import type { HistoryItem } from "@/components/FetchHistory";

interface SearchBarProps {
  username: string;
  loading: boolean;
  onUsernameChange: (username: string) => void;
  onFetch: (useDateRange: boolean, startDate?: string, endDate?: string, mediaType?: string, retweets?: boolean) => void;
  onStopFetch: () => void;
  history: HistoryItem[];
  onHistorySelect: (item: HistoryItem) => void;
  onHistoryRemove: (id: string) => void;
  hasResult: boolean;
}

export function SearchBar({
  username,
  loading,
  onUsernameChange,
  onFetch,
  onStopFetch,
  history,
  onHistorySelect,
  onHistoryRemove,
  hasResult,
}: SearchBarProps) {
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [mediaType, setMediaType] = useState("all");
  const [retweets, setRetweets] = useState(false);

  const handleFetch = () => {
    onFetch(useDateRange, startDate, endDate, mediaType, retweets);
  };

  return (
    <div className="space-y-3">
      {/* Username Input */}
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <InputWithContext
              id="username"
              placeholder="masteraoko or @masteraoko or https://x.com/masteraoko"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              className="pr-8"
            />
            {username && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() => onUsernameChange("")}
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <Button variant="destructive" onClick={onStopFetch}>
                <StopCircle className="h-4 w-4" />
                Stop
              </Button>
            )}
            <Button onClick={handleFetch} disabled={loading}>
              {loading ? (
                <>
                  <Spinner />
                  Fetching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Fetch
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Advanced Settings Accordion */}
      <Accordion type="single" collapsible className="border rounded-lg w-fit">
        <AccordionItem value="advanced" className="border-0">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <span className="text-sm font-medium">Advanced Settings</span>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-3">
              {/* Options Row */}
              <div className="flex items-center gap-4">
                {/* Media Type */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="media-type" className="text-sm">Media Type</Label>
                  <Select value={mediaType} onValueChange={setMediaType}>
                    <SelectTrigger id="media-type" className="w-auto h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="image">Images</SelectItem>
                      <SelectItem value="video">Videos</SelectItem>
                      <SelectItem value="gif">GIFs</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Include Retweets */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="retweets"
                    checked={retweets}
                    onCheckedChange={(checked) => setRetweets(checked as boolean)}
                  />
                  <Label htmlFor="retweets" className="text-sm cursor-pointer">Include Retweets</Label>
                </div>

                {/* Date Range Toggle */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="date-range"
                    checked={useDateRange}
                    onCheckedChange={(checked) => setUseDateRange(checked as boolean)}
                  />
                  <Label htmlFor="date-range" className="text-sm cursor-pointer flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Date Range
                  </Label>
                </div>
              </div>

              {/* Date Range Inputs */}
              {useDateRange && (
                <div className="inline-flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="start-date" className="text-sm">From</Label>
                    <InputWithContext
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-[150px] h-8"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="end-date" className="text-sm">To</Label>
                    <InputWithContext
                      id="end-date"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-[150px] h-8"
                    />
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {!hasResult && (
        <FetchHistory
          history={history}
          onSelect={onHistorySelect}
          onRemove={onHistoryRemove}
        />
      )}
    </div>
  );
}
