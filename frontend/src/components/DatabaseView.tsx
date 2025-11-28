import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Trash2, Eye, FileInput, FileOutput, Pencil, Tag, Shuffle, X } from "lucide-react";
import { toastWithSound as toast } from "@/lib/toast-with-sound";
import { getSettings } from "@/lib/settings";
import {
  GetAllAccountsFromDB,
  GetAccountFromDB,
  DeleteAccountFromDB,
  ClearAllAccountsFromDB,
  SaveAccountToDB,
  ExportAccountJSON,
  UpdateAccountGroup,
  GetAllGroups,
} from "../../wailsjs/go/main/App";



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

interface AccountListItem {
  id: number;
  username: string;
  name: string;
  profile_image: string;
  total_media: number;
  last_fetched: string;
  group_name: string;
  group_color: string;
}

interface GroupInfo {
  name: string;
  color: string;
}

interface DatabaseViewProps {
  onBack: () => void;
  onLoadAccount: (responseJSON: string, username: string) => void;
}

const ITEMS_PER_PAGE = 10;

export function DatabaseView({ onBack, onLoadAccount }: DatabaseViewProps) {
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [editingAccount, setEditingAccount] = useState<AccountListItem | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupColor, setEditGroupColor] = useState("");

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await GetAllAccountsFromDB();
      setAccounts(data || []);
      const groupsData = await GetAllGroups();
      if (groupsData) {
        setGroups(groupsData.map((g) => ({ name: g.name || "", color: g.color || "" })));
      }
    } catch (error) {
      console.error("Failed to load accounts:", error);
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = accounts.filter((acc) => {
    if (filterGroup === "all") return true;
    if (filterGroup === "ungrouped") return !acc.group_name;
    return acc.group_name === filterGroup;
  });

  const handleEditGroup = (account: AccountListItem) => {
    setEditingAccount(account);
    setEditGroupName(account.group_name || "");
    setEditGroupColor(account.group_color || "#3b82f6");
  };

  const handleSaveGroup = async () => {
    if (!editingAccount) return;
    try {
      await UpdateAccountGroup(editingAccount.id, editGroupName, editGroupColor);
      toast.success(`Updated group for @${editingAccount.username}`);
      setEditingAccount(null);
      loadAccounts();
    } catch (error) {
      toast.error("Failed to update group");
    }
  };

  const handleDelete = async (id: number, username: string) => {
    try {
      await DeleteAccountFromDB(id);
      toast.success(`Deleted @${username}`);
      loadAccounts();
    } catch (error) {
      toast.error("Failed to delete account");
    }
  };

  const handleView = async (id: number, username: string) => {
    try {
      const responseJSON = await GetAccountFromDB(id);
      onLoadAccount(responseJSON, username);
    } catch (error) {
      toast.error("Failed to load account data");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    }
  };

  const handleExport = async () => {
    const idsToExport = selectedIds.size > 0 ? Array.from(selectedIds) : accounts.map((a) => a.id);

    if (idsToExport.length === 0) {
      toast.error("No accounts to export");
      return;
    }

    const settings = getSettings();
    const outputDir = settings.downloadPath || "";

    try {
      let exported = 0;
      for (const id of idsToExport) {
        await ExportAccountJSON(id, outputDir);
        exported++;
      }
      toast.success(`Exported ${exported} account(s) to ${outputDir}\\twitterxmediabatchdownloader_backups`);
    } catch (error) {
      toast.error("Failed to export");
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      let imported = 0;
      for (const file of Array.from(files)) {
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          
          if (data.account_info && data.timeline) {
            // Note: metadata-extractor returns name=username and nick=display_name (swapped)
            await SaveAccountToDB(
              data.account_info.name,  // username/handle
              data.account_info.nick,  // display name
              data.account_info.profile_image,
              data.total_urls || data.timeline.length,
              text
            );
            imported++;
          }
        } catch (err) {
          console.error(`Failed to import ${file.name}:`, err);
        }
      }
      
      if (imported > 0) {
        toast.success(`Imported ${imported} account(s)`);
        loadAccounts();
      } else {
        toast.error("No valid files imported");
      }
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-2xl font-bold">Saved Accounts</h2>
          <Badge variant="secondary">{accounts.length} accounts</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleImport}>
                <FileInput className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import JSON</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={handleExport} disabled={selectedIds.size === 0}>
                <FileOutput className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export Selected</TooltipContent>
          </Tooltip>
          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="text-destructive" disabled={accounts.length === 0}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Clear All</TooltipContent>
            </Tooltip>
            <DialogContent className="[&>button]:hidden">
              <div className="absolute right-4 top-4">
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-70 hover:opacity-100">
                    <X className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
              </div>
              <DialogHeader>
                <DialogTitle>Clear All Accounts?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all {accounts.length} saved accounts. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await ClearAllAccountsFromDB();
                      toast.success("All accounts deleted");
                      loadAccounts();
                    } catch (error) {
                      toast.error("Failed to clear accounts");
                    }
                  }}
                >
                  Delete All
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No saved accounts yet. Fetch a user's media to save it here.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Filter and Select All */}
          <div className="flex items-center gap-4 px-4 py-2">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.size === filteredAccounts.length && filteredAccounts.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                Select all {selectedIds.size > 0 && `(${selectedIds.size} selected)`}
              </span>
            </div>
            <div className="flex-1" />
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-auto">
                <Tag className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                <SelectItem value="ungrouped">Ungrouped</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.name} value={group.name}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      {group.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filteredAccounts
            .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
            .map((account) => (
            <div
              key={account.id}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                selectedIds.has(account.id) ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"
              }`}
            >
              <Checkbox
                checked={selectedIds.has(account.id)}
                onCheckedChange={() => toggleSelect(account.id)}
              />
              <img
                src={account.profile_image}
                alt={account.name}
                className="w-12 h-12 rounded-full"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate">{account.name}</span>
                  <span className="text-muted-foreground">({account.total_media})</span>
                  {account.group_name && (
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{ borderColor: account.group_color, color: account.group_color }}
                    >
                      {account.group_name}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">@{account.username}</div>
                <div className="text-sm text-muted-foreground">
                  {account.last_fetched} {getRelativeTime(account.last_fetched)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditGroup(account)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit Group</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleView(account.id, account.username)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={async () => {
                        const settings = getSettings();
                        const outputDir = settings.downloadPath || "";
                        try {
                          await ExportAccountJSON(account.id, outputDir);
                          toast.success(`Exported @${account.username} to ${outputDir}\\twitterxmediabatchdownloader_backups`);
                        } catch (error) {
                          toast.error("Failed to export");
                        }
                      }}
                    >
                      <FileOutput className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export JSON</TooltipContent>
                </Tooltip>
                <Dialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="icon" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Delete</TooltipContent>
                  </Tooltip>
                  <DialogContent className="[&>button]:hidden">
                    <div className="absolute right-4 top-4">
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-70 hover:opacity-100">
                          <X className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                    </div>
                    <DialogHeader>
                      <DialogTitle>Delete @{account.username}?</DialogTitle>
                      <DialogDescription>
                        This will permanently delete the saved data for this account.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="destructive"
                        onClick={() => handleDelete(account.id, account.username)}
                      >
                        Delete
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {filteredAccounts.length > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-4">
                Page {currentPage} of {Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE), p + 1))}
                disabled={currentPage === Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Edit Group Dialog */}
      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="[&>button]:hidden">
          <div className="absolute right-4 top-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-70 hover:opacity-100"
              onClick={() => setEditingAccount(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <DialogHeader>
            <DialogTitle>Edit Group for @{editingAccount?.username}</DialogTitle>
            <DialogDescription>
              Assign this account to a group for better organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">Group Name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="groupName"
                  placeholder="e.g., Artists, Photographers, Friends"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="flex-1"
                />
                {groups.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(value) => {
                      setEditGroupName(value);
                      const group = groups.find((g) => g.name === value);
                      if (group) setEditGroupColor(group.color);
                    }}
                  >
                    <SelectTrigger className="w-auto">
                      <Tag className="h-4 w-4" />
                    </SelectTrigger>
                    <SelectContent>
                      {groups.map((g) => (
                        <SelectItem key={g.name} value={g.name}>
                          <span className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: g.color }}
                            />
                            {g.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {editGroupName && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setEditGroupName("");
                          setEditGroupColor("#3b82f6");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove from Group</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupColor">Group Color</Label>
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <input
                    id="groupColor"
                    type="color"
                    value={editGroupColor}
                    onChange={(e) => setEditGroupColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div
                    className="w-10 h-10 rounded-full border-2 border-border cursor-pointer"
                    style={{ backgroundColor: editGroupColor }}
                  />
                </div>
                <Input
                  value={editGroupColor}
                  onChange={(e) => setEditGroupColor(e.target.value)}
                  placeholder="#3b82f6"
                  className="w-28 font-mono text-sm"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const randomColor = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0");
                        setEditGroupColor(randomColor);
                      }}
                    >
                      <Shuffle className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Random Color</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingAccount(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveGroup}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
