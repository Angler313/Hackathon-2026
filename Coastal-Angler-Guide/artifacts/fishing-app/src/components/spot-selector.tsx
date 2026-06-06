import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function SpotSelector({ onLocationChange }: { onLocationChange: (lat: number, lon: number, waterType: string) => void }) {
  // Mock spots for now since user needs to select something
  const mockSpots = [
    { id: "1", name: "Galveston Pier", lat: 29.28, lon: -94.78, type: "pier" },
    { id: "2", name: "Surfside Beach", lat: 28.94, lon: -95.29, type: "surf" },
    { id: "3", name: "Lake Conroe", lat: 30.41, lon: -95.58, type: "lake" },
  ];

  return (
    <div className="flex items-center gap-4 bg-card border border-card-border p-3 rounded-lg shadow-sm">
      <span className="font-medium text-muted-foreground text-sm uppercase tracking-wider">LOCATION</span>
      <Select 
        defaultValue="1" 
        onValueChange={(val) => {
          const spot = mockSpots.find(s => s.id === val);
          if (spot) onLocationChange(spot.lat, spot.lon, spot.type);
        }}
      >
        <SelectTrigger className="w-[200px] border-none shadow-none font-bold text-base focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {mockSpots.map(spot => (
            <SelectItem key={spot.id} value={spot.id}>{spot.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
