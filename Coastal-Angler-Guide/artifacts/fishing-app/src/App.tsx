import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import RigPlanner from "@/pages/rig-planner";
import FishId from "@/pages/fish-id";
import WaterMap from "@/pages/water-map";
import CatchLog from "@/pages/catch-log";
import Spots from "@/pages/spots";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/rig-planner" component={RigPlanner} />
      <Route path="/fish-id" component={FishId} />
      <Route path="/water-map" component={WaterMap} />
      <Route path="/catch-log" component={CatchLog} />
      <Route path="/spots" component={Spots} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
