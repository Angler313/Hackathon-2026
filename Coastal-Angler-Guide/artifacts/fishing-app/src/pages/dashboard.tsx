import { Layout } from "@/components/layout";
import { LocationSearch } from "@/components/location-search";
import { MyCatchesHere } from "@/components/my-catches-here";
import { useGetConditions } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Wind, Droplets, Thermometer, Compass, Activity, ArrowRight,
  MapPin, Fish, Waves, ChevronDown, ChevronUp, Bug, Sparkles,
  Clock, Lightbulb, Layers, TreePine, Anchor, Info, Navigation
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface BaitRec {
  species: string;
  topLiveBait?: string;
  topArtificial?: string;
  liveBaits: string[];
  artificials: string[];
  bestTime: string;
  tip: string;
}

interface FishingZone {
  name: string;
  description: string;
  technique: string;
}

interface WaterProfile {
  estimatedDepthFt: { shallow: number; deep: number; avg: number };
  estimatedAcres: number;
  bottomType: string;
  vegetation: string[];
  waterColor: string;
  stockingHistory: string;
  fishingZones: FishingZone[];
  accessPoints: string;
  insiderNotes: string;
}

interface ConditionsData {
  windSpeed: number;
  windDirection: string;
  barometricPressure: number;
  waterTemp: number | null;
  tidalPhase: string;
  waveHeight: number | null;
  salinity: number | null;
  waterClarity: string;
  overallRating: number;
  activityForecast: string;
  tideChart: { time: string; heightFt: number; type: string }[];
}

interface LocationResult {
  resolvedName: string;
  latitude: number;
  longitude: number;
  waterBodyType: string;
  region: string;
  topSpecies: string[];
  baitRecommendations?: BaitRec[];
  waterProfile?: WaterProfile;
  conditions: ConditionsData;
}

function RatingBar({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1 mt-3">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-2 flex-1 rounded-full transition-all"
          style={{
            backgroundColor: i < rating
              ? `hsl(${42 + i * 6}, 90%, ${50 + i * 2}%)`
              : "hsl(var(--muted))",
          }}
        />
      ))}
    </div>
  );
}

