import { useState, useRef, useEffect } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { useSearchLocation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTIONS = [
  "Galveston Seawall, TX",
  "Outer Banks, NC",
  "Lake Tahoe, CA",
  "Florida Keys",
  "Mississippi River, New Orleans",
  "Chesapeake Bay, MD",
  "Lake Fork, TX",
  "Destin Harbor, FL",
  "San Francisco Bay, CA",
  "Columbia River, OR",
  "Lake Okeechobee, FL",
  "Puget Sound, WA",
  "Charleston Harbor, SC",
  "Lake Michigan, Chicago",
  "Colorado River, AZ",
];

interface LocationSearchProps {
  onResult: (result: {
    resolvedName: string;
    latitude: number;
    longitude: number;
    waterBodyType: string;
    region: string;
    topSpecies: string[];
    conditions: unknown;
  }) => void;
}

export function LocationSearch({ onResult }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchLocation = useSearchLocation();

  useEffect(() => {
    if (query.length >= 2) {
      const filtered = SUGGESTIONS.filter(s =>
        s.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredSuggestions(filtered.slice(0, 5));
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [query]);

  const handleSearch = (locationName: string) => {
    if (!locationName.trim()) return;
    setShowSuggestions(false);
    searchLocation.mutate(
      { data: { locationName: locationName.trim() } },
      {
        onSuccess: (result) => {
          onResult(result as Parameters<typeof onResult>[0]);
          setQuery("");
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch(query);
    if (e.key === "Escape") setShowSuggestions(false);
  };

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            data-testid="input-location-search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => query.length >= 2 && setShowSuggestions(true)}
            placeholder='Search any body of water... "Lake Tahoe", "Outer Banks"'
            className="pl-9 pr-9 bg-card border-card-border text-foreground placeholder:text-muted-foreground"
            disabled={searchLocation.isPending}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setShowSuggestions(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-clear-search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <Button
          data-testid="button-search-location"
          onClick={() => handleSearch(query)}
          disabled={!query.trim() || searchLocation.isPending}
          className="shrink-0"
        >
          {searchLocation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Search"
          )}
        </Button>
      </div>

      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-popover-border rounded-lg shadow-lg z-50 overflow-hidden">
          {filteredSuggestions.map(suggestion => (
            <button
              key={suggestion}
              data-testid={`suggestion-${suggestion.replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => { setQuery(suggestion); handleSearch(suggestion); }}
              className="flex items-center gap-3 w-full px-4 py-3 text-left text-sm hover:bg-accent/10 transition-colors border-b border-border last:border-0"
            >
              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-foreground">{suggestion}</span>
            </button>
          ))}
        </div>
      )}

      {searchLocation.isError && (
        <p className="text-xs text-destructive mt-2">
          Could not find that location. Try a more specific name.
        </p>
      )}
    </div>
  );
}
