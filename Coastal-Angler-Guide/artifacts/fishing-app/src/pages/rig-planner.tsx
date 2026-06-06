import { Layout } from "@/components/layout";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetRigRecommendations, useGetCastAngle } from "@workspace/api-client-react";
import { Anchor, AlertCircle } from "lucide-react";
import { RigRequestInputWaterType } from "@workspace/api-client-react/src/generated/api.schemas";

export default function RigPlanner() {
  const [species, setSpecies] = useState("Red Drum");
  const [waterType, setWaterType] = useState<RigRequestInputWaterType>("pier");
  
  const [rodLength, setRodLength] = useState("7");
  const [sinkerWeight, setSinkerWeight] = useState("2");
  const [targetDistance, setTargetDistance] = useState("100");

  const getRigs = useGetRigRecommendations();
  const getAngle = useGetCastAngle();

  const handleGetRigs = () => {
    getRigs.mutate({
      data: {
        targetSpecies: species,
        waterType: waterType,
        conditions: {}
      }
    });
  };

  const handleGetAngle = () => {
    getAngle.mutate({
      data: {
        rodLengthFt: parseFloat(rodLength),
        sinkerWeightOz: parseFloat(sinkerWeight),
        targetDistanceFt: parseFloat(targetDistance)
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground">Rig & Bait Planner</h2>
          <p className="text-muted-foreground">Expert recommendations for your target and conditions</p>
        </div>

        <Tabs defaultValue="rigs">
          <TabsList className="mb-4">
            <TabsTrigger value="rigs">Rig Planner</TabsTrigger>
            <TabsTrigger value="angle">Cast Angle</TabsTrigger>
          </TabsList>
          
          <TabsContent value="rigs" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-1 bg-card border-card-border shadow-sm">
                <CardHeader>
                  <CardTitle>Target Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Target Species</Label>
                    <Select value={species} onValueChange={setSpecies}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select species" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Red Drum">Red Drum</SelectItem>
                        <SelectItem value="Speckled Trout">Speckled Trout</SelectItem>
                        <SelectItem value="Flounder">Flounder</SelectItem>
                        <SelectItem value="Spanish Mackerel">Spanish Mackerel</SelectItem>
                        <SelectItem value="Redfish">Redfish</SelectItem>
                        <SelectItem value="Snook">Snook</SelectItem>
                        <SelectItem value="Tarpon">Tarpon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Water Type</Label>
                    <Select value={waterType} onValueChange={(val: any) => setWaterType(val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select water type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pier">Pier</SelectItem>
                        <SelectItem value="surf">Surf</SelectItem>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="ocean">Ocean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleGetRigs} 
                    className="w-full"
                    disabled={getRigs.isPending}
                  >
                    {getRigs.isPending ? "Analyzing..." : "Get Recommendations"}
                  </Button>
                </CardContent>
              </Card>

              <div className="md:col-span-2 space-y-6">
                {getRigs.data && (
                  <div className="space-y-6">
                    <Card className="bg-card border-card-border shadow-sm overflow-hidden">
                      <div className="bg-sidebar-primary px-4 py-2 flex items-center gap-2">
                        <Anchor className="w-5 h-5 text-sidebar-primary-foreground" />
                        <span className="font-bold text-sidebar-primary-foreground">Primary Rig: {getRigs.data.primaryRig.name}</span>
                      </div>
                      <CardContent className="p-6">
                        <p className="text-foreground mb-4">{getRigs.data.primaryRig.description}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                          <div className="bg-background p-3 rounded border border-border">
                            <p className="text-xs text-muted-foreground uppercase">Hook</p>
                            <p className="font-medium text-foreground">{getRigs.data.primaryRig.hook}</p>
                          </div>
                          <div className="bg-background p-3 rounded border border-border">
                            <p className="text-xs text-muted-foreground uppercase">Sinker</p>
                            <p className="font-medium text-foreground">{getRigs.data.primaryRig.sinker}</p>
                          </div>
                          <div className="bg-background p-3 rounded border border-border">
                            <p className="text-xs text-muted-foreground uppercase">Leader</p>
                            <p className="font-medium text-foreground">{getRigs.data.primaryRig.leader}</p>
                          </div>
                        </div>
                        
                        {getRigs.data.hotTip && (
                          <div className="bg-accent/10 border border-accent/20 p-4 rounded-lg flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-accent mt-0.5" />
                            <div>
                              <p className="font-bold text-accent">Hot Tip</p>
                              <p className="text-sm text-foreground">{getRigs.data.hotTip}</p>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {(getRigs.data.alternativeRigs && getRigs.data.alternativeRigs.length > 0) && (
                      <Card className="bg-card border-card-border shadow-sm">
                        <CardHeader>
                          <CardTitle>Alternatives</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {getRigs.data.alternativeRigs.map((rig, idx) => (
                              <div key={idx} className="border border-border p-4 rounded bg-background">
                                <h4 className="font-bold text-foreground">{rig.name}</h4>
                                <p className="text-sm text-muted-foreground mb-2">{rig.description}</p>
                                <div className="flex gap-4 text-xs font-mono text-foreground/80">
                                  <span>Hook: {rig.hook}</span>
                                  <span>Sinker: {rig.sinker}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="angle">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="md:col-span-1 bg-card border-card-border shadow-sm">
                <CardHeader>
                  <CardTitle>Cast Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Rod Length (ft)</Label>
                    <Input type="number" value={rodLength} onChange={(e) => setRodLength(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Sinker Weight (oz)</Label>
                    <Input type="number" step="any" value={sinkerWeight} onChange={(e) => setSinkerWeight(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Target Distance (ft)</Label>
                    <Input type="number" value={targetDistance} onChange={(e) => setTargetDistance(e.target.value)} />
                  </div>
                  <Button 
                    onClick={handleGetAngle} 
                    className="w-full"
                    disabled={getAngle.isPending}
                  >
                    {getAngle.isPending ? "Calculating..." : "Calculate Angle"}
                  </Button>
                </CardContent>
              </Card>

              <div className="md:col-span-2 space-y-6">
                {getAngle.data && (
                  <Card className="bg-card border-card-border shadow-sm">
                    <CardHeader>
                      <CardTitle>Optimal Release Angle</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <div className="flex items-center justify-center p-8 bg-background border border-border rounded-lg">
                        <div className="relative w-64 h-32 flex items-end justify-center">
                          {/* Semicircle */}
                          <div className="absolute bottom-0 w-64 h-32 border-t-2 border-l-2 border-r-2 border-muted-foreground rounded-t-full"></div>
                          {/* Arc highlight */}
                          <svg className="absolute bottom-0 w-64 h-32" viewBox="0 0 256 128">
                            <path 
                              d={`M 128 128 L 128 16 A 112 112 0 0 1 ${128 + 112 * Math.cos((90 - getAngle.data.optimalAngleDegrees) * Math.PI / 180)} ${128 - 112 * Math.sin((90 - getAngle.data.optimalAngleDegrees) * Math.PI / 180)} Z`} 
                              fill="hsl(var(--primary) / 0.2)" 
                            />
                            <line 
                              x1="128" 
                              y1="128" 
                              x2={128 + 128 * Math.cos((90 - getAngle.data.optimalAngleDegrees) * Math.PI / 180)} 
                              y2={128 - 128 * Math.sin((90 - getAngle.data.optimalAngleDegrees) * Math.PI / 180)} 
                              stroke="hsl(var(--primary))" 
                              strokeWidth="4" 
                            />
                          </svg>
                          <span className="absolute bottom-4 font-bold text-3xl text-foreground">
                            {getAngle.data.optimalAngleDegrees}°
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-background p-4 rounded border border-border">
                          <p className="text-xs text-muted-foreground uppercase">Expected Distance</p>
                          <p className="text-xl font-bold text-foreground">{getAngle.data.expectedDistanceFt} ft</p>
                        </div>
                        <div className="bg-background p-4 rounded border border-border">
                          <p className="text-xs text-muted-foreground uppercase">Technique</p>
                          <p className="text-md font-bold text-foreground">{getAngle.data.technique}</p>
                        </div>
                      </div>

                      {getAngle.data.tips && getAngle.data.tips.length > 0 && (
                        <div>
                          <h4 className="font-bold text-sm uppercase text-muted-foreground mb-2">Tips</h4>
                          <ul className="space-y-2">
                            {getAngle.data.tips.map((tip, idx) => (
                              <li key={idx} className="text-sm text-foreground flex gap-2">
                                <span className="text-primary mt-0.5">•</span>
                                {tip}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
