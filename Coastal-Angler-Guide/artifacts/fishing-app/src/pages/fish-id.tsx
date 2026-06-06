import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fileToBase64 } from "@/lib/image-utils";
import { useAnalyzeFish, useAnalyzeRod } from "@workspace/api-client-react";
import { Camera, Upload, Scan } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function FishId() {
  const [fishImage, setFishImage] = useState<string | null>(null);
  const [rodImage, setRodImage] = useState<string | null>(null);
  const [rodTarget, setRodTarget] = useState("Red Drum");
  
  const analyzeFish = useAnalyzeFish();
  const analyzeRod = useAnalyzeRod();

  const handleFishUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setFishImage(base64);
      analyzeFish.mutate({
        data: {
          imageBase64: base64
        }
      });
    }
  };

  const handleRodUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setRodImage(base64);
      analyzeRod.mutate({
        data: {
          imageBase64: base64,
          targetSpecies: rodTarget
        }
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground">AI Scanners</h2>
          <p className="text-muted-foreground">Instantly identify your catch or scan your rod</p>
        </div>

        <Tabs defaultValue="fish">
          <TabsList className="mb-4">
            <TabsTrigger value="fish">Fish ID</TabsTrigger>
            <TabsTrigger value="rod">Rod Scanner</TabsTrigger>
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

            {analyzeFish.data && (
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-background p-4 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground uppercase">Est. Length</p>
                        <p className="text-xl font-bold text-foreground">{analyzeFish.data.lengthEstimateCm} cm</p>
                      </div>
                      <div className="bg-background p-4 rounded-lg border border-border">
                        <p className="text-xs text-muted-foreground uppercase">Est. Weight</p>
                        <p className="text-xl font-bold text-foreground">{analyzeFish.data.weightEstimateKg} kg</p>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground mb-2">Description</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">{analyzeFish.data.description}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-card-border shadow-sm">
                  <CardHeader>
                    <CardTitle>Catching Tips</CardTitle>
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
                <CardTitle>Rod Details</CardTitle>
                <CardDescription>Upload a picture of your rod's spec label.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Target Species</Label>
                  <Select value={rodTarget} onValueChange={setRodTarget}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Red Drum">Red Drum</SelectItem>
                      <SelectItem value="Speckled Trout">Speckled Trout</SelectItem>
                      <SelectItem value="Flounder">Flounder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="border border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center bg-background min-h-[200px]">
                  {rodImage ? (
                    <div className="w-full relative rounded-lg overflow-hidden">
                      <img src={rodImage} alt="Uploaded rod" className="w-full h-auto object-cover max-h-[300px]" />
                      {analyzeRod.isPending && (
                        <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center">
                          <Scan className="w-10 h-10 text-primary animate-pulse mb-4" />
                          <p className="font-medium text-foreground">Analyzing Rod Specs...</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Button variant="secondary" className="flex items-center gap-2">
                          <Upload className="w-4 h-4" /> Scan Rod Label
                        </Button>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={handleRodUpload}
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {analyzeRod.data && (
              <Card className="bg-card border-card-border shadow-sm">
                <CardHeader>
                  <CardTitle>Analysis Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Power</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.powerRating}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Action</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.actionRating}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Line Wt</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.recommendedLineWeight}</p>
                    </div>
                    <div className="bg-background p-3 rounded border border-border">
                      <p className="text-xs text-muted-foreground uppercase">Lure Wt</p>
                      <p className="font-bold text-foreground">{analyzeRod.data.recommendedLureWeight}</p>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-foreground uppercase mb-2">Recommendation for {rodTarget}</h4>
                    <p className="text-sm text-foreground/80">{analyzeRod.data.rigRecommendation}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