function BaitCard({ rec }: { rec: BaitRec }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-border rounded-lg overflow-hidden bg-card"
      data-testid={`bait-card-${rec.species.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/5 transition-colors"
        onClick={() => setOpen(o => !o)}
        data-testid={`bait-toggle-${rec.species.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <div className="flex items-center gap-2">
          <Fish className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-foreground">{rec.species}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border bg-card/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Bug className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Bait</span>
              </div>
              <ul className="space-y-1">
                {(Array.isArray(rec.liveBaits) ? rec.liveBaits : []).map(b => (
                  <li key={b} className={`flex items-start gap-1.5 text-sm ${b === rec.topLiveBait ? "font-semibold text-amber-600" : "text-foreground"}`}>
                    {b === rec.topLiveBait
                      ? <span className="shrink-0" title="Best live bait for today">⭐</span>
                      : <span className="text-emerald-500 mt-0.5 shrink-0">•</span>}
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Artificials</span>
              </div>
              <ul className="space-y-1">
                {(Array.isArray(rec.artificials) ? rec.artificials : []).map(a => (
                  <li key={a} className={`flex items-start gap-1.5 text-sm ${a === rec.topArtificial ? "font-semibold text-amber-600" : "text-foreground"}`}>
                    {a === rec.topArtificial
                      ? <span className="shrink-0" title="Best artificial for today">⭐</span>
                      : <span className="text-violet-400 mt-0.5 shrink-0">•</span>}
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 bg-secondary/10 rounded-md">
            <Clock className="w-3.5 h-3.5 text-secondary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">{rec.bestTime}</p>
          </div>

          <div className="flex items-start gap-2 px-3 py-2 bg-primary/5 border border-primary/15 rounded-md">
            <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground italic">{rec.tip}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoneCard({ zone, index }: { zone: FishingZone; index: number }) {
  const [open, setOpen] = useState(false);
  const colors = ["text-emerald-500", "text-blue-400", "text-amber-500", "text-violet-400", "text-rose-400"];
  const color = colors[index % colors.length];
  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card" data-testid={`zone-card-${index}`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/5 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Navigation className={`w-3.5 h-3.5 ${color} shrink-0`} />
          <span className="text-sm font-semibold text-foreground">{zone.name}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border bg-card/50 pt-3">
          <p className="text-sm text-muted-foreground leading-snug">{zone.description}</p>
          <div className="flex items-start gap-2 px-3 py-2 bg-primary/5 border border-primary/15 rounded-md">
            <Anchor className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-foreground italic">{zone.technique}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function WaterProfileCard({ profile }: { profile: WaterProfile }) {
  return (
    <div className="space-y-3" data-testid="section-water-profile">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-blue-400" />
        <h3 className="text-base font-semibold text-foreground">Water Body Profile</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-card border-card-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Depth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-blue-400">{profile.estimatedDepthFt.shallow}</p>
                <p className="text-xs text-muted-foreground">Shallow</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{profile.estimatedDepthFt.avg}</p>
                <p className="text-xs text-muted-foreground">Average</p>
              </div>
              <div>
                <p className="text-lg font-bold text-primary">{profile.estimatedDepthFt.deep}</p>
                <p className="text-xs text-muted-foreground">Deep</p>
              </div>
            </div>
            <p className="text-xs text-center text-muted-foreground mt-2">feet</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Water Body</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Size</span>
              <span className="text-xs font-medium text-foreground">~{profile.estimatedAcres} acres</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Color</span>
              <span className="text-xs font-medium text-foreground capitalize">{profile.waterColor}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Bottom</span>
              <span className="text-xs font-medium text-foreground text-right max-w-[120px] truncate" title={profile.bottomType}>{profile.bottomType}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <TreePine className="w-3.5 h-3.5 text-emerald-500" />
              Vegetation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {profile.vegetation.map(v => (
                <Badge key={v} variant="outline" className="text-xs text-emerald-600 border-emerald-200 bg-emerald-50/50">
                  {v}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-card-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-amber-500" />
            Stocking &amp; Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Stocking History</p>
            <p className="text-sm text-foreground leading-snug">{profile.stockingHistory}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Access</p>
            <p className="text-sm text-foreground leading-snug">{profile.accessPoints}</p>
          </div>
          <div className="px-3 py-2 bg-amber-500/5 border border-amber-500/20 rounded-md">
            <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide flex items-center gap-1">
              <Lightbulb className="w-3 h-3 text-amber-500" /> Insider Notes
            </p>
            <p className="text-sm text-foreground leading-snug">{profile.insiderNotes}</p>
          </div>
        </CardContent>
      </Card>

      {profile.fishingZones.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Navigation className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Fishing Zones</h4>
            <span className="text-xs text-muted-foreground">— tap to expand</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {profile.fishingZones.map((zone, i) => (
              <ZoneCard key={zone.name} zone={zone} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionsGrid({ conditions, resolvedName, topSpecies, baitRecommendations, waterProfile }: {
  conditions: ConditionsData;
  resolvedName?: string;
  topSpecies?: string[];
  baitRecommendations?: BaitRec[];
  waterProfile?: WaterProfile;
}) {
  const isFreshwater = conditions.tidalPhase === "N/A - Freshwater";

  return (
    <div className="space-y-6">
      {resolvedName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="w-3.5 h-3.5 text-primary" />
          <span>{resolvedName}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-card border-card-border shadow-sm" data-testid="card-activity-rating">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-primary" />
              Activity Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-bold text-foreground">{conditions.overallRating}</span>
              <span className="text-lg text-muted-foreground mb-1">/10</span>
            </div>
            <RatingBar rating={conditions.overallRating} />
            <p className="text-sm text-foreground mt-3 leading-snug">{conditions.activityForecast}</p>
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border shadow-sm" data-testid="card-wind">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Wind className="w-3.5 h-3.5 text-secondary" />
              Wind
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-foreground">{conditions.windSpeed}</span>
              <span className="text-lg text-muted-foreground mb-1">mph</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Compass className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{conditions.windDirection}</span>
            </div>
            {conditions.waveHeight != null && (
              <div className="flex items-center gap-2 mt-2">
                <Waves className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-foreground">{conditions.waveHeight} ft waves</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border shadow-sm" data-testid="card-atmosphere">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Thermometer className="w-3.5 h-3.5 text-destructive" />
              Water &amp; Pressure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Water Temp</p>
                <p className="text-2xl font-bold text-foreground">{conditions.waterTemp != null ? `${conditions.waterTemp}°F` : "--"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Pressure</p>
                <p className="text-2xl font-bold text-foreground">{conditions.barometricPressure}</p>
                <p className="text-xs text-muted-foreground">inHg</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Clarity</p>
                <p className="text-sm font-medium text-foreground capitalize">{conditions.waterClarity}</p>
              </div>
              {conditions.salinity != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Salinity</p>
                  <p className="text-sm font-medium text-foreground">{conditions.salinity} ppt</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {!isFreshwater && (
          <Card className="md:col-span-2 lg:col-span-2 bg-card border-card-border shadow-sm" data-testid="card-tide">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Droplets className="w-3.5 h-3.5 text-accent" />
                Tide Chart
              </CardTitle>
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                {conditions.tidalPhase}
              </span>
            </CardHeader>
            <CardContent>
              {conditions.tideChart && conditions.tideChart.length > 0 ? (
                <div className="h-40 w-full mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={conditions.tideChart}>
                      <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={30} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "6px", fontSize: 12 }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(v: number) => [`${v} ft`, "Height"]}
                      />
                      <Line type="monotone" dataKey="heightFt" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--background))", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                  No tide data available
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {topSpecies && topSpecies.length > 0 && !baitRecommendations?.length && (
          <Card className="bg-card border-card-border shadow-sm" data-testid="card-top-species">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                <Fish className="w-3.5 h-3.5 text-primary" />
                Top Species
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {topSpecies.map(s => (
                  <Badge key={s} variant="secondary" className="text-xs font-medium" data-testid={`badge-species-${s.replace(/\s+/g, "-").toLowerCase()}`}>
                    {s}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {waterProfile && <WaterProfileCard profile={waterProfile} />}

      {baitRecommendations && baitRecommendations.length > 0 && (
        <div className="space-y-3" data-testid="section-bait-recommendations">
          <div className="flex items-center gap-2">
            <Bug className="w-4 h-4 text-emerald-500" />
            <h3 className="text-base font-semibold text-foreground">Bait &amp; Lure Guide</h3>
            <span className="text-xs text-muted-foreground">— tap a species to expand</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {baitRecommendations.map(rec => (
              <BaitCard key={rec.species} rec={rec} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [activeLocation, setActiveLocation] = useState<LocationResult | null>(null);
  const getConditions = useGetConditions();

  useEffect(() => {
    getConditions.mutate({
      data: { latitude: 29.28, longitude: -94.78, waterBodyType: "pier" }
    });
  }, []);

  const handleSearchResult = (result: LocationResult) => {
    setActiveLocation(result);
  };

  const defaultConditions = getConditions.data as ConditionsData | undefined;
  const displayConditions = activeLocation ? activeLocation.conditions : defaultConditions;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground">Current Conditions</h2>
          <p className="text-muted-foreground mt-1">Search any body of water — ocean, lake, community pond, or private fishing hole</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <LocationSearch onResult={handleSearchResult} />
          {activeLocation && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground shrink-0"
              data-testid="button-reset-location"
              onClick={() => setActiveLocation(null)}
            >
              Reset to default
            </Button>
          )}
        </div>

        {activeLocation && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
              <MapPin className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">{activeLocation.resolvedName}</p>
                <p className="text-xs text-muted-foreground">{activeLocation.region} &middot; {activeLocation.waterBodyType} &middot; {activeLocation.latitude.toFixed(4)}, {activeLocation.longitude.toFixed(4)}</p>
              </div>
            </div>
            {activeLocation.latitude && activeLocation.longitude && (
              <div className="rounded-lg overflow-hidden border border-border h-48">
                <iframe
                  title="Map"
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${activeLocation.longitude - 0.05},${activeLocation.latitude - 0.05},${activeLocation.longitude + 0.05},${activeLocation.latitude + 0.05}&layer=mapnik&marker=${activeLocation.latitude},${activeLocation.longitude}`}
                  className="w-full h-full"
                />
              </div>
            )}
          </div>
        )}

        {getConditions.isPending && !activeLocation ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-40 w-full bg-card" />)}
          </div>
        ) : displayConditions ? (
          <>
            <ConditionsGrid
              conditions={displayConditions}
              resolvedName={activeLocation?.resolvedName}
              topSpecies={activeLocation?.topSpecies}
              baitRecommendations={activeLocation?.baitRecommendations}
              waterProfile={activeLocation?.waterProfile}
            />
            {activeLocation && (
              <MyCatchesHere
                locationName={activeLocation.resolvedName}
                resolvedName={activeLocation.resolvedName}
                aiSpecies={activeLocation.topSpecies ?? []}
              />
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            Search a location above to see conditions
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {[
            { href: "/rig-planner", label: "Rig & Bait Planner" },
            { href: "/fish-id", label: "Identify Catch" },
            { href: "/water-map", label: "Analyze Water" },
            { href: "/catch-log", label: "Log a Catch" },
          ].map(({ href, label }) => (
            <Link key={href} href={href}>
              <Button variant="outline" className="w-full h-auto py-4 justify-between text-sm group hover-elevate" data-testid={`button-nav-${label.replace(/\s+/g, "-").toLowerCase()}`}>
                {label}
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </Button>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
