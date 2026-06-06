import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fileToBase64 } from "@/lib/image-utils";
import { useAnalyzeWaterDepth } from "@workspace/api-client-react";
import { Map, Upload } from "lucide-react";
import { WaterImageInputWaterBodyType, WaterImageInputSeason } from "@workspace/api-client-react/src/generated/api.schemas";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function WaterMap() {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [waterType, setWaterType] = useState<WaterImageInputWaterBodyType>("lake");
  const [season, setSeason] = useState<WaterImageInputSeason>("summer");
  const analyzeWater = useAnalyzeWaterDepth();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setImagePreview(base64);
    }
  };

  const handleAnalyze = () => {
    if (imagePreview) {
      analyzeWater.mutate({
        data: {
          imageBase64: imagePreview,
          waterBodyType: waterType,
          season: season
        }
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground">Water Body Analyzer</h2>
          <p className="text-muted-foreground">Read the water like a pro to find where fish hold</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle>Analysis Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Water Body Type</Label>
                  <Select value={waterType} onValueChange={(val: any) => setWaterType(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lake">Lake</SelectItem>
                      <SelectItem value="river">River</SelectItem>
                      <SelectItem value="ocean">Ocean</SelectItem>
                      <SelectItem value="pond">Pond</SelectItem>
                      <SelectItem value="bay">Bay</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Season</Label>
                  <Select value={season} onValueChange={(val: any) => setSeason(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="spring">Spring</SelectItem>
                      <SelectItem value="summer">Summer</SelectItem>
                      <SelectItem value="fall">Fall</SelectItem>
                      <SelectItem value="winter">Winter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  onClick={handleAnalyze} 
                  className="w-full"
                  disabled={!imagePreview || analyzeWater.isPending}
                >
                  {analyzeWater.isPending ? "Analyzing Water..." : "Analyze Water"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-card border-card-border shadow-sm border-dashed h-full min-h-[300px]">
              <CardContent className="p-0 flex flex-col items-center justify-center h-full">
                {imagePreview ? (
                  <div className="w-full relative h-full">
                    <img src={imagePreview} alt="Water body" className="w-full h-full object-cover max-h-[500px]" />
                  </div>
                ) : (
                  <div className="p-12 text-center flex flex-col items-center">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <Map className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-2">Upload Water Photo</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm">
                      Take a photo of the water you're fishing to get a depth profile and structure analysis.
                    </p>
                    <div className="relative">
                      <Button variant="secondary" className="flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Select Image
                      </Button>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        onChange={handleImageUpload}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {analyzeWater.data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
             <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle>Depth Profile & Zones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm font-medium text-foreground">{analyzeWater.data.estimatedDepthProfile}</p>
                <div className="space-y-3 mt-4">
                  {analyzeWater.data.fishZones.map((zone, idx) => (
                    <div key={idx} className="bg-background border border-border p-3 rounded flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm text-foreground">{zone.zone}</p>
                        <p className="text-xs text-muted-foreground">Depth: {zone.depthFt}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-primary">{zone.activity}</p>
                        <p className="text-xs text-muted-foreground">{zone.species.join(", ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle>Strategy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Seasonal Behavior</h4>
                  <p className="text-sm text-foreground">{analyzeWater.data.seasonalBehavior}</p>
                </div>
                {analyzeWater.data.structureNotes && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Structure Notes</h4>
                    <p className="text-sm text-foreground">{analyzeWater.data.structureNotes}</p>
                  </div>
                )}
                {analyzeWater.data.bestTimeToFish && (
                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Best Time to Fish</h4>
                    <p className="text-sm text-foreground">{analyzeWater.data.bestTimeToFish}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
