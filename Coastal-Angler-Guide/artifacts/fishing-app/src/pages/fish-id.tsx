import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileToBase64 } from "@/lib/image-utils";
import { useAnalyzeFish, useAnalyzeRod } from "@workspace/api-client-react";
import { Camera, Upload, Scan, Search, MapPin } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function kgToLbs(kg: number) { return Math.round(kg * 2.20462 * 10) / 10; }
function cmToIn(cm: number) { return Math.round(cm * 0.393701 * 10) / 10; }

export default function FishId() {
  const [fishImage, setFishImage] = useState<string | null>(null);
  const [rodTarget, setRodTarget] = useState("Largemouth Bass");
  const [rodLocation, setRodLocation] = useState("");
  const [useImperial, setUseImperial] = useState(true);
  
  const analyzeFish = useAnalyzeFish();
  const analyzeRod = useAnalyzeRod();

  const handleFishUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setFishImage(base64);
      analyzeFish.mutate(
        { data: { imageBase64: base64 } },
        {
          onError: (err) => {
            console.error("Fish analysis failed:", err);
            alert("Analysis failed. Check console for details.");
          },
          onSuccess: (result) => {
            console.log("Fish analysis result:", result);
          },
        }
      );
    }
  };

  const handleRodSearch = () => {
    if (!rodTarget.trim()) return;
    analyzeRod.mutate({
      data: {
        imageBase64: "x",
        targetSpecies: rodTarget.trim(),
        locationName: rodLocation.trim(),
      } as any,
    });
  };

  const handleRodKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleRodSearch();
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground">AI Scanners</h2>
            <p className="text-muted-foreground">Instantly identify your catch or scan your rod</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="fish-unit-toggle" checked={useImperial} onCheckedChange={setUseImperial} />
            <Label htmlFor="fish-unit-toggle" className="text-xs text-muted-foreground cursor-pointer">
              {useImperial ? "lbs / in" : "kg / cm"}
            </Label>
          </div>
        </div>

        <Tabs defaultValue="fish">
          <TabsList className="mb-4">
            <TabsTrigger value="fish">Fish ID</TabsTrigger>
            <TabsTrigger value="rod">Rod Recommender</TabsTrigger>
          </TabsList>

          <TabsContent value="fish" className="space-y-6">
            <Card className="bg-card border-card-border shadow-sm border-dashed">
              <CardContent className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
                {fishImage ? (
                  <div className="w-full relative rounded-lg overflow-hidden border border-border">
                    <img src={fishImage} alt="Uploaded fish" className="w-full h-auto object-cover max-h-[400px]" />
                    {analyzeFish.isPending && (
                      <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center">
                        <Scan className="w-12 h-12 text-primary animate-pulse mb-4" />
                        <p className="font-medium text-foreground">Analyzing Catch...</p>
                      </div>
                    )}
                    {!analyzeFish.isPending && (
                      <div className="absolute top-2 right-2 flex gap-2">
                        <Button variant="destructive" size="sm" onClick={() => { setFishImage(null); }}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Camera className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">Upload a Photo</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm">
                      Take a clear photo of the fish. Include a common object for better size estimation.
                    </p>
                    <div className="relative">
                      <Button variant="secondary" className="flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Select Image
                      </Button>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleFishUpload}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {analyzeFish.isError && (
              <Card className="bg-destructive/10 border-destructive/30">
                <CardContent className="p-4 text-center">
                  <p className="text-destructive font-bold">Analysis failed</p>
                  <p className="text-sm text-destructive/80 mt-1">{String(analyzeFish.error || "Unknown error")}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => { setFishImage(null); }}>Try Again</Button>
                </CardContent>
              </Card>
            )}

            {analyzeFish.data && analyzeFish.data.species === "No fish detected" && (
              <Card className="bg-card border-card-border shadow-sm">
                <CardContent className="p-8 text-center">
                  <p className="text-xl font-bold text-muted-foreground">No fish detected</p>
                  <p className="text-sm text-muted-foreground mt-2 mb-4">The image does not appear to contain a fish. Try a clearer photo.</p>
                  <Button variant="outline" onClick={() => { setFishImage(null); }}>Try Again</Button>
                </CardContent>
              </Card>
            )}

            {analyzeFish.data && analyzeFish.data.species !== "No fish detected" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="bg-card border-card-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex justify-between items-start">
                      <span className="text-2xl font-bold">{analyzeFish.data.species}</span>
                      <div className="flex flex-col items-end">
                        <span className="text-xs text-muted-foreground uppercase tracking-wider">Confidence</span>
                        <span className="font-mono text-primary font-bold">{Math.round(analyzeFish.data.confidence * 100)}%</span>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="bg-background p-4 rounded-lg border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Est. Length ({useImperial ? "in" : "cm"})</p>
                      <p className="text-xl font-bold text-foreground">{useImperial ? cmToIn(analyzeFish.data.lengthEstimateCm) : analyzeFish.data.lengthEstimateCm}</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">Description</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">{analyzeFish.data.description}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-card-border shadow-sm">
                  <CardHeader>
                    <CardTitle>Measuring Tips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {analyzeFish.data.catchingTips.map((tip, i) => (
                        <li key={i} className="flex gap-3 text-sm text-foreground">
                          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                            {i + 1}
                          </span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                    
                    {(analyzeFish.data.bestBaits && analyzeFish.data.bestBaits.length > 0) && (
                      <div className="mt-6 pt-6 border-t border-border">
                        <h4 className="font-bold text-foreground mb-3 text-sm uppercase">Best Baits</h4>
                        <div className="flex flex-wrap gap-2">
                          {analyzeFish.data.bestBaits.map(bait => (
                            <span key={bait} className="bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1 rounded-full text-xs font-bold">
                              {bait}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rod" className="space-y-6">
            <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle>Rod Recommender</CardTitle>
                <CardDescription>Get the ideal rod setup for your target species and fishing location.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Species</Label>
                  <Select value={rodTarget} onValueChange={setRodTarget}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="Largemouth Bass">Largemouth Bass</SelectItem>
                      <SelectItem value="Smallmouth Bass">Smallmouth Bass</SelectItem>
                      <SelectItem value="White Bass">White Bass</SelectItem>
                      <SelectItem value="Striped Bass">Striped Bass</SelectItem>
                      <SelectItem value="Hybrid Striped Bass">Hybrid Striped Bass</SelectItem>
                      <SelectItem value="Crappie">Crappie</SelectItem>
                      <SelectItem value="Bluegill Sunfish">Bluegill</SelectItem>
                      <SelectItem value="Channel Catfish">Channel Catfish</SelectItem>
                      <SelectItem value="Blue Catfish">Blue Catfish</SelectItem>
                      <SelectItem value="Flathead Catfish">Flathead Catfish</SelectItem>
                      <SelectItem value="Walleye">Walleye</SelectItem>
                      <SelectItem value="Northern Pike">Northern Pike</SelectItem>
                      <SelectItem value="Muskellunge">Muskie</SelectItem>
                      <SelectItem value="Yellow Perch">Yellow Perch</SelectItem>
                      <SelectItem value="Rainbow Trout">Rainbow Trout</SelectItem>
                      <SelectItem value="Brown Trout">Brown Trout</SelectItem>
                      <SelectItem value="Red Drum">Red Drum</SelectItem>
                      <SelectItem value="Spotted Seatrout">Spotted Seatrout</SelectItem>
                      <SelectItem value="Flounder (Southern)">Flounder</SelectItem>
                      <SelectItem value="Sheepshead">Sheepshead</SelectItem>
                      <SelectItem value="Spanish Mackerel">Spanish Mackerel</SelectItem>
                      <SelectItem value="King Mackerel">King Mackerel</SelectItem>
                      <SelectItem value="Cobia">Cobia</SelectItem>
                      <SelectItem value="Mahi-Mahi (Dolphinfish)">Mahi-Mahi</SelectItem>
                      <SelectItem value="Yellowfin Tuna">Yellowfin Tuna</SelectItem>
                      <SelectItem value="Grouper (Gag)">Gag Grouper</SelectItem>
                      <SelectItem value="Mangrove Snapper">Mangrove Snapper</SelectItem>
                      <SelectItem value="Amberjack (Greater)">Amberjack</SelectItem>
                      <SelectItem value="Tarpon">Tarpon</SelectItem>
                      <SelectItem value="Snook">Snook</SelectItem>
                      <SelectItem value="Jack Crevalle">Jack Crevalle</SelectItem>
                      <SelectItem value="Wahoo">Wahoo</SelectItem>
                      <SelectItem value="Black Drum">Black Drum</SelectItem>
                      <SelectItem value="Pompano">Pompano</SelectItem>
                      <SelectItem value="Bonefish">Bonefish</SelectItem>
                      <SelectItem value="Permit">Permit</SelectItem>
                      <SelectItem value="Alligator Gar">Alligator Gar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fishing Location (optional)</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder='e.g. "Lake Conroe", "Galveston Bay", "my local pond"'
                      value={rodLocation}
                      onChange={e => setRodLocation(e.target.value)}
                      onKeyDown={handleRodKeyDown}
                    />
                  </div>
                </div>
                <Button onClick={handleRodSearch} disabled={!rodTarget.trim() || analyzeRod.isPending} className="w-full gap-2">
                  <Search className="w-4 h-4" />
                  {analyzeRod.isPending ? "Finding..." : "Get Rod Recommendation"}
                </Button>
              </CardContent>
            </Card>

            {analyzeRod.data && (
              <Card className="bg-card border-card-border shadow-sm">
                <CardHeader>
                  <CardTitle>Recommended Setup for {rodTarget}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Rod Type</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.rodType}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Power</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.powerRating}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Action</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.actionRating}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Sinker</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.sinkerWeight}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Line Weight</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.recommendedLineWeight}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Lure Weight</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.recommendedLureWeight}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-foreground uppercase mb-2">Rig & Rod Setup</h4>
                    <p className="text-sm text-foreground/80">{analyzeRod.data.rigRecommendation}</p>
                  </div>

                  {analyzeRod.data.castingTips.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <h4 className="font-bold text-sm text-foreground uppercase mb-2">Casting Tips</h4>
                      <ul className="space-y-2">
                        {analyzeRod.data.castingTips.map((tip: string, i: number) => (
                          <li key={i} className="flex gap-3 text-sm text-foreground">
                            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                              {i + 1}
                            </span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!analyzeRod.data && !analyzeRod.isPending && (
              <div className="text-center py-16 border border-dashed border-border rounded-lg bg-card/50">
                <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-bold text-foreground mb-2">Rod Recommender</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Select a target species above to get the ideal rod, reel, line, and rig recommendation.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
