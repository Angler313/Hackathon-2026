import { Layout } from "@/components/layout";
import {
  useListCatches, useGetCatchStats, useCreateCatch, useDeleteCatch, useClearAllCatches,
  getListCatchesQueryKey, getGetCatchStatsQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";

export default function CatchLog() {
  const { data: catches, isLoading: loadingCatches } = useListCatches();
  const { data: stats, isLoading: loadingStats } = useGetCatchStats();
  const createCatch = useCreateCatch();
  const deleteCatch = useDeleteCatch();
  const clearAllCatches = useClearAllCatches();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [species, setSpecies] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [waterType, setWaterType] = useState("pier");
  const [rig, setRig] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCatchesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetCatchStatsQueryKey() });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    createCatch.mutate(
      { data: { species, weightKg: parseFloat(weight) || 0, lengthCm: parseFloat(length) || 0, waterBodyType: waterType, rigUsed: rig } },
      { onSuccess: () => { setAddOpen(false); setSpecies(""); setWeight(""); setLength(""); setRig(""); invalidate(); } }
    );
  };

  const handleDelete = (id: number) => {
    setDeletingId(id);
    deleteCatch.mutate({ id }, { onSuccess: () => { setDeletingId(null); invalidate(); } });
  };

  const handleClearAll = () => {
    clearAllCatches.mutate(undefined, {
      onSuccess: () => { setClearOpen(false); invalidate(); }
    });
  };

  const catchList = catches as Array<{ id: number; species: string; weightKg: number; lengthCm: number; waterBodyType: string; rigUsed: string | null; caughtAt: string }> | undefined;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-serif font-bold text-foreground">Catch Log</h2>
            <p className="text-muted-foreground">Your personal fishing journal</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Clear All */}
            <Dialog open={clearOpen} onOpenChange={setClearOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/5" data-testid="button-clear-all">
                  <RotateCcw className="w-4 h-4 mr-1.5" />
                  Clear Log
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-5 h-5" />
                    Clear entire catch log?
                  </DialogTitle>
                  <DialogDescription>
                    This will permanently delete all {catchList?.length ?? 0} catch entries and reset your stats to zero. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 mt-2">
                  <Button variant="ghost" onClick={() => setClearOpen(false)}>Cancel</Button>
                  <Button
                    variant="destructive"
                    onClick={handleClearAll}
                    disabled={clearAllCatches.isPending}
                    data-testid="button-confirm-clear-all"
                  >
                    {clearAllCatches.isPending ? "Clearing..." : "Yes, clear everything"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Log new catch */}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-log-catch">
                  <Plus className="w-4 h-4 mr-2" /> Log Catch
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Log a New Catch</DialogTitle>
                  <DialogDescription>Fill in the details about your catch.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="species">Species</Label>
                    <Input id="species" required value={species} onChange={e => setSpecies(e.target.value)} placeholder="e.g. Largemouth Bass" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <Input id="weight" type="number" step="any" min="0" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.0" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="length">Length (cm)</Label>
                      <Input id="length" type="number" step="any" min="0" value={length} onChange={e => setLength(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="water">Water Type</Label>
                      <Input id="water" value={waterType} onChange={e => setWaterType(e.target.value)} placeholder="pier, lake, river…" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="rig">Rig Used</Label>
                      <Input id="rig" value={rig} onChange={e => setRig(e.target.value)} placeholder="Texas rig, Carolina…" />
                    </div>
                  </div>
                  <DialogFooter className="mt-4">
                    <Button type="submit" disabled={createCatch.isPending}>
                      {createCatch.isPending ? "Saving..." : "Save Catch"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats */}
        {loadingStats ? (
          <Skeleton className="h-24 w-full bg-card" />
        ) : stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-card">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <p className="text-xs uppercase text-muted-foreground font-bold mb-1">Total Catches</p>
                <p className="text-3xl font-bold text-foreground">{stats.totalCatches}</p>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <p className="text-xs uppercase text-muted-foreground font-bold mb-1">Heaviest (kg)</p>
                <p className="text-3xl font-bold text-foreground">{stats.heaviestCatch ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-card md:col-span-2">
              <CardContent className="p-4 flex flex-col justify-center h-full">
                <p className="text-xs uppercase text-muted-foreground font-bold mb-2">Top Species</p>
                <div className="flex flex-wrap gap-2">
                  {stats.topSpecies.length > 0 ? stats.topSpecies.map(sp => (
                    <span key={sp} className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded text-xs font-bold">{sp}</span>
                  )) : <span className="text-sm text-muted-foreground">No data</span>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Catch table */}
        <Card className="bg-card border-card-border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Recent Catches</CardTitle>
            {catchList && catchList.length > 0 && (
              <p className="text-xs text-muted-foreground">{catchList.length} {catchList.length === 1 ? "entry" : "entries"} — tap 🗑 to delete one</p>
            )}
          </CardHeader>
          <CardContent>
            {loadingCatches ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : catchList && catchList.length > 0 ? (
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Species</TableHead>
                      <TableHead>Weight (kg)</TableHead>
                      <TableHead>Length (cm)</TableHead>
                      <TableHead className="hidden md:table-cell">Water Type</TableHead>
                      <TableHead className="hidden md:table-cell">Rig</TableHead>
                      <TableHead className="w-10 text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catchList.map(entry => (
                      <TableRow key={entry.id} className="group">
                        <TableCell className="font-medium whitespace-nowrap">
                          {format(new Date(entry.caughtAt), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="font-medium">{entry.species}</TableCell>
                        <TableCell>{entry.weightKg}</TableCell>
                        <TableCell>{entry.lengthCm}</TableCell>
                        <TableCell className="hidden md:table-cell capitalize">{entry.waterBodyType}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{entry.rigUsed || "—"}</TableCell>
                        <TableCell className="text-right pr-3">
                          <button
                            onClick={() => handleDelete(entry.id)}
                            disabled={deletingId === entry.id}
                            data-testid={`button-delete-catch-${entry.id}`}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
                            title="Delete this catch"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No catches logged yet — get out there.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
