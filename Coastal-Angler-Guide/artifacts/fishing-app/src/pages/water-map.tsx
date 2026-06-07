import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnalyzeWaterDepth } from "@workspace/api-client-react";
import { Fish, Search, MapPin, Clock, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function WaterMap() {
  const [locationName, setLocationName] = useState("");
  const [waterType, setWaterType] = useState("lake");
  const [season, setSeason] = useState("summer");
  const analyzeWater = useAnalyzeWaterDepth();

  const handleSearch = () => {
    if (!locationName.trim()) return;
    analyzeWater.mutate({
      data: {
        imageBase64: "placeholder",
        waterBodyType: waterType as any,
        season: season as any,
        locationName: locationName.trim(),
      } as any,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground">Fish Location Finder</h2>
          <p className="text-muted-foreground">Find where different fish species hold in any water body</p>
        </div>

        <Card className="bg-card border-card-border shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="location-name">Lake, Pond, or Water Body</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="location-name"
                    className="pl-9"
                    placeholder='e.g. "Lake Conroe", "my neighborhood pond", "Galveston Bay"'
                    value={locationName}
                    onChange={e => setLocationName(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Water Type</Label>
                <Select value={waterType} onValueChange={setWaterType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lake">Lake</SelectItem>
                    <SelectItem value="pond">Pond</SelectItem>
                    <SelectItem value="river">River</SelectItem>
                    <SelectItem value="bay">Bay</SelectItem>
                    <SelectItem value="ocean">Ocean</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Season</Label>
                <Select value={season} onValueChange={setSeason}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spring">Spring</SelectItem>
                    <SelectItem value="summer">Summer</SelectItem>
                    <SelectItem value="fall">Fall</SelectItem>
                    <SelectItem value="winter">Winter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={handleSearch} disabled={!locationName.trim() || analyzeWater.isPending} className="gap-2">
                <Search className="w-4 h-4" />
                {analyzeWater.isPending ? "Finding..." : "Find Fish Locations"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Name a pond, lake, or any water body — even unnamed ones. Just describe where it is.
              </p>
            </div>
          </CardContent>
        </Card>

        {analyzeWater.data && (
          <div className="space-y-6">
            <Card className="bg-card border-card-border shadow-sm">
              <CardContent className="p-6 space-y-4">
                <p className="text-foreground/90 leading-relaxed">{analyzeWater.data.estimatedDepthProfile}</p>
                <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>{analyzeWater.data.bestTimeToFish}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Where Fish Hold
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {analyzeWater.data.fishZones.map((zone, i) => (
                    <div key={i} className="bg-background border border-border rounded-lg p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-foreground text-sm">{zone.zone}</h3>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono whitespace-nowrap">{zone.depthFt}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{zone.species.join(" · ")}</p>
                      <p className="text-sm text-foreground/80 leading-relaxed">{zone.activity}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fish className="w-5 h-5 text-primary" />
                  Seasonal Behavior — {season.charAt(0).toUpperCase() + season.slice(1)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground/80 leading-relaxed">{analyzeWater.data.seasonalBehavior}</p>
                {analyzeWater.data.structureNotes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-sm text-muted-foreground leading-relaxed">{analyzeWater.data.structureNotes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {!analyzeWater.data && !analyzeWater.isPending && (
          <div className="text-center py-16 border border-dashed border-border rounded-lg bg-card/50">
            <MapPin className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h3 className="text-lg font-bold text-foreground mb-2">Fish Location Finder</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Enter any lake, pond, river, bay, or ocean area above to see which structures hold fish and where to cast.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
