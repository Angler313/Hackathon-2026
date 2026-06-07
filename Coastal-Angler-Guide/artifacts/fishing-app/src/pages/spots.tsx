import { Layout } from "@/components/layout";
import { useListSpots, useCreateSpot, useDeleteSpot, getListSpotsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function Spots() {
  const { data: spots, isLoading } = useListSpots();
  const createSpot = useCreateSpot();
  const deleteSpot = useDeleteSpot();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [type, setType] = useState("pier");
  const [notes, setNotes] = useState("");

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createSpot.mutate({
      data: {
        name,
        latitude: parseFloat(lat),
        longitude: parseFloat(lon),
        waterBodyType: type,
        notes
      }
    }, {
      onSuccess: () => {
        setName(""); setLat(""); setLon(""); setNotes("");
        queryClient.invalidateQueries({ queryKey: getListSpotsQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteSpot.mutate(id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSpotsQueryKey() });
      }
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-serif font-bold text-foreground">My Spots</h2>
          <p className="text-muted-foreground">Keep track of your most productive waters</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <Card className="bg-card border-card-border shadow-sm">
              <CardHeader>
                <CardTitle>Add New Spot</CardTitle>
                <CardDescription>Save coordinates and notes for later.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Spot Name</Label>
                    <Input id="name" required value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="lat">Latitude</Label>
                      <Input id="lat" type="number" step="any" required value={lat} onChange={e => setLat(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lon">Longitude</Label>
                      <Input id="lon" type="number" step="any" required value={lon} onChange={e => setLon(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Water Type</Label>
                    <Input id="type" value={type} onChange={e => setType(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createSpot.isPending}>
                    {createSpot.isPending ? "Saving..." : "Save Spot"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading spots...</div>
            ) : Array.isArray(spots) && spots.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {spots.map((spot) => (
                  <Card key={spot.id} className="bg-card border-card-border shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-sidebar-primary/20 px-4 py-3 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-sidebar-primary" />
                        <h3 className="font-bold text-foreground">{spot.name}</h3>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(spot.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <CardContent className="p-4 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs uppercase bg-muted text-muted-foreground px-2 py-1 rounded font-bold">{spot.waterBodyType}</span>
                        <span className="text-xs text-muted-foreground font-mono">{spot.latitude.toFixed(4)}, {spot.longitude.toFixed(4)}</span>
                      </div>
                      <p className="text-sm text-foreground flex-1">{spot.notes || "No notes."}</p>
                      <p className="text-xs text-muted-foreground mt-4">Added {format(new Date(spot.createdAt), "MMM d, yyyy")}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 border border-dashed border-border rounded-lg bg-card/50">
                <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-bold text-foreground mb-1">No spots saved</h3>
                <p className="text-muted-foreground">Save your favorite fishing locations here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
