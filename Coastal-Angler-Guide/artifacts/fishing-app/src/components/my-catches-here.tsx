import { useState } from "react";
import { useGetLocationObservations, useAddLocationObservation, useDeleteLocationObservation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Plus, X, BookOpen, Loader2 } from "lucide-react";

interface MyCatchesHereProps {
  locationName: string;
  resolvedName: string;
  aiSpecies: string[];
}

export function MyCatchesHere({ locationName, resolvedName, aiSpecies }: MyCatchesHereProps) {
  const [addingSpecies, setAddingSpecies] = useState(false);
  const [newSpecies, setNewSpecies] = useState("");

  const { data: observations = [], refetch } = useGetLocationObservations(
    { locationName },
    { query: { staleTime: 0 } }
  );

  const addObservation = useAddLocationObservation();
  const deleteObservation = useDeleteLocationObservation();

  const confirmedSpecies = new Set((observations as Array<{ species: string }>).map(o => o.species));

  const handleAdd = async (species: string) => {
    if (!species.trim() || confirmedSpecies.has(species.trim())) return;
    await addObservation.mutateAsync({
      data: { locationName, resolvedName, species: species.trim() }
    });
    refetch();
    setNewSpecies("");
    setAddingSpecies(false);
  };

  const handleDelete = async (id: number) => {
    await deleteObservation.mutateAsync({ id });
    refetch();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd(newSpecies);
    if (e.key === "Escape") { setAddingSpecies(false); setNewSpecies(""); }
  };

  const obs = observations as Array<{ id: number; species: string; notes: string | null; observedAt: string }>;

  return (
    <Card className="bg-card border-card-border shadow-sm" data-testid="card-my-catches-here">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
            My Catches Here
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {obs.length === 0 ? "None logged yet" : `${obs.length} species confirmed`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-snug">
          Log species you've actually caught here to override AI guesses. Checkmarks = verified by you.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* AI-suggested species with verified overlay */}
        {aiSpecies.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">AI suggestions — tap ✓ if you've caught it:</p>
            <div className="flex flex-wrap gap-2">
              {aiSpecies.map(species => {
                const isConfirmed = confirmedSpecies.has(species);
                return (
                  <button
                    key={species}
                    onClick={() => isConfirmed ? null : handleAdd(species)}
                    disabled={isConfirmed || addObservation.isPending}
                    data-testid={`ai-species-${species.replace(/\s+/g, "-").toLowerCase()}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      isConfirmed
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 cursor-default"
                        : "bg-card border-border text-muted-foreground hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-500/5 cursor-pointer"
                    }`}
                  >
                    {isConfirmed && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                    {species}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Manually logged entries not in AI list */}
        {obs.filter(o => !aiSpecies.includes(o.species)).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Also caught here (not in AI list):</p>
            <div className="flex flex-wrap gap-2">
              {obs.filter(o => !aiSpecies.includes(o.species)).map(o => (
                <Badge
                  key={o.id}
                  variant="secondary"
                  className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 border-emerald-200 hover:bg-emerald-500/15"
                  data-testid={`confirmed-species-${o.species.replace(/\s+/g, "-").toLowerCase()}`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {o.species}
                  <button
                    onClick={() => handleDelete(o.id)}
                    className="ml-0.5 hover:text-destructive transition-colors"
                    data-testid={`delete-observation-${o.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Add custom species */}
        {addingSpecies ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={newSpecies}
              onChange={e => setNewSpecies(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='e.g. "Blue Catfish", "Carp"'
              className="text-sm h-8"
              data-testid="input-add-species"
            />
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={() => handleAdd(newSpecies)}
              disabled={!newSpecies.trim() || addObservation.isPending}
              data-testid="button-confirm-add-species"
            >
              {addObservation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 shrink-0" onClick={() => { setAddingSpecies(false); setNewSpecies(""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 gap-1.5"
            onClick={() => setAddingSpecies(true)}
            data-testid="button-add-species"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a species not listed
          </Button>
        )}

        {obs.length > 0 && (
          <p className="text-xs text-muted-foreground pt-1">
            ✓ Confirmed species are saved for this location and will persist across sessions.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
